mod connector;
mod protocol;
mod rpc;

use crate::process::ProcessManager;
use protocol::{build_pairing_url, to_ws_url, Frame};
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Default)]
pub struct RelayStatus {
    pub running: bool,
    pub connected: bool,
    pub relay_url: String,
    pub room_id: String,
    pub pairing_url: String,
    pub qr_svg: String,
    pub error: Option<String>,
}

#[derive(Clone, Default)]
pub struct RelayManager {
    inner: Arc<Mutex<RelayInner>>,
    outbound: Arc<Mutex<Option<UnboundedSender<Frame>>>>,
    buffers: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

#[derive(Default)]
struct RelayInner {
    running: bool,
    connected: bool,
    cancel: Option<Arc<AtomicBool>>,
    relay_url: String,
    room_id: String,
    token: String,
    pairing_url: String,
    qr_svg: String,
    error: Option<String>,
}

static RELAY: Mutex<Option<RelayManager>> = Mutex::new(None);

pub fn init_relay_forwarder(manager: RelayManager) {
    if let Ok(mut slot) = RELAY.lock() {
        *slot = Some(manager.clone());
    }
    let buffers = manager.buffers.clone();
    let outbound = manager.outbound.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(80));
        loop {
            interval.tick().await;
            let drained: Vec<(String, Vec<u8>)> = {
                let Ok(mut buffers) = buffers.lock() else {
                    continue;
                };
                buffers.drain().collect()
            };
            let Ok(slot) = outbound.lock() else {
                continue;
            };
            let Some(tx) = slot.as_ref() else {
                continue;
            };
            for (session_id, data) in drained {
                if data.is_empty() {
                    continue;
                }
                let _ = tx.send(Frame::Stream {
                    session_id,
                    data_b64: base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        data,
                    ),
                });
            }
        }
    });
}

pub fn forward_session_output(session_id: &str, raw_bytes: &[u8]) {
    let Some(manager) = RELAY.lock().ok().and_then(|guard| guard.clone()) else {
        return;
    };
    let running = manager
        .inner
        .lock()
        .map(|inner| inner.running)
        .unwrap_or(false);
    if !running {
        return;
    }
    let buffers = manager.buffers.clone();
    let outbound = manager.outbound.clone();
    let Ok(mut buffers) = buffers.lock() else {
        return;
    };
    let buffer = buffers.entry(session_id.to_string()).or_default();
    buffer.extend_from_slice(raw_bytes);
    if buffer.len() >= 8 * 1024 {
        let data = std::mem::take(buffer);
        if let Ok(slot) = outbound.lock() {
            if let Some(tx) = slot.as_ref() {
                let _ = tx.send(Frame::Stream {
                    session_id: session_id.to_string(),
                    data_b64: base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        data,
                    ),
                });
            }
        }
    }
}

struct SavedPairing {
    relay_url: String,
    room_id: String,
    token: String,
}

pub async fn restore_and_start(
    pool: SqlitePool,
    process_manager: ProcessManager,
    relay: RelayManager,
    app_handle: AppHandle,
) {
    let Ok(Some(saved)) = load_pairing(&pool).await else {
        return;
    };
    if let Err(error) = begin_relay(
        saved.relay_url,
        saved.room_id,
        saved.token,
        false,
        &pool,
        process_manager,
        &relay,
        app_handle.clone(),
    )
    .await
    {
        if let Ok(mut inner) = relay.inner.lock() {
            inner.error = Some(error);
        }
        emit_status(&app_handle, &relay);
    }
}

#[tauri::command]
pub async fn start_web_relay(
    relay_url: String,
    pool: State<'_, SqlitePool>,
    manager: State<'_, ProcessManager>,
    relay: State<'_, RelayManager>,
    app_handle: AppHandle,
) -> Result<RelayStatus, String> {
    let relay_url = normalize_relay_url(&relay_url);
    let saved = load_pairing(pool.inner()).await.ok().flatten();
    let (room_id, token) = match saved {
        Some(saved) if normalize_relay_url(&saved.relay_url) == relay_url => {
            (saved.room_id, saved.token)
        }
        _ => new_credentials(),
    };
    begin_relay(
        relay_url,
        room_id,
        token,
        true,
        pool.inner(),
        manager.inner().clone(),
        &relay,
        app_handle,
    )
    .await
}

#[tauri::command]
pub fn stop_web_relay(relay: State<'_, RelayManager>, app_handle: AppHandle) -> Result<RelayStatus, String> {
    stop_internal(&relay);
    emit_status(&app_handle, &relay);
    current_status(&relay)
}

#[tauri::command]
pub async fn revoke_web_relay(
    pool: State<'_, SqlitePool>,
    relay: State<'_, RelayManager>,
    app_handle: AppHandle,
) -> Result<RelayStatus, String> {
    if let Ok(slot) = relay.outbound.lock() {
        if let Some(tx) = slot.as_ref() {
            let _ = tx.send(Frame::Revoke);
        }
    }
    tokio::time::sleep(Duration::from_millis(150)).await;
    let _ = clear_pairing(pool.inner()).await;
    stop_internal(&relay);
    if let Ok(mut inner) = relay.inner.lock() {
        inner.relay_url.clear();
        inner.room_id.clear();
        inner.token.clear();
        inner.pairing_url.clear();
        inner.qr_svg.clear();
    }
    emit_status(&app_handle, &relay);
    current_status(&relay)
}

#[tauri::command]
pub fn get_web_relay_status(relay: State<'_, RelayManager>) -> Result<RelayStatus, String> {
    current_status(&relay)
}

async fn begin_relay(
    relay_url: String,
    room_id: String,
    token: String,
    persist: bool,
    pool: &SqlitePool,
    process_manager: ProcessManager,
    relay: &RelayManager,
    app_handle: AppHandle,
) -> Result<RelayStatus, String> {
    stop_internal(relay);
    let pairing_url = build_pairing_url(&relay_url, &room_id, &token);
    let ws_url = to_ws_url(&relay_url, &room_id)?;
    let qr_svg = render_qr(&pairing_url)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut inner = relay.inner.lock().map_err(|e| e.to_string())?;
        inner.running = true;
        inner.connected = false;
        inner.cancel = Some(cancel.clone());
        inner.relay_url = relay_url.clone();
        inner.room_id = room_id.clone();
        inner.token = token.clone();
        inner.pairing_url = pairing_url;
        inner.qr_svg = qr_svg;
        inner.error = None;
    }
    if persist {
        if let Err(error) = save_pairing(pool, &relay_url, &room_id, &token).await {
            stop_internal(relay);
            return Err(error);
        }
    }
    emit_status(&app_handle, relay);

    let pool = pool.clone();
    let outbound = relay.outbound.clone();
    let relay_for_status = relay.inner.clone();
    let app_for_status = app_handle.clone();
    let started_at = Instant::now();
    tauri::async_runtime::spawn(async move {
        connector::run_connection(
            ws_url,
            token,
            cancel,
            pool,
            process_manager,
            outbound,
            app_handle,
            move |error, connected| {
                if let Ok(mut inner) = relay_for_status.lock() {
                    inner.connected = connected;
                    inner.error = error;
                    if started_at.elapsed() < Duration::from_millis(50) && inner.error.is_some() {
                        // keep first error
                    }
                }
                let _ = app_for_status.emit("web-relay-status", snapshot_from_arc(&relay_for_status));
            },
        )
        .await;
    });
    current_status(relay)
}

fn stop_internal(relay: &RelayManager) {
    if let Ok(mut inner) = relay.inner.lock() {
        inner.running = false;
        inner.connected = false;
        if let Some(cancel) = inner.cancel.take() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
    if let Ok(mut slot) = relay.outbound.lock() {
        *slot = None;
    }
    if let Ok(mut buffers) = relay.buffers.lock() {
        buffers.clear();
    }
}

fn current_status(relay: &RelayManager) -> Result<RelayStatus, String> {
    let inner = relay.inner.lock().map_err(|e| e.to_string())?;
    Ok(RelayStatus {
        running: inner.running,
        connected: inner.connected,
        relay_url: inner.relay_url.clone(),
        room_id: inner.room_id.clone(),
        pairing_url: inner.pairing_url.clone(),
        qr_svg: inner.qr_svg.clone(),
        error: inner.error.clone(),
    })
}

fn snapshot_from_arc(inner: &Arc<Mutex<RelayInner>>) -> RelayStatus {
    inner
        .lock()
        .map(|inner| RelayStatus {
            running: inner.running,
            connected: inner.connected,
            relay_url: inner.relay_url.clone(),
            room_id: inner.room_id.clone(),
            pairing_url: inner.pairing_url.clone(),
            qr_svg: inner.qr_svg.clone(),
            error: inner.error.clone(),
        })
        .unwrap_or_default()
}

fn normalize_relay_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn new_credentials() -> (String, String) {
    (
        Uuid::new_v4().to_string(),
        format!("{:x}{:x}", Uuid::new_v4().as_u128(), Uuid::new_v4().as_u128()),
    )
}

async fn load_pairing(pool: &SqlitePool) -> Result<Option<SavedPairing>, String> {
    let row = sqlx::query("SELECT relay_url, room_id, token, revoked FROM web_relay_pairing WHERE id = 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(None);
    };
    let revoked: i64 = row.get("revoked");
    let token: String = row.get("token");
    if revoked != 0 || token.is_empty() {
        return Ok(None);
    }
    Ok(Some(SavedPairing {
        relay_url: row.get("relay_url"),
        room_id: row.get("room_id"),
        token,
    }))
}

async fn save_pairing(
    pool: &SqlitePool,
    relay_url: &str,
    room_id: &str,
    token: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO web_relay_pairing (id, relay_url, room_id, token, revoked, updated_at)
         VALUES (1, $1, $2, $3, 0, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
            relay_url = excluded.relay_url,
            room_id = excluded.room_id,
            token = excluded.token,
            revoked = 0,
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(relay_url)
    .bind(room_id)
    .bind(token)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn clear_pairing(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM web_relay_pairing WHERE id = 1")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn emit_status(app_handle: &AppHandle, relay: &RelayManager) {
    if let Ok(status) = current_status(relay) {
        let _ = app_handle.emit("web-relay-status", status);
    }
}

fn render_qr(url: &str) -> Result<String, String> {
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .quiet_zone(true)
        .min_dimensions(256, 256)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build();
    Ok(make_svg_fluid(&svg))
}

fn make_svg_fluid(svg: &str) -> String {
    let Some(svg_start) = svg.find("<svg") else {
        return svg.to_string();
    };
    let Some(rel_tag_end) = svg[svg_start..].find('>') else {
        return svg.to_string();
    };
    let tag_end = svg_start + rel_tag_end;
    let prefix = &svg[..svg_start];
    let open_tag = &svg[svg_start..tag_end];
    let rest = &svg[tag_end..];
    let mut attrs = open_tag["<svg".len()..].to_string();
    if !attrs.contains("viewBox=") {
        if let (Some(width), Some(height)) = (svg_attr_value(open_tag, "width"), svg_attr_value(open_tag, "height")) {
            attrs.push_str(&format!(r#" viewBox="0 0 {width} {height}""#));
        }
    }
    for name in ["width", "height"] {
        attrs = strip_svg_attr(&attrs, name);
    }
    format!(
        r#"{prefix}<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"{attrs}{rest}"#
    )
}

fn svg_attr_value(tag: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=");
    let start = tag.find(&needle)? + needle.len();
    let quote = tag[start..].chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let value_start = start + quote.len_utf8();
    let rel_end = tag[value_start..].find(quote)?;
    Some(tag[value_start..value_start + rel_end].to_string())
}

fn strip_svg_attr(tag: &str, name: &str) -> String {
    let needle = format!("{name}=");
    let Some(start) = tag.find(&needle) else {
        return tag.to_string();
    };
    let after_name = start + needle.len();
    let quote = tag[after_name..].chars().next();
    let Some(quote @ ('"' | '\'')) = quote else {
        return tag.to_string();
    };
    let value_start = after_name + quote.len_utf8();
    let Some(rel_end) = tag[value_start..].find(quote) else {
        return tag.to_string();
    };
    let end = value_start + rel_end + quote.len_utf8();
    let mut out = String::new();
    out.push_str(&tag[..start]);
    out.push_str(&tag[end..]);
    out
}

#[cfg(test)]
mod qr_tests {
    use super::{make_svg_fluid, render_qr};

    #[test]
    fn fluid_svg_replaces_fixed_pixel_size() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="232" height="232" viewBox="0 0 232 232"><path d="M0 0h232v232H0z"/></svg>"#;
        let fluid = make_svg_fluid(svg);
        assert!(fluid.contains(r#"width="100%""#));
        assert!(fluid.contains(r#"height="100%""#));
        assert!(fluid.contains(r#"preserveAspectRatio="xMidYMid meet""#));
        assert!(!fluid.contains(r#"width="232""#));
        assert!(fluid.contains(r#"viewBox="0 0 232 232""#));
    }

    #[test]
    fn fluid_svg_rewrites_svg_after_xml_prolog() {
        let svg = r#"<?xml version="1.0"?><svg width="180" height="180"><path d="M0 0h1v1H0z"/></svg>"#;
        let fluid = make_svg_fluid(svg);
        assert!(fluid.starts_with(r#"<?xml version="1.0"?>"#));
        assert!(fluid.contains(r#"width="100%""#));
        assert!(fluid.contains(r#"viewBox="0 0 180 180""#));
    }

    #[test]
    fn fluid_svg_adds_view_box_when_missing() {
        let svg = r#"<svg width="200" height="200"><rect width="200" height="200"/></svg>"#;
        let fluid = make_svg_fluid(svg);
        assert!(fluid.contains(r#"viewBox="0 0 200 200""#));
        assert!(fluid.contains(r#"width="100%""#));
    }

    #[test]
    fn pairing_url_renders_a_complete_svg() {
        let url = "https://tde-relay.example.workers.dev/r/11111111-2222-3333-4444-555555555555#t=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let svg = render_qr(url).unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains(r#"width="100%""#));
        assert!(svg.contains("viewBox="));
        assert!(svg.contains("</svg>"));
    }
}
