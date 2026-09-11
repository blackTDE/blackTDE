use serde_json::Value;
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::process::ProcessManager;
use crate::remote_ctl::router;
use crate::remote_ctl::RemoteControlManager;

pub const DEFAULT_LARK_WEBHOOK_PORT: u16 = 19828;

pub fn find_header_end(buf: &[u8]) -> Option<usize> {
    for i in 0..buf.len().saturating_sub(3) {
        if buf[i] == b'\r' && buf[i + 1] == b'\n' && buf[i + 2] == b'\r' && buf[i + 3] == b'\n' {
            return Some(i);
        }
    }
    None
}

pub fn parse_content_length(headers: &str) -> usize {
    for line in headers.lines() {
        let lower = line.to_lowercase();
        if lower.starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                if let Ok(num) = val.trim().parse::<usize>() {
                    return num;
                }
            }
        }
    }
    0
}

/// Extracts (chat_id, user_name, text) from Lark/Feishu event webhook payload.
pub fn extract_lark_message(body: &Value) -> Option<(String, Option<String>, String)> {
    // Check v2 schema: header.event_type == "im.message.receive_v1"
    let event = body.get("event")?;
    let message = event.get("message");

    let chat_id = if let Some(msg) = message {
        msg.get("chat_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    } else {
        None
    }
    .or_else(|| {
        event
            .get("open_chat_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })
    .or_else(|| {
        event
            .get("sender")
            .and_then(|s| s.get("sender_id"))
            .and_then(|sid| sid.get("open_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })
    .or_else(|| {
        event
            .get("open_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })
    .or_else(|| {
        body.get("chat_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })?;

    let user_name = event
        .get("sender")
        .and_then(|s| s.get("sender_id"))
        .and_then(|sid| sid.get("open_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            event
                .get("open_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            body.get("user_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    // Extract text content
    let raw_content = if let Some(msg) = message {
        msg.get("content").and_then(|v| v.as_str())
    } else {
        None
    };

    let text = if let Some(content_str) = raw_content {
        // Lark content is serialized JSON string, e.g. {"text":"hello"}
        if let Ok(parsed) = serde_json::from_str::<Value>(content_str) {
            parsed
                .get("text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| content_str.to_string())
        } else {
            content_str.to_string()
        }
    } else if let Some(t) = event.get("text_without_at_bot").and_then(|v| v.as_str()) {
        t.to_string()
    } else if let Some(t) = event.get("text").and_then(|v| v.as_str()) {
        t.to_string()
    } else if let Some(t) = body.get("text").and_then(|v| v.as_str()) {
        t.to_string()
    } else {
        return None;
    };

    if text.trim().is_empty() {
        return None;
    }

    Some((chat_id, user_name, text))
}

pub async fn run_lark_webhook_server(
    port: u16,
    cancel_flag: Arc<AtomicBool>,
    pool: SqlitePool,
    manager: ProcessManager,
    remote_mgr: RemoteControlManager,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| {
        format!("Failed to bind Lark webhook listener on {}: {}", addr, e)
    })?;

    println!("[Lark Webhook] Listening for bot events on http://{}", addr);

    while !cancel_flag.load(Ordering::Relaxed) {
        tokio::select! {
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((mut stream, _client_addr)) => {
                        let pool_clone = pool.clone();
                        let manager_clone = manager.clone();
                        let remote_mgr_clone = remote_mgr.clone();
                        let app_handle_clone = app_handle.clone();

                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(
                                &mut stream,
                                pool_clone,
                                manager_clone,
                                remote_mgr_clone,
                                app_handle_clone,
                            ).await {
                                eprintln!("[Lark Webhook] Connection error: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[Lark Webhook] Accept error: {}", e);
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(500)) => {
                if cancel_flag.load(Ordering::Relaxed) {
                    break;
                }
            }
        }
    }

    println!("[Lark Webhook] Server on port {} stopped", port);
    Ok(())
}

async fn handle_connection(
    stream: &mut tokio::net::TcpStream,
    pool: SqlitePool,
    manager: ProcessManager,
    remote_mgr: RemoteControlManager,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let _ = &remote_mgr;
    let mut buf = Vec::with_capacity(4096);
    let mut temp = [0u8; 2048];
    let mut header_end = None;
    let mut content_length: usize = 0;

    // Read until headers are received
    loop {
        let n = stream.read(&mut temp).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&temp[..n]);

        if let Some(pos) = find_header_end(&buf) {
            header_end = Some(pos);
            let header_str = String::from_utf8_lossy(&buf[..pos]);
            content_length = parse_content_length(&header_str);
            break;
        }

        if buf.len() > 65536 {
            return Err("Headers too large".to_string());
        }
    }

    let header_pos = match header_end {
        Some(p) => p,
        None => return Ok(()),
    };

    let body_start = header_pos + 4; // \r\n\r\n
    while buf.len() < body_start + content_length {
        let n = stream.read(&mut temp).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&temp[..n]);
    }

    let header_text = String::from_utf8_lossy(&buf[..header_pos]);
    let first_line = header_text.lines().next().unwrap_or_default();
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        let resp = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return Ok(());
    }

    let method = parts[0];

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return Ok(());
    }

    if method == "GET" {
        let body = serde_json::json!({
            "status": "ok",
            "service": "black_tde_lark_webhook",
            "webhook_path": "/api/lark/event"
        })
        .to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes()).await;
        return Ok(());
    }

    if method == "POST" {
        let body_bytes = if buf.len() >= body_start {
            let end = (body_start + content_length).min(buf.len());
            &buf[body_start..end]
        } else {
            &[]
        };

        let body_val: Value = serde_json::from_slice(body_bytes).unwrap_or(Value::Null);

        // 1. URL verification challenge handler for Lark / Feishu developer console
        if let Some(challenge) = body_val.get("challenge").and_then(|v| v.as_str()) {
            let resp_body = serde_json::json!({ "challenge": challenge }).to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                resp_body.len(),
                resp_body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
            println!("[Lark Webhook] Handled challenge verification: {}", challenge);
            return Ok(());
        }

        // 2. Normal event response: send HTTP 200 OK immediately
        let ack_body = "{\"code\":0,\"msg\":\"success\"}";
        let ack_resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            ack_body.len(),
            ack_body
        );
        let _ = stream.write_all(ack_resp.as_bytes()).await;

        // 3. Dispatch message event
        if let Some((chat_id, user_name, text)) = extract_lark_message(&body_val) {
            println!(
                "[Lark Webhook] Received incoming message: chat_id={}, user={:?}, text={}",
                chat_id, user_name, text
            );

            tokio::spawn(async move {
                if let Err(e) = router::handle_incoming_message(
                    "lark",
                    &chat_id,
                    user_name.as_deref(),
                    &text,
                    &pool,
                    &manager,
                    &app_handle,
                )
                .await
                {
                    eprintln!("[Lark Webhook] Failed to handle message: {}", e);
                }
            });
        }

        return Ok(());
    }

    let resp = "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
    let _ = stream.write_all(resp.as_bytes()).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_header_end() {
        let req = b"POST /api/lark/event HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n{\"key\":\"val\"}";
        assert_eq!(find_header_end(req), Some(46));
    }

    #[test]
    fn test_parse_content_length() {
        let headers = "POST /api/lark/event HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 128\r\nHost: localhost";
        assert_eq!(parse_content_length(headers), 128);
    }

    #[test]
    fn test_extract_lark_message_v2() {
        let v2_json = serde_json::json!({
            "schema": "2.0",
            "header": {
                "event_id": "ev-12345",
                "event_type": "im.message.receive_v1"
            },
            "event": {
                "sender": {
                    "sender_id": {
                        "open_id": "ou_user123"
                    },
                    "sender_type": "user"
                },
                "message": {
                    "message_id": "om_msg123",
                    "chat_id": "oc_chat123",
                    "chat_type": "p2p",
                    "message_type": "text",
                    "content": "{\"text\":\"/project list\"}"
                }
            }
        });

        let (chat_id, user_name, text) = extract_lark_message(&v2_json).expect("should extract v2");
        assert_eq!(chat_id, "oc_chat123");
        assert_eq!(user_name, Some("ou_user123".to_string()));
        assert_eq!(text, "/project list");
    }

    #[test]
    fn test_extract_lark_message_v1() {
        let v1_json = serde_json::json!({
            "type": "event_callback",
            "event": {
                "type": "message",
                "open_chat_id": "oc_chat999",
                "open_id": "ou_user999",
                "text": "hello from lark"
            }
        });

        let (chat_id, user_name, text) = extract_lark_message(&v1_json).expect("should extract v1");
        assert_eq!(chat_id, "oc_chat999");
        assert_eq!(user_name, Some("ou_user999".to_string()));
        assert_eq!(text, "hello from lark");
    }
}
