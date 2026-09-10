use crate::process::ProcessManager;
use crate::remote_ctl::streamer::send_to_remote_chat;
use crate::remote_ctl::types::RemotePairing;
use sqlx::{Row, SqlitePool};
use std::io::Write;
use tauri::Emitter;

pub async fn handle_incoming_message(
    platform: &str,
    chat_id: &str,
    user_name: Option<&str>,
    text: &str,
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Ok(());
    }

    // 1. Log incoming message
    let _ = sqlx::query(
        "INSERT INTO remote_message_logs (platform, chat_id, direction, content) VALUES ($1, $2, 'incoming', $3)"
    )
    .bind(platform)
    .bind(chat_id)
    .bind(clean_text)
    .execute(pool)
    .await;

    // 2. Check pairing status
    let row_opt = sqlx::query(
        "SELECT id, platform, chat_id, user_name, pair_code, status, bound_workspace_id, bound_session_id, created_at, updated_at FROM remote_pairings WHERE platform = $1 AND chat_id = $2"
    )
    .bind(platform)
    .bind(chat_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_pairing = row_opt.map(|row| RemotePairing {
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

    match existing_pairing {
        None => {
            // New pairing request: generate 6-digit code
            let pair_code = format!("{:06}", (uuid::Uuid::new_v4().as_u128() % 900000) + 100000);
            let pairing_id = uuid::Uuid::new_v4().to_string();

            sqlx::query(
                "INSERT INTO remote_pairings (id, platform, chat_id, user_name, pair_code, status) VALUES ($1, $2, $3, $4, $5, 'pending')"
            )
            .bind(&pairing_id)
            .bind(platform)
            .bind(chat_id)
            .bind(user_name)
            .bind(&pair_code)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            let prompt_text = format!(
                "🔒 [TDE Remote Control]\n\nYour chat is not yet authorized.\n🔑 Pair Authorization Code: [{}]\n\nPlease enter this code in TDE -> Settings -> Remote Control to authorize and connect this chat.",
                pair_code
            );

            let _ = send_to_remote_chat(platform, chat_id, &prompt_text, pool).await;

            // Notify frontend in real-time
            let _ = app_handle.emit("remote-pair-request", serde_json::json!({
                "id": pairing_id,
                "platform": platform,
                "chat_id": chat_id,
                "user_name": user_name,
                "pair_code": pair_code
            }));

            return Ok(());
        }
        Some(pairing) if pairing.status != "paired" => {
            // Pairing exists but pending or revoked
            let prompt_text = format!(
                "🔒 [TDE Remote Control]\n\nChat is waiting for authorization.\n🔑 Pair Authorization Code: [{}]\n\nPlease enter this code in TDE Settings -> Remote Control to authorize.",
                pairing.pair_code
            );
            let _ = send_to_remote_chat(platform, chat_id, &prompt_text, pool).await;
            return Ok(());
        }
        Some(pairing) => {
            // Chat is paired! Check if it's a slash command
            if clean_text.starts_with('/') {
                handle_slash_command(clean_text, &pairing, pool, manager).await
            } else {
                handle_session_input(clean_text, &pairing, pool, manager).await
            }
        }
    }
}

async fn handle_slash_command(
    command: &str,
    pairing: &RemotePairing,
    pool: &SqlitePool,
    _manager: &ProcessManager,
) -> Result<(), String> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    let root_cmd = parts[0];

    match root_cmd {
        "/help" | "/start" => {
            let session_info = if let Some(ref sid) = pairing.bound_session_id {
                let s_info: Option<(String, String)> = sqlx::query_as(
                    "SELECT COALESCE(s.name, s.agent_type), COALESCE(w.name, 'Default') FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id WHERE s.id = $1"
                )
                .bind(sid)
                .fetch_optional(pool)
                .await
                .unwrap_or(None);

                if let Some((agent, ws)) = s_info {
                    format!("● Bound: {} (Project: {}, Session: {})", agent, ws, sid)
                } else {
                    format!("● Bound ID: {} (Session terminated or missing)", sid)
                }
            } else {
                "○ None (use /project list session then /switch to connect)".to_string()
            };

            let help_text = format!(
                "🤖 TDE Remote Control Terminal Hub\n\n\
                Current Status:\n{}\n\n\
                Available Commands:\n\
                • /help - Show this command reference\n\
                • /project list - List all project workspaces\n\
                • /project list session - List sessions in current project\n\
                • /switch project session <id> - Connect to a specific session\n\
                • /switch <id> - Quick switch to session ID\n\n\
                Type any text directly to execute commands or chat with the connected AI agent!",
                session_info
            );

            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &help_text, pool).await;
        }
        "/project" => {
            if parts.len() >= 2 && parts[1] == "list" {
                if parts.len() >= 3 && parts[2] == "session" {
                    // /project list session
                    list_sessions(pairing, pool).await?;
                } else {
                    // /project list
                    list_projects(pairing, pool).await?;
                }
            } else {
                let msg = "Usage: `/project list` or `/project list session`";
                let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
            }
        }
        "/session" => {
            if parts.len() >= 2 && parts[1] == "list" {
                list_sessions(pairing, pool).await?;
            } else {
                let msg = "Usage: `/session list`";
                let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
            }
        }
        "/switch" => {
            // Supports: /switch project session <id> OR /switch <id>
            let target_id = if parts.len() >= 4 && parts[1] == "project" && parts[2] == "session" {
                parts[3]
            } else if parts.len() >= 2 {
                parts[1]
            } else {
                let msg = "Usage: `/switch project session <session_id>` or `/switch <session_id>`";
                let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
                return Ok(());
            };

            switch_session(target_id, pairing, pool).await?;
        }
        _ => {
            let msg = format!("Unknown command: `{}`. Type `/help` for available commands.", root_cmd);
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
        }
    }

    Ok(())
}

async fn list_projects(pairing: &RemotePairing, pool: &SqlitePool) -> Result<(), String> {
    let rows = sqlx::query("SELECT id, name, path FROM workspaces ORDER BY created_at ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        let msg = "📁 No projects found in TDE workspaces.";
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
        return Ok(());
    }

    let mut out = String::from("📁 TDE Project Workspaces:\n");
    for row in rows {
        let id: String = row.get("id");
        let name: String = row.get("name");
        let path: String = row.get("path");

        let is_current = pairing.bound_workspace_id.as_deref() == Some(&id);
        let marker = if is_current { " ◀ [CURRENT]" } else { "" };
        out.push_str(&format!("• [{}] {} ({}){}\n", id, name, path, marker));
    }

    out.push_str("\nTo list sessions, use `/project list session`.");
    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &out, pool).await;
    Ok(())
}

async fn list_sessions(pairing: &RemotePairing, pool: &SqlitePool) -> Result<(), String> {
    // If bound_workspace_id is set, filter by workspace; otherwise show all active
    let (query, ws_name) = if let Some(ref ws_id) = pairing.bound_workspace_id {
        let name: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
            .bind(ws_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);
        (
            format!("SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.status, s.cwd FROM sessions s WHERE s.workspace_id = '{}' ORDER BY s.created_at DESC", ws_id),
            name.unwrap_or_else(|| "Current Project".into())
        )
    } else {
        (
            "SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.status, s.cwd FROM sessions s ORDER BY s.created_at DESC LIMIT 15".to_string(),
            "All Projects".to_string()
        )
    };

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        let msg = format!("⚡ No sessions found in {}.\nCreate a new session in TDE first.", ws_name);
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
        return Ok(());
    }

    let mut out = format!("⚡ Sessions in {}:\n", ws_name);
    for row in rows {
        let id: String = row.get("id");
        let display_name: String = row.get("display_name");
        let status: String = row.get("status");

        let is_bound = pairing.bound_session_id.as_deref() == Some(&id);
        let marker = if is_bound { " ◀ [CONNECTED]" } else { "" };
        out.push_str(&format!("• [{}] {} ({}){}\n", id, display_name, status, marker));
    }

    out.push_str("\nTo connect, send: `/switch project session <id>`");
    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &out, pool).await;
    Ok(())
}

async fn switch_session(
    target_id: &str,
    pairing: &RemotePairing,
    pool: &SqlitePool,
) -> Result<(), String> {
    let session_row = sqlx::query(
        "SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.workspace_id, w.name as ws_name, s.status FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id WHERE s.id = $1"
    )
    .bind(target_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = match session_row {
        Some(r) => r,
        None => {
            let msg = format!("❌ Session `{}` not found in TDE.\nUse `/project list session` to see valid IDs.", target_id);
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
            return Ok(());
        }
    };

    let display_name: String = row.get("display_name");
    let workspace_id: Option<String> = row.get("workspace_id");
    let ws_name: Option<String> = row.get("ws_name");
    let status: String = row.get("status");

    // Update pairing record
    sqlx::query(
        "UPDATE remote_pairings SET bound_session_id = $1, bound_workspace_id = COALESCE($2, bound_workspace_id), updated_at = CURRENT_TIMESTAMP WHERE platform = $3 AND chat_id = $4"
    )
    .bind(target_id)
    .bind(&workspace_id)
    .bind(&pairing.platform)
    .bind(&pairing.chat_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let confirm_msg = format!(
        "✅ Connected to TDE Agent Session!\n\n• Session: {}\n• Agent: {}\n• Project: {}\n• Status: {}\n\nYou can now send messages directly to this session.",
        target_id,
        display_name,
        ws_name.unwrap_or_else(|| "Default".into()),
        status
    );

    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &confirm_msg, pool).await;
    Ok(())
}

async fn handle_session_input(
    text: &str,
    pairing: &RemotePairing,
    pool: &SqlitePool,
    manager: &ProcessManager,
) -> Result<(), String> {
    let bound_session_id = match pairing.bound_session_id.as_deref() {
        Some(id) if !id.trim().is_empty() => id,
        _ => {
            let msg = "⚠️ No session currently connected.\nUse `/project list session` then `/switch project session <id>` to connect to a terminal session.";
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
            return Ok(());
        }
    };

    // Forward to active session writer
    let session_active = {
        let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(proc) = active_sessions.get(bound_session_id) {
            let mut writer = proc.writer.lock().map_err(|e| e.to_string())?;
            let payload = format!("{}\n", text);
            writer.write_all(payload.as_bytes()).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            true
        } else {
            false
        }
    };

    if !session_active {
        let msg = format!(
            "⚠️ Session `{}` is not currently running (process terminated).\nUse `/project list session` to see active sessions.",
            bound_session_id
        );
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
    }

    Ok(())
}
