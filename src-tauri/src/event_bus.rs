use std::io::Read;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use portable_pty::MasterPty;
use tauri::Emitter;
use sqlx::SqlitePool;
use crate::process::{remove_active_session, ActiveProcess};
use uuid::Uuid;

#[derive(Clone, serde::Serialize)]
pub struct TdeEvent {
    pub session_id: String,
    pub event_type: String, // "stdout", "exit", "error"
    pub data: Vec<u8>,
}

pub fn start_stdout_reader(
    session_id: String,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    process_instance_id: Uuid,
    active_sessions: Arc<Mutex<HashMap<String, ActiveProcess>>>,
    db_pool: SqlitePool,
    app_handle: tauri::AppHandle,
) {
    let session_id_clone = session_id.clone();
    let app_handle_clone = app_handle.clone();
    let db_pool_clone = db_pool.clone();

    // Spawn stdout/stderr reader thread
    std::thread::spawn(move || {
        let mut reader = match master.lock() {
            Ok(m) => match m.try_clone_reader() {
                Ok(r) => r,
                Err(_) => return,
            },
            Err(_) => return,
        };

        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF
                    break;
                }
                Ok(n) => {
                    let data_chunk = buffer[..n].to_vec();

                    // Scan chunk for remote session_id/conversation_id (e.g. from Claude Code, Codex, OpenCode, Pi Agent stream payloads)
                    if let Ok(text) = std::str::from_utf8(&data_chunk) {
                        let keys = vec!["\"session_id\"", "\"sessionId\"", "\"conversation_id\"", "\"conversationId\"", "\"run_id\"", "\"runId\""];
                        let mut found_sid = None;
                        for key in keys {
                            if let Some(idx) = text.find(key) {
                                let after = &text[idx + key.len()..];
                                if let Some(start_quote) = after.find('"') {
                                    let val_part = &after[start_quote + 1..];
                                    if let Some(end_quote) = val_part.find('"') {
                                        let val = &val_part[..end_quote];
                                        if !val.trim().is_empty() && val != "default" {
                                            found_sid = Some(val.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if let Some(captured_sid) = found_sid {
                            let pool = db_pool_clone.clone();
                            let s_id = session_id_clone.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = sqlx::query(
                                    "UPDATE sessions SET remote_session_id = $1 WHERE id = $2"
                                )
                                .bind(captured_sid)
                                .bind(s_id)
                                .execute(&pool)
                                .await;
                            });
                        }
                    }

                    // 1. Emit event to frontend
                    let _ = app_handle_clone.emit(
                        "tde-event",
                        TdeEvent {
                            session_id: session_id_clone.clone(),
                            event_type: "stdout".into(),
                            data: data_chunk.clone(),
                        },
                    );

                    // 2. Persist transcript in database asynchronously
                    let pool = db_pool_clone.clone();
                    let s_id = session_id_clone.clone();
                    let chunk = data_chunk.clone();
                    
                    // Start an async task on tokio runner to insert data
                    tauri::async_runtime::spawn(async move {
                        let _ = sqlx::query(
                            "INSERT INTO transcripts (session_id, stream_type, data) VALUES ($1, $2, $3)"
                        )
                        .bind(s_id)
                        .bind("stdout")
                        .bind(chunk)
                        .execute(&pool)
                        .await;
                    });
                }
                Err(_) => {
                    // Error or PTY closed
                    break;
                }
            }
        }

        remove_active_session(&active_sessions, &session_id_clone, process_instance_id);

        // Send exit event
        let _ = app_handle_clone.emit(
            "tde-event",
            TdeEvent {
                session_id: session_id_clone.clone(),
                event_type: "exit".into(),
                data: Vec::new(),
            },
        );

        // Update session status to terminated in database
        let pool = db_pool_clone.clone();
        let s_id = session_id_clone.clone();
        tauri::async_runtime::spawn(async move {
            let _ = sqlx::query(
                "UPDATE sessions SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = $1"
            )
            .bind(s_id)
            .execute(&pool)
            .await;
        });
    });
}
