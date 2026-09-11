pub mod ansi;
pub mod lark;
pub mod router;
pub mod streamer;
pub mod telegram;
pub mod types;
pub mod webhook;

use crate::process::ProcessManager;
use crate::remote_ctl::types::{
    BotRuntimeStatus, LarkCredentials, RemoteBotConfig, RemoteMessageLog, RemotePairing,
    TelegramCredentials,
};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::time::{sleep, Duration};

#[derive(Default, Clone)]
pub struct RemoteControlManager {
    pub bot_tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub bot_errors: Arc<Mutex<HashMap<String, String>>>,
}

pub fn forward_session_output(session_id: &str, raw_bytes: &[u8]) {
    streamer::push_session_output(session_id, raw_bytes);
}

// ── Startup Initialization ─────────────────────────────────────────────────────

pub async fn init_remote_control(
    pool: SqlitePool,
    manager: ProcessManager,
    remote_mgr: RemoteControlManager,
    app_handle: AppHandle,
) {
    streamer::init_output_streamer(pool.clone());

    // Auto-start enabled bots
    let configs: Vec<RemoteBotConfig> = match get_remote_bot_configs_db(&pool).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[remote_ctl] Failed to load bot configs: {}", e);
            return;
        }
    };

    for cfg in configs {
        if cfg.enabled {
            let _ = start_bot_worker(&cfg.platform, &pool, &manager, &remote_mgr, &app_handle).await;
        }
    }
}

// ── Database Queries ───────────────────────────────────────────────────────────

async fn get_remote_bot_configs_db(pool: &SqlitePool) -> Result<Vec<RemoteBotConfig>, String> {
    let rows = sqlx::query(
        "SELECT platform, credentials, enabled, created_at, updated_at FROM remote_bot_configs"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let enabled: i64 = row.get("enabled");
        list.push(RemoteBotConfig {
            platform: row.get("platform"),
            credentials: row.get("credentials"),
            enabled: enabled == 1,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }
    Ok(list)
}

// ── Worker Lifecycle ───────────────────────────────────────────────────────────

async fn start_bot_worker(
    platform: &str,
    pool: &SqlitePool,
    process_mgr: &ProcessManager,
    remote_mgr: &RemoteControlManager,
    app_handle: &AppHandle,
) -> Result<(), String> {
    let platform_key = platform.to_lowercase();

    // Check credentials from DB
    let cred_json: Option<String> = sqlx::query_scalar(
        "SELECT credentials FROM remote_bot_configs WHERE platform = $1"
    )
    .bind(&platform_key)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let cred_str = cred_json.ok_or_else(|| format!("No configuration found for {}", platform_key))?;

    // Stop existing task if running
    stop_bot_worker(&platform_key, remote_mgr);

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut tasks = remote_mgr.bot_tasks.lock().unwrap();
        tasks.insert(platform_key.clone(), cancel_flag.clone());
    }

    let pool_clone = pool.clone();
    let proc_mgr_clone = process_mgr.clone();
    let app_handle_clone = app_handle.clone();
    let remote_mgr_clone = remote_mgr.clone();
    let p_key = platform_key.clone();

    match platform_key.as_str() {
        "telegram" => {
            let creds: TelegramCredentials = serde_json::from_str(&cred_str)
                .map_err(|e| format!("Invalid Telegram credentials JSON: {}", e))?;

            tokio::spawn(async move {
                let mut offset = 0i64;
                while !cancel_flag.load(Ordering::Relaxed) {
                    match telegram::get_telegram_updates(&creds.bot_token, offset, 20).await {
                        Ok(updates) => {
                            // Clear errors
                            remote_mgr_clone.bot_errors.lock().unwrap().remove(&p_key);

                            for update in updates {
                                if update.update_id >= offset {
                                    offset = update.update_id + 1;
                                }

                                if let Some(msg) = update.message {
                                    let chat_id = msg.chat.id.to_string();
                                    let user_name = msg.from.and_then(|u| u.username);
                                    if let Some(text) = msg.text {
                                        let _ = router::handle_incoming_message(
                                            "telegram",
                                            &chat_id,
                                            user_name.as_deref(),
                                            &text,
                                            &pool_clone,
                                            &proc_mgr_clone,
                                            &app_handle_clone,
                                        )
                                        .await;
                                    }
                                }
                            }
                        }
                        Err(err) => {
                            remote_mgr_clone
                                .bot_errors
                                .lock()
                                .unwrap()
                                .insert(p_key.clone(), err.clone());
                            sleep(Duration::from_secs(5)).await;
                        }
                    }
                }
            });
        }
        "lark" => {
            let creds: LarkCredentials = serde_json::from_str(&cred_str)
                .map_err(|e| format!("Invalid Lark credentials JSON: {}", e))?;

            // 1. Verify access token works initially against the specified base_url
            match lark::get_tenant_access_token(&creds.base_url, &creds.app_id, &creds.app_secret).await {
                Ok(_) => {
                    remote_mgr_clone.bot_errors.lock().unwrap().remove(&p_key);
                }
                Err(err) => {
                    let err_msg: String = err;
                    remote_mgr_clone
                        .bot_errors
                        .lock()
                        .unwrap()
                        .insert(p_key.clone(), err_msg);
                }
            }

            // 2. Start built-in Webhook HTTP listener to receive real-time messages from Lark / Feishu
            let port = creds.webhook_port.unwrap_or(webhook::DEFAULT_LARK_WEBHOOK_PORT);
            let pool_wh = pool_clone.clone();
            let proc_mgr_wh = proc_mgr_clone.clone();
            let remote_mgr_wh = remote_mgr_clone.clone();
            let app_handle_wh = app_handle_clone.clone();
            let cancel_flag_wh = cancel_flag.clone();
            let p_key_wh = p_key.clone();

            tokio::spawn(async move {
                if let Err(err) = webhook::run_lark_webhook_server(
                    port,
                    cancel_flag_wh,
                    pool_wh,
                    proc_mgr_wh,
                    remote_mgr_wh.clone(),
                    app_handle_wh,
                )
                .await
                {
                    eprintln!("[Lark Webhook Server] Failed: {}", err);
                    remote_mgr_wh
                        .bot_errors
                        .lock()
                        .unwrap()
                        .insert(p_key_wh, err);
                }
            });

            // 3. Lark worker heartbeat
            let cancel_flag_hb = cancel_flag.clone();
            let creds_hb = creds.clone();
            tokio::spawn(async move {
                while !cancel_flag_hb.load(Ordering::Relaxed) {
                    sleep(Duration::from_secs(60)).await;
                    let _ = lark::get_tenant_access_token(&creds_hb.base_url, &creds_hb.app_id, &creds_hb.app_secret).await;
                }
            });
        }
        _ => return Err(format!("Unsupported platform: {}", platform_key)),
    }

    Ok(())
}

fn stop_bot_worker(platform: &str, remote_mgr: &RemoteControlManager) {
    let mut tasks = remote_mgr.bot_tasks.lock().unwrap();
    if let Some(flag) = tasks.remove(platform) {
        flag.store(true, Ordering::Relaxed);
    }
}

// ── Tauri Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_remote_bot_configs(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<RemoteBotConfig>, String> {
    get_remote_bot_configs_db(&pool).await
}

#[tauri::command]
pub async fn save_remote_bot_config(
    platform: String,
    credentials: String,
    enabled: bool,
    pool: State<'_, SqlitePool>,
    process_mgr: State<'_, ProcessManager>,
    remote_mgr: State<'_, RemoteControlManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let p_key = platform.to_lowercase();
    let enabled_int = if enabled { 1 } else { 0 };

    sqlx::query(
        "INSERT INTO remote_bot_configs (platform, credentials, enabled, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) \
         ON CONFLICT(platform) DO UPDATE SET credentials = excluded.credentials, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&p_key)
    .bind(&credentials)
    .bind(enabled_int)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if enabled {
        let _ = start_bot_worker(&p_key, &pool, &process_mgr, &remote_mgr, &app_handle).await;
    } else {
        stop_bot_worker(&p_key, &remote_mgr);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_remote_bot_status(
    remote_mgr: State<'_, RemoteControlManager>,
) -> Result<Vec<BotRuntimeStatus>, String> {
    let tasks = remote_mgr.bot_tasks.lock().unwrap();
    let errors = remote_mgr.bot_errors.lock().unwrap();

    let platforms = vec!["telegram", "lark"];
    let mut results = Vec::new();

    for p in platforms {
        let running = tasks
            .get(p)
            .map(|flag| !flag.load(Ordering::Relaxed))
            .unwrap_or(false);
        let error = errors.get(p).cloned();

        results.push(BotRuntimeStatus {
            platform: p.to_string(),
            running,
            error,
            last_poll_time: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_remote_pairings(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<RemotePairing>, String> {
    let rows = sqlx::query(
        "SELECT id, platform, chat_id, user_name, pair_code, status, bound_workspace_id, bound_session_id, created_at, updated_at FROM remote_pairings ORDER BY created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(RemotePairing {
            id: row.get("id"),
            platform: row.get("platform"),
            chat_id: row.get("chat_id"),
            user_name: row.get("user_name"),
            pair_code: row.get("pair_code"),
            status: row.get("status"),
            bound_workspace_id: row.get("bound_workspace_id"),
            bound_session_id: row.get("bound_session_id"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn authorize_pair_code(
    pair_code: String,
    pool: State<'_, SqlitePool>,
    app_handle: AppHandle,
) -> Result<RemotePairing, String> {
    let clean_code = pair_code.trim().to_string();
    if clean_code.is_empty() {
        return Err("Pair code cannot be empty".to_string());
    }

    let row_opt = sqlx::query(
        "SELECT id, platform, chat_id, user_name, pair_code, status, bound_workspace_id, bound_session_id FROM remote_pairings WHERE pair_code = $1"
    )
    .bind(&clean_code)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = row_opt.ok_or_else(|| format!("Invalid pair authorization code: '{}'", clean_code))?;

    let id: String = row.get("id");
    let platform: String = row.get("platform");
    let chat_id: String = row.get("chat_id");
    let user_name: Option<String> = row.get("user_name");

    // Assign default workspace and active session if not already set
    let default_ws: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .unwrap_or(None);

    let default_session: Option<String> = if let Some(ref ws) = default_ws {
        sqlx::query_scalar("SELECT id FROM sessions WHERE workspace_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1")
            .bind(ws)
            .fetch_optional(&*pool)
            .await
            .unwrap_or(None)
    } else {
        None
    };

    sqlx::query(
        "UPDATE remote_pairings SET status = 'paired', bound_workspace_id = COALESCE(bound_workspace_id, $1), bound_session_id = COALESCE(bound_session_id, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3"
    )
    .bind(&default_ws)
    .bind(&default_session)
    .bind(&id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Send confirmation message to the bot chat
    let welcome_msg = format!(
        "🎉 Pairing Authorized Successfully!\n\n\
        Your chat is now connected to TDE Remote Control.\n\
        • Default Session: {}\n\n\
        Quick Commands:\n\
        • /help - Command guide\n\
        • /project list - View workspaces\n\
        • /project list session - View active sessions\n\
        • /switch project session <id> - Connect to a session\n\n\
        Type anything to interact with the connected session!",
        default_session.as_deref().unwrap_or("None (use /project list session)")
    );
    let _ = streamer::send_to_remote_chat(&platform, &chat_id, &welcome_msg, &pool).await;

    let res = RemotePairing {
        id,
        platform,
        chat_id,
        user_name,
        pair_code: clean_code,
        status: "paired".to_string(),
        bound_workspace_id: default_ws,
        bound_session_id: default_session,
        created_at: None,
        updated_at: None,
    };

    let _ = app_handle.emit("remote-pair-updated", &res);
    Ok(res)
}

#[tauri::command]
pub async fn revoke_pairing(
    pairing_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE remote_pairings SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = $1")
        .bind(&pairing_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn bind_pairing_session(
    pairing_id: String,
    workspace_id: Option<String>,
    session_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE remote_pairings SET bound_workspace_id = $1, bound_session_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3"
    )
    .bind(workspace_id)
    .bind(session_id)
    .bind(&pairing_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_remote_message_logs(
    limit: Option<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<RemoteMessageLog>, String> {
    let lim = limit.unwrap_or(50);
    let rows = sqlx::query(
        "SELECT id, platform, chat_id, direction, content, created_at FROM remote_message_logs ORDER BY id DESC LIMIT $1"
    )
    .bind(lim)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(RemoteMessageLog {
            id: row.get("id"),
            platform: row.get("platform"),
            chat_id: row.get("chat_id"),
            direction: row.get("direction"),
            content: row.get("content"),
            created_at: row.get("created_at"),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn simulate_remote_message(
    platform: String,
    chat_id: String,
    text: String,
    pool: State<'_, SqlitePool>,
    process_mgr: State<'_, ProcessManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    router::handle_incoming_message(
        &platform,
        &chat_id,
        Some("SimulatedUser"),
        &text,
        &pool,
        &process_mgr,
        &app_handle,
    )
    .await
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LarkWebhookInfo {
    pub port: u16,
    pub local_url: String,
    pub event_path: String,
}

#[tauri::command]
pub async fn test_lark_credentials(
    app_id: String,
    app_secret: String,
    base_url: Option<String>,
) -> Result<String, String> {
    let base = base_url.unwrap_or_else(types::default_lark_base_url);
    match lark::get_tenant_access_token(&base, &app_id, &app_secret).await {
        Ok(token) => Ok(format!(
            "Successfully connected to {}! Tenant token acquired (prefix: {}...).",
            lark::clean_base_url(&base),
            &token[..token.len().min(8)]
        )),
        Err(err) => Err(err),
    }
}

#[tauri::command]
pub async fn get_lark_webhook_info(
    pool: State<'_, SqlitePool>,
) -> Result<LarkWebhookInfo, String> {
    let cred_json: Option<String> = sqlx::query_scalar(
        "SELECT credentials FROM remote_bot_configs WHERE platform = 'lark'"
    )
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);

    let port = cred_json
        .and_then(|cj| serde_json::from_str::<LarkCredentials>(&cj).ok())
        .and_then(|c| c.webhook_port)
        .unwrap_or(webhook::DEFAULT_LARK_WEBHOOK_PORT);

    Ok(LarkWebhookInfo {
        port,
        local_url: format!("http://127.0.0.1:{}/api/lark/event", port),
        event_path: "/api/lark/event".to_string(),
    })
}
