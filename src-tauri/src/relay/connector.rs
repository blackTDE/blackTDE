use super::protocol::Frame;
use super::rpc;
use crate::process::ProcessManager;
use futures_util::{SinkExt, StreamExt};
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

pub async fn run_connection(
    ws_url: String,
    token: String,
    cancel: Arc<AtomicBool>,
    pool: SqlitePool,
    manager: ProcessManager,
    outbound_rx_slot: Arc<std::sync::Mutex<Option<UnboundedSender<Frame>>>>,
    app_handle: AppHandle,
    on_status: impl Fn(Option<String>, bool) + Send + Sync + 'static,
) {
    let mut backoff = 1u64;
    while !cancel.load(Ordering::Relaxed) {
        match connect_once(
            &ws_url,
            &token,
            &cancel,
            &pool,
            &manager,
            &outbound_rx_slot,
            &app_handle,
            &on_status,
        )
        .await
        {
            Ok(()) => backoff = 1,
            Err(error) => {
                on_status(Some(error), false);
                backoff = (backoff * 2).min(30);
            }
        }
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
    }
    on_status(None, false);
}

async fn connect_once(
    ws_url: &str,
    token: &str,
    cancel: &Arc<AtomicBool>,
    pool: &SqlitePool,
    manager: &ProcessManager,
    outbound_slot: &Arc<std::sync::Mutex<Option<UnboundedSender<Frame>>>>,
    app_handle: &AppHandle,
    on_status: &impl Fn(Option<String>, bool),
) -> Result<(), String> {
    let (stream, _) = connect_async(ws_url)
        .await
        .map_err(|e| format!("Relay connect failed: {e}"))?;
    let (mut sink, mut source) = stream.split();
    let hello = serde_json::to_string(&Frame::Hello {
        role: "desktop".into(),
        token: token.to_string(),
    })
    .map_err(|e| e.to_string())?;
    sink.send(Message::Text(hello.into()))
        .await
        .map_err(|e| e.to_string())?;

    let (tx, mut rx) = unbounded_channel::<Frame>();
    {
        let mut slot = outbound_slot.lock().map_err(|e| e.to_string())?;
        *slot = Some(tx);
    }

    let mut connected = false;
    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        tokio::select! {
            outgoing = rx.recv() => {
                let Some(frame) = outgoing else { break; };
                let payload = serde_json::to_string(&frame).map_err(|e| e.to_string())?;
                sink.send(Message::Text(payload.into())).await.map_err(|e| e.to_string())?;
            }
            incoming = source.next() => {
                let Some(message) = incoming else { break; };
                let message = message.map_err(|e| e.to_string())?;
                let text = match message {
                    Message::Text(text) => text.to_string(),
                    Message::Ping(payload) => {
                        sink.send(Message::Pong(payload)).await.map_err(|e| e.to_string())?;
                        continue;
                    }
                    Message::Close(_) => break,
                    _ => continue,
                };
                let frame: Frame = match serde_json::from_str(&text) {
                    Ok(frame) => frame,
                    Err(error) => {
                        eprintln!("relay: skip unreadable frame: {error}");
                        continue;
                    }
                };
                match frame {
                    Frame::HelloOk { .. } => {
                        connected = true;
                        on_status(None, true);
                    }
                    Frame::HelloErr { error } => {
                        return Err(error);
                    }
                    Frame::Revoke => {
                        return Err("Room revoked".into());
                    }
                    Frame::Ping => {
                        sink.send(Message::Text(
                            serde_json::to_string(&Frame::Pong).map_err(|e| e.to_string())?.into(),
                        ))
                        .await
                        .map_err(|e| e.to_string())?;
                    }
                    Frame::RpcReq { id, method, params } => {
                        let reply_tx = outbound_slot.lock().ok().and_then(|slot| slot.clone());
                        let pool = pool.clone();
                        let manager = manager.clone();
                        let app_handle = app_handle.clone();
                        tokio::spawn(async move {
                            let result = rpc::dispatch(&method, &params, &pool, &manager, &app_handle).await;
                            let reply = match result {
                                Ok(value) => Frame::RpcRes { id, result: value },
                                Err(error) => Frame::RpcErr { id, error, code: None },
                            };
                            if let Some(tx) = reply_tx {
                                let _ = tx.send(reply);
                            }
                        });
                    }
                    _ => {}
                }
            }
        }
    }

    if let Ok(mut slot) = outbound_slot.lock() {
        *slot = None;
    }
    if connected {
        on_status(None, false);
    }
    Ok(())
}
