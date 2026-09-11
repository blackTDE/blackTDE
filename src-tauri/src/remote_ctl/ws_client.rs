use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::process::ProcessManager;
use crate::remote_ctl::lark::clean_base_url;
use crate::remote_ctl::router;
use crate::remote_ctl::webhook::extract_lark_message;
use crate::remote_ctl::RemoteControlManager;

// ── Protobuf PBBP2 Encoding / Decoding ─────────────────────────────────────────

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PbHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PbFrame {
    pub seq_id: u64,
    pub log_id: u64,
    pub service: i32,
    pub method: i32,
    pub headers: Vec<PbHeader>,
    pub payload_encoding: Option<String>,
    pub payload_type: Option<String>,
    pub payload: Vec<u8>,
    pub log_id_new: Option<String>,
}

fn encode_varint(mut val: u64, buf: &mut Vec<u8>) {
    while val >= 0x80 {
        buf.push(((val & 0x7F) | 0x80) as u8);
        val >>= 7;
    }
    buf.push((val & 0x7F) as u8);
}

fn decode_varint(slice: &[u8], pos: &mut usize) -> Result<u64, String> {
    let mut result = 0u64;
    let mut shift = 0;
    while *pos < slice.len() {
        let byte = slice[*pos];
        *pos += 1;
        result |= ((byte & 0x7F) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok(result);
        }
        shift += 7;
        if shift > 64 {
            return Err("Varint overflow".to_string());
        }
    }
    Err("Unexpected EOF in varint".to_string())
}

impl PbHeader {
    pub fn encode(&self, buf: &mut Vec<u8>) {
        // Field 1: key (string)
        encode_varint((1 << 3) | 2, buf);
        encode_varint(self.key.len() as u64, buf);
        buf.extend_from_slice(self.key.as_bytes());

        // Field 2: value (string)
        encode_varint((2 << 3) | 2, buf);
        encode_varint(self.value.len() as u64, buf);
        buf.extend_from_slice(self.value.as_bytes());
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, String> {
        let mut pos = 0;
        let mut header = PbHeader::default();

        while pos < bytes.len() {
            let tag = decode_varint(bytes, &mut pos)?;
            let field_num = tag >> 3;
            let wire_type = tag & 0x07;

            match (field_num, wire_type) {
                (1, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("Header key out of bounds".to_string());
                    }
                    header.key = String::from_utf8_lossy(&bytes[pos..pos + len]).to_string();
                    pos += len;
                }
                (2, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("Header value out of bounds".to_string());
                    }
                    header.value = String::from_utf8_lossy(&bytes[pos..pos + len]).to_string();
                    pos += len;
                }
                _ => {
                    skip_field(bytes, &mut pos, wire_type)?;
                }
            }
        }

        Ok(header)
    }
}

impl PbFrame {
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(128);

        // Field 1: SeqID (uint64)
        encode_varint((1 << 3) | 0, &mut buf);
        encode_varint(self.seq_id, &mut buf);

        // Field 2: LogID (uint64)
        encode_varint((2 << 3) | 0, &mut buf);
        encode_varint(self.log_id, &mut buf);

        // Field 3: service (int32)
        encode_varint((3 << 3) | 0, &mut buf);
        encode_varint(self.service as u64, &mut buf);

        // Field 4: method (int32)
        encode_varint((4 << 3) | 0, &mut buf);
        encode_varint(self.method as u64, &mut buf);

        // Field 5: headers (repeated Header)
        for h in &self.headers {
            let mut h_buf = Vec::new();
            h.encode(&mut h_buf);
            encode_varint((5 << 3) | 2, &mut buf);
            encode_varint(h_buf.len() as u64, &mut buf);
            buf.extend_from_slice(&h_buf);
        }

        // Field 6: payload_encoding (string)
        if let Some(ref enc) = self.payload_encoding {
            encode_varint((6 << 3) | 2, &mut buf);
            encode_varint(enc.len() as u64, &mut buf);
            buf.extend_from_slice(enc.as_bytes());
        }

        // Field 7: payload_type (string)
        if let Some(ref pt) = self.payload_type {
            encode_varint((7 << 3) | 2, &mut buf);
            encode_varint(pt.len() as u64, &mut buf);
            buf.extend_from_slice(pt.as_bytes());
        }

        // Field 8: payload (bytes)
        if !self.payload.is_empty() {
            encode_varint((8 << 3) | 2, &mut buf);
            encode_varint(self.payload.len() as u64, &mut buf);
            buf.extend_from_slice(&self.payload);
        }

        // Field 9: LogIDNew (string)
        if let Some(ref lid) = self.log_id_new {
            encode_varint((9 << 3) | 2, &mut buf);
            encode_varint(lid.len() as u64, &mut buf);
            buf.extend_from_slice(lid.as_bytes());
        }

        buf
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, String> {
        let mut pos = 0;
        let mut frame = PbFrame::default();

        while pos < bytes.len() {
            let tag = decode_varint(bytes, &mut pos)?;
            let field_num = tag >> 3;
            let wire_type = tag & 0x07;

            match (field_num, wire_type) {
                (1, 0) => {
                    frame.seq_id = decode_varint(bytes, &mut pos)?;
                }
                (2, 0) => {
                    frame.log_id = decode_varint(bytes, &mut pos)?;
                }
                (3, 0) => {
                    frame.service = decode_varint(bytes, &mut pos)? as i32;
                }
                (4, 0) => {
                    frame.method = decode_varint(bytes, &mut pos)? as i32;
                }
                (5, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("Header bytes out of bounds".to_string());
                    }
                    let header = PbHeader::decode(&bytes[pos..pos + len])?;
                    frame.headers.push(header);
                    pos += len;
                }
                (6, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("payload_encoding out of bounds".to_string());
                    }
                    frame.payload_encoding = Some(String::from_utf8_lossy(&bytes[pos..pos + len]).to_string());
                    pos += len;
                }
                (7, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("payload_type out of bounds".to_string());
                    }
                    frame.payload_type = Some(String::from_utf8_lossy(&bytes[pos..pos + len]).to_string());
                    pos += len;
                }
                (8, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("payload out of bounds".to_string());
                    }
                    frame.payload = bytes[pos..pos + len].to_vec();
                    pos += len;
                }
                (9, 2) => {
                    let len = decode_varint(bytes, &mut pos)? as usize;
                    if pos + len > bytes.len() {
                        return Err("LogIDNew out of bounds".to_string());
                    }
                    frame.log_id_new = Some(String::from_utf8_lossy(&bytes[pos..pos + len]).to_string());
                    pos += len;
                }
                _ => {
                    skip_field(bytes, &mut pos, wire_type)?;
                }
            }
        }

        Ok(frame)
    }

    pub fn get_header(&self, key: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|h| h.key.eq_ignore_ascii_case(key))
            .map(|h| h.value.as_str())
    }
}

fn skip_field(slice: &[u8], pos: &mut usize, wire_type: u64) -> Result<(), String> {
    match wire_type {
        0 => {
            decode_varint(slice, pos)?;
            Ok(())
        }
        1 => {
            if *pos + 8 > slice.len() {
                return Err("64-bit field out of bounds".to_string());
            }
            *pos += 8;
            Ok(())
        }
        2 => {
            let len = decode_varint(slice, pos)? as usize;
            if *pos + len > slice.len() {
                return Err("Length-delimited field out of bounds".to_string());
            }
            *pos += len;
            Ok(())
        }
        5 => {
            if *pos + 4 > slice.len() {
                return Err("32-bit field out of bounds".to_string());
            }
            *pos += 4;
            Ok(())
        }
        _ => Err(format!("Unsupported wire type: {}", wire_type)),
    }
}

pub fn create_ping_frame(service_id: i32) -> PbFrame {
    PbFrame {
        seq_id: 0,
        log_id: 0,
        service: service_id,
        method: 0, // CONTROL
        headers: vec![PbHeader {
            key: "type".to_string(),
            value: "ping".to_string(),
        }],
        payload_encoding: None,
        payload_type: None,
        payload: Vec::new(),
        log_id_new: None,
    }
}

pub fn create_ack_frame(incoming: &PbFrame) -> PbFrame {
    let mut ack = incoming.clone();
    ack.headers.push(PbHeader {
        key: "biz_rt".to_string(),
        value: "1".to_string(),
    });
    ack.payload = b"{\"code\":200}".to_vec();
    ack
}

// ── WebSocket Endpoint Discovery ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct WsEndpointResponse {
    code: i32,
    msg: String,
    data: Option<WsEndpointData>,
}

#[derive(Debug, Deserialize)]
struct WsEndpointData {
    #[serde(rename = "URL")]
    url: String,
    #[serde(rename = "ClientConfig")]
    client_config: Option<WsClientConfig>,
}

#[derive(Debug, Deserialize)]
struct WsClientConfig {
    #[serde(default = "default_ping_interval")]
    ping_interval: Option<u64>,
}

fn default_ping_interval() -> Option<u64> {
    Some(120)
}

pub async fn get_ws_endpoint_url(
    base_url: &str,
    app_id: &str,
    app_secret: &str,
) -> Result<(String, u64), String> {
    let endpoint = clean_base_url(base_url);
    let url = format!("{}/callback/ws/endpoint", endpoint);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let body = serde_json::json!({
        "AppID": app_id.trim(),
        "AppSecret": app_secret.trim(),
    });

    let res = client
        .post(&url)
        .header("locale", "zh")
        .header("User-Agent", "black-tde-remote-ctl/1.0")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lark/Feishu WS endpoint handshake request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("WS endpoint HTTP {}: {}", status, err_text));
    }

    let parsed: WsEndpointResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse WS endpoint response: {}", e))?;

    if parsed.code != 0 {
        return Err(format!("WS endpoint error {}: {}", parsed.code, parsed.msg));
    }

    let data = parsed
        .data
        .ok_or_else(|| "Missing data in WS endpoint response".to_string())?;

    if data.url.is_empty() {
        return Err("Received empty WebSocket URL from Lark/Feishu endpoint".to_string());
    }

    let ping_interval = data
        .client_config
        .and_then(|c| c.ping_interval)
        .unwrap_or(120);

    Ok((data.url, ping_interval))
}

fn extract_query_param(url_str: &str, key: &str) -> Option<String> {
    if let Ok(parsed) = url::Url::parse(url_str) {
        for (k, v) in parsed.query_pairs() {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

// ── Persistent WebSocket Connection Loop ──────────────────────────────────────

pub async fn run_lark_ws_client(
    base_url: String,
    app_id: String,
    app_secret: String,
    cancel_flag: Arc<AtomicBool>,
    pool: SqlitePool,
    manager: ProcessManager,
    remote_mgr: RemoteControlManager,
    app_handle: AppHandle,
) {
    let p_key = "lark".to_string();
    let mut retry_count = 0;

    println!("[Lark Persistent WS] Starting persistent connection client...");

    while !cancel_flag.load(Ordering::Relaxed) {
        // Step 1: Endpoint discovery
        let endpoint_res = get_ws_endpoint_url(&base_url, &app_id, &app_secret).await;
        let (wss_url, ping_interval) = match endpoint_res {
            Ok(pair) => {
                retry_count = 0;
                pair
            }
            Err(err) => {
                eprintln!("[Lark Persistent WS] Handshake failed: {}", err);
                remote_mgr
                    .bot_errors
                    .lock()
                    .unwrap()
                    .insert(p_key.clone(), err);

                retry_count += 1;
                let backoff = (retry_count * 3).min(30);
                tokio::time::sleep(Duration::from_secs(backoff)).await;
                continue;
            }
        };

        let service_id: i32 = extract_query_param(&wss_url, "service_id")
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(0);

        println!(
            "[Lark Persistent WS] Connecting to persistent endpoint (service_id: {})...",
            service_id
        );

        // Step 2: Establish WebSocket Connection
        match tokio_tungstenite::connect_async(&wss_url).await {
            Ok((ws_stream, _response)) => {
                println!("[Lark Persistent WS] Connected successfully!");
                // Clear any previous error
                remote_mgr.bot_errors.lock().unwrap().remove(&p_key);

                let (mut ws_write, mut ws_read) = ws_stream.split();

                // Channel for outgoing frames (pings and ACKs)
                let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PbFrame>();

                // Task 1: Writer pump
                let cancel_writer = cancel_flag.clone();
                let writer_handle = tokio::spawn(async move {
                    while !cancel_writer.load(Ordering::Relaxed) {
                        if let Some(frame) = rx.recv().await {
                            let bytes = frame.encode();
                            if let Err(e) = ws_write.send(Message::Binary(bytes.into())).await {
                                eprintln!("[Lark Persistent WS] Write error: {}", e);
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                });

                // Task 2: Heartbeat ping timer
                let tx_ping = tx.clone();
                let cancel_ping = cancel_flag.clone();
                let ping_handle = tokio::spawn(async move {
                    while !cancel_ping.load(Ordering::Relaxed) {
                        tokio::time::sleep(Duration::from_secs(ping_interval.max(30))).await;
                        if cancel_ping.load(Ordering::Relaxed) {
                            break;
                        }
                        let ping_frame = create_ping_frame(service_id);
                        if tx_ping.send(ping_frame).is_err() {
                            break;
                        }
                    }
                });

                // Task 3: Reader loop (reads events & replies with ACK)
                while !cancel_flag.load(Ordering::Relaxed) {
                    tokio::select! {
                        msg_opt = ws_read.next() => {
                            match msg_opt {
                                Some(Ok(Message::Binary(bytes))) => {
                                    if let Ok(frame) = PbFrame::decode(&bytes) {
                                        // Handle Control Frames (Ping/Pong)
                                        if frame.method == 0 {
                                            if frame.get_header("type") == Some("pong") {
                                                // Connection alive
                                            }
                                            continue;
                                        }

                                        // Handle Data Frames (Events)
                                        if frame.method == 1 {
                                            // Send ACK immediately to avoid timeout
                                            let ack = create_ack_frame(&frame);
                                            let _ = tx.send(ack);

                                            // Process Event Payload
                                            if !frame.payload.is_empty() {
                                                let payload_bytes = frame.payload.clone();
                                                let pool_c = pool.clone();
                                                let mgr_c = manager.clone();
                                                let app_c = app_handle.clone();

                                                tokio::spawn(async move {
                                                    if let Ok(val) = serde_json::from_slice::<Value>(&payload_bytes) {
                                                        if let Some((chat_id, user_name, text)) = extract_lark_message(&val) {
                                                            println!(
                                                                "[Lark Persistent WS] Received message: chat_id={}, user={:?}, text={}",
                                                                chat_id, user_name, text
                                                            );

                                                            if let Err(e) = router::handle_incoming_message(
                                                                "lark",
                                                                &chat_id,
                                                                user_name.as_deref(),
                                                                &text,
                                                                &pool_c,
                                                                &mgr_c,
                                                                &app_c,
                                                            ).await {
                                                                eprintln!("[Lark Persistent WS] Message dispatch failed: {}", e);
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                        }
                                    }
                                }
                                Some(Ok(Message::Ping(p))) => {
                                    // Raw WS Ping -> Pong is handled automatically by tungstenite
                                    let _ = p;
                                }
                                Some(Ok(Message::Close(_))) | None => {
                                    eprintln!("[Lark Persistent WS] Stream closed by remote");
                                    break;
                                }
                                Some(Err(e)) => {
                                    eprintln!("[Lark Persistent WS] Read error: {}", e);
                                    break;
                                }
                                _ => {}
                            }
                        }
                        _ = tokio::time::sleep(Duration::from_millis(500)) => {
                            if cancel_flag.load(Ordering::Relaxed) {
                                break;
                            }
                        }
                    }
                }

                ping_handle.abort();
                writer_handle.abort();
            }
            Err(e) => {
                let err_msg = format!("WebSocket connect failed: {}", e);
                eprintln!("[Lark Persistent WS] {}", err_msg);
                remote_mgr
                    .bot_errors
                    .lock()
                    .unwrap()
                    .insert(p_key.clone(), err_msg);
            }
        }

        if !cancel_flag.load(Ordering::Relaxed) {
            println!("[Lark Persistent WS] Reconnecting in 5 seconds...");
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }

    println!("[Lark Persistent WS] Client stopped.");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pb_frame_roundtrip() {
        let frame = PbFrame {
            seq_id: 123456789,
            log_id: 987654321,
            service: 42,
            method: 1,
            headers: vec![
                PbHeader {
                    key: "type".to_string(),
                    value: "event".to_string(),
                },
                PbHeader {
                    key: "message_id".to_string(),
                    value: "msg_abc".to_string(),
                },
            ],
            payload_encoding: Some("utf-8".to_string()),
            payload_type: Some("json".to_string()),
            payload: b"{\"test\":true}".to_vec(),
            log_id_new: Some("log_xyz".to_string()),
        };

        let encoded = frame.encode();
        let decoded = PbFrame::decode(&encoded).expect("should decode frame");

        assert_eq!(decoded.seq_id, 123456789);
        assert_eq!(decoded.log_id, 987654321);
        assert_eq!(decoded.service, 42);
        assert_eq!(decoded.method, 1);
        assert_eq!(decoded.headers.len(), 2);
        assert_eq!(decoded.get_header("type"), Some("event"));
        assert_eq!(decoded.get_header("message_id"), Some("msg_abc"));
        assert_eq!(decoded.payload_encoding, Some("utf-8".to_string()));
        assert_eq!(decoded.payload, b"{\"test\":true}");
    }

    #[test]
    fn test_create_ping_and_ack() {
        let ping = create_ping_frame(100);
        assert_eq!(ping.method, 0);
        assert_eq!(ping.get_header("type"), Some("ping"));

        let mut data_frame = PbFrame::default();
        data_frame.method = 1;
        data_frame.headers.push(PbHeader {
            key: "message_id".to_string(),
            value: "msg_1".to_string(),
        });

        let ack = create_ack_frame(&data_frame);
        assert_eq!(ack.get_header("biz_rt"), Some("1"));
        assert_eq!(ack.payload, b"{\"code\":200}");
    }
}
