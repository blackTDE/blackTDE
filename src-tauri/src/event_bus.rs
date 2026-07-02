use std::io::Read;
use std::sync::{Arc, Mutex};
use portable_pty::MasterPty;
use tauri::Emitter;
use sqlx::SqlitePool;

#[derive(Clone, serde::Serialize)]
pub struct TdeEvent {
    pub session_id: String,
    pub event_type: String, // "stdout", "exit", "error"
    pub data: Vec<u8>,
}

pub fn start_stdout_reader(
    session_id: String,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
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

                    // Scan chunk for remote session_id (e.g. from Claude Code stream-json init payload)
                    if let Ok(text) = std::str::from_utf8(&data_chunk) {
                        if let Some(idx) = text.find("\"session_id\"") {
                            let after = &text[idx + 12..];
                            if let Some(start_quote) = after.find('"') {
                                let val_part = &after[start_quote + 1..];
                                if let Some(end_quote) = val_part.find('"') {
                                    let session_id_val = &val_part[..end_quote];
                                    let pool = db_pool_clone.clone();
                                    let s_id = session_id_clone.clone();
                                    let captured_sid = session_id_val.to_string();
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
