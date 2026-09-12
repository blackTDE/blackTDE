use crate::remote_ctl::ansi::clean_terminal_output;
use crate::remote_ctl::lark::send_lark_message;
use crate::remote_ctl::telegram::send_telegram_message;
use crate::remote_ctl::types::{LarkCredentials, TelegramCredentials};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{self, UnboundedSender};

struct StreamBuffer {
    content: String,
    last_append: Instant,
    flushing: bool,
}

pub struct OutputDebouncer {
    #[allow(dead_code)]
    buffers: Arc<Mutex<HashMap<String, StreamBuffer>>>,
    tx: UnboundedSender<(String, String)>,
}

static STREAMER_INSTANCE: Mutex<Option<Arc<OutputDebouncer>>> = Mutex::new(None);

pub fn init_output_streamer(pool: SqlitePool) {
    let (tx, mut rx) = mpsc::unbounded_channel::<(String, String)>();
    let buffers = Arc::new(Mutex::new(HashMap::<String, StreamBuffer>::new()));
    let buffers_clone = buffers.clone();

    let debouncer = Arc::new(OutputDebouncer {
        buffers,
        tx,
    });

    if let Ok(mut inst) = STREAMER_INSTANCE.lock() {
        *inst = Some(debouncer.clone());
    }

    // Spawn background flush scheduler
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        while let Some((session_id, chunk)) = rx.recv().await {
            // Append chunk to buffer
            let should_spawn_timer = {
                let mut guard = buffers_clone.lock().unwrap();
                let buf = guard.entry(session_id.clone()).or_insert_with(|| StreamBuffer {
                    content: String::new(),
                    last_append: Instant::now(),
                    flushing: false,
                });
                buf.content.push_str(&chunk);
                buf.last_append = Instant::now();

                let should_spawn = !buf.flushing;
                if should_spawn {
                    buf.flushing = true;
                }
                should_spawn
            };

            if should_spawn_timer {
                let buffers_for_task = buffers_clone.clone();
                let pool_for_task = pool_clone.clone();
                let sid = session_id.clone();

                tokio::spawn(async move {
                    loop {
                        tokio::time::sleep(Duration::from_millis(300)).await;

                        let ready_to_flush = {
                            let mut guard = buffers_for_task.lock().unwrap();
                            if let Some(buf) = guard.get_mut(&sid) {
                                let elapsed = buf.last_append.elapsed();
                                let is_settled = elapsed >= Duration::from_millis(1800);
                                let is_huge = buf.content.len() >= 16000;

                                if is_settled || is_huge {
                                    let cleaned = clean_terminal_output(&buf.content);
                                    if cleaned.trim().is_empty() {
                                        // Still only loading spinners / redraw artifacts in buffer.
                                        // If idle for over 4 seconds, drop it quietly; otherwise keep waiting for real answer.
                                        if elapsed >= Duration::from_millis(4000) {
                                            buf.flushing = false;
                                            guard.remove(&sid);
                                            None
                                        } else {
                                            continue;
                                        }
                                    } else {
                                        // Real content ready to send as one complete response!
                                        buf.flushing = false;
                                        guard.remove(&sid);
                                        Some(cleaned)
                                    }
                                } else {
                                    continue;
                                }
                            } else {
                                None
                            }
                        };

                        if let Some(text) = ready_to_flush {
                            flush_session_output_to_chats(&sid, &text, &pool_for_task).await;
                        }
                        break;
                    }
                });
            }
        }
    });
}

pub fn push_session_output(session_id: &str, raw_bytes: &[u8]) {
    if raw_bytes.is_empty() {
        return;
    }
    let raw_text = String::from_utf8_lossy(raw_bytes).to_string();

    if let Ok(guard) = STREAMER_INSTANCE.lock() {
        if let Some(ref debouncer) = *guard {
            let _ = debouncer.tx.send((session_id.to_string(), raw_text));
        }
    }
}

async fn flush_session_output_to_chats(session_id: &str, content: &str, pool: &SqlitePool) {
    // Look for all paired chats bound to this session
    let rows = match sqlx::query(
        "SELECT platform, chat_id FROM remote_pairings WHERE bound_session_id = $1 AND status = 'paired'"
    )
    .bind(session_id)
    .fetch_all(pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[remote_ctl] Error fetching bound chats for {}: {}", session_id, e);
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    // Get session info for prefix header
    let session_name: Option<String> = sqlx::query_scalar(
        "SELECT COALESCE(name, agent_type) FROM sessions WHERE id = $1"
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let display_title = session_name.unwrap_or_else(|| session_id.to_string());
    let formatted_msg = format!("🖥️ [{}]\n{}", display_title, content);

    for row in rows {
        use sqlx::Row;
        let platform: String = row.get("platform");
        let chat_id: String = row.get("chat_id");

        let _ = send_to_remote_chat(&platform, &chat_id, &formatted_msg, pool).await;

        // Log outgoing message
        let _ = sqlx::query(
            "INSERT INTO remote_message_logs (platform, chat_id, direction, content) VALUES ($1, $2, 'outgoing', $3)"
        )
        .bind(&platform)
        .bind(&chat_id)
        .bind(&formatted_msg)
        .execute(pool)
        .await;
    }
}

pub async fn send_to_remote_chat(
    platform: &str,
    chat_id: &str,
    text: &str,
    pool: &SqlitePool,
) -> Result<(), String> {
    match platform {
        "telegram" => {
            let cred_json: Option<String> = sqlx::query_scalar(
                "SELECT credentials FROM remote_bot_configs WHERE platform = 'telegram' AND enabled = 1"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

            let cred_str = cred_json.ok_or("Telegram bot is not enabled or credentials missing")?;
            let creds: TelegramCredentials = serde_json::from_str(&cred_str)
                .map_err(|e| format!("Invalid Telegram config: {}", e))?;

            send_telegram_message(&creds.bot_token, chat_id, text).await
        }
        "lark" => {
            let cred_json: Option<String> = sqlx::query_scalar(
                "SELECT credentials FROM remote_bot_configs WHERE platform = 'lark' AND enabled = 1"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

            let cred_str = cred_json.ok_or("Lark bot is not enabled or credentials missing")?;
            let creds: LarkCredentials = serde_json::from_str(&cred_str)
                .map_err(|e| format!("Invalid Lark config: {}", e))?;

            send_lark_message(&creds.base_url, &creds.app_id, &creds.app_secret, chat_id, text).await
        }
        _ => Err(format!("Unsupported platform: {}", platform)),
    }
}
