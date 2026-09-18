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
    manager: &ProcessManager,
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

                let is_running = {
                    let active_map = manager.active_sessions.lock().unwrap();
                    active_map.contains_key(sid)
                };
                let status_icon = if is_running { "🟢" } else { "⚪" };

                if let Some((agent, ws)) = s_info {
                    format!("● 已绑定: {} [{}] ({}) (ID: {})", status_icon, agent, ws, &sid[..sid.len().min(8)])
                } else {
                    format!("● 绑定ID: {} (会话不存在或已删除)", &sid[..sid.len().min(8)])
                }
            } else {
                "○ 暂未连接会话 (使用 /project list session 查看)".to_string()
            };

            let help_text = format!(
                "🤖 TDE 远程控制快捷指令\n\n\
                当前状态:\n{}\n\n\
                常用命令:\n\
                • /help - 查看本命令参考\n\
                • /project list - 列出所有项目工作区 (带序号)\n\
                • /switch project <序号/名称> - 快捷切换项目 (如 /switch project 1)\n\
                • /project list session - 列出当前项目的活跃会话 (带序号)\n\
                • /switch <序号/ID> - 快捷切换连接会话 (如 /switch 1)\n\n\
                💬 直接输入任意文字即可向已连接的 AI Agent 发送消息并执行！",
                session_info
            );

            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &help_text, pool).await;
        }
        "/project" => {
            if parts.len() == 1 {
                list_projects(pairing, pool).await?;
            } else if parts[1] == "list" {
                if parts.len() >= 3 && (parts[2] == "session" || parts[2] == "sessions") {
                    list_sessions(pairing, pool, manager).await?;
                } else {
                    list_projects(pairing, pool).await?;
                }
            } else if parts[1] == "switch" {
                if parts.len() >= 3 {
                    let target = parts[2..].join(" ");
                    switch_project(&target, pairing, pool, manager).await?;
                } else {
                    let msg = "用法: `/project switch <序号/名称>` (例如: `/project switch 1`)";
                    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
                }
            } else {
                // Quick project switch: e.g. /project 1 or /project <name>
                let target = parts[1..].join(" ");
                switch_project(&target, pairing, pool, manager).await?;
            }
        }
        "/workspace" | "/workspaces" => {
            if parts.len() >= 2 && parts[1] == "switch" {
                let target = parts[2..].join(" ");
                switch_project(&target, pairing, pool, manager).await?;
            } else {
                list_projects(pairing, pool).await?;
            }
        }
        "/session" | "/sessions" => {
            if parts.len() >= 2 && parts[1] == "switch" {
                if parts.len() >= 3 {
                    let target = parts[2..].join(" ");
                    switch_session(&target, pairing, pool, manager).await?;
                } else {
                    let msg = "用法: `/session switch <序号/ID>` (例如: `/switch 1`)";
                    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
                }
            } else {
                list_sessions(pairing, pool, manager).await?;
            }
        }
        "/switch" => {
            if parts.len() < 2 {
                let msg = "用法:\n• `/switch project <序号/名称>` - 切换项目\n• `/switch <序号/ID>` - 切换当前项目会话";
                let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
                return Ok(());
            }

            if parts[1] == "project" {
                if parts.len() >= 4 && parts[2] == "session" {
                    // /switch project session <id>
                    let target_id = parts[3..].join(" ");
                    switch_session(&target_id, pairing, pool, manager).await?;
                } else if parts.len() >= 3 {
                    // /switch project <target>
                    let target_ws = parts[2..].join(" ");
                    switch_project(&target_ws, pairing, pool, manager).await?;
                } else {
                    list_projects(pairing, pool).await?;
                }
            } else if parts[1] == "session" {
                if parts.len() >= 3 {
                    let target_id = parts[2..].join(" ");
                    switch_session(&target_id, pairing, pool, manager).await?;
                } else {
                    list_sessions(pairing, pool, manager).await?;
                }
            } else {
                // /switch <target>
                let target = parts[1..].join(" ");
                switch_session(&target, pairing, pool, manager).await?;
            }
        }
        _ => {
            let msg = format!("未知命令: `{}`。发送 `/help` 查看所有可用指令。", root_cmd);
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
        let msg = "📁 TDE 中未找到任何项目工作区。";
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
        return Ok(());
    }

    let mut out = String::from("📁 TDE 项目工作区列表:\n");
    for (idx, row) in rows.iter().enumerate() {
        let id: String = row.get("id");
        let name: String = row.get("name");
        let path: String = row.get("path");

        let is_current = pairing.bound_workspace_id.as_deref() == Some(&id);
        let marker = if is_current { " ◀ [当前绑定]" } else { "" };
        out.push_str(&format!("• [{}] {} ({}){}\n", idx + 1, name, path, marker));
    }

    out.push_str("\n💡 切换项目命令:\n• `/switch project <序号/名称>` (例如: `/switch project 1`)\n• `/project list session` - 查看活跃会话");
    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &out, pool).await;
    Ok(())
}

async fn switch_project(
    target: &str,
    pairing: &RemotePairing,
    pool: &SqlitePool,
    manager: &ProcessManager,
) -> Result<(), String> {
    let clean_target = target.trim();
    let rows = sqlx::query("SELECT id, name, path FROM workspaces ORDER BY created_at ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        let msg = "📁 TDE 中未找到任何项目工作区。";
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
        return Ok(());
    }

    let selected = if let Ok(idx) = clean_target.parse::<usize>() {
        if idx >= 1 && idx <= rows.len() {
            Some(&rows[idx - 1])
        } else {
            None
        }
    } else {
        let target_lower = clean_target.to_lowercase();
        rows.iter().find(|r| {
            let id: String = r.get("id");
            let name: String = r.get("name");
            id.eq_ignore_ascii_case(clean_target)
                || name.to_lowercase() == target_lower
                || name.to_lowercase().contains(&target_lower)
        })
    };

    let ws_row = match selected {
        Some(r) => r,
        None => {
            let msg = format!("❌ 未找到项目工作区: `{}`\n发送 `/project list` 查看项目序号与名称。", clean_target);
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
            return Ok(());
        }
    };

    let ws_id: String = ws_row.get("id");
    let ws_name: String = ws_row.get("name");

    // Check active sessions in this workspace
    let active_sessions_in_ws = sqlx::query(
        "SELECT id, COALESCE(name, agent_type) as display_name FROM sessions WHERE workspace_id = $1 AND status = 'active' ORDER BY created_at DESC"
    )
    .bind(&ws_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Prefer a session currently running in memory
    let running_ids = get_running_session_ids(manager);
    let chosen_session = active_sessions_in_ws.iter().find(|s| {
        let sid: String = s.get("id");
        running_ids.contains(&sid)
    }).or_else(|| active_sessions_in_ws.first());

    let (bound_sid, confirm_msg) = if let Some(s_row) = chosen_session {
        let sid: String = s_row.get("id");
        let s_name: String = s_row.get("display_name");
        (
            Some(sid.clone()),
            format!(
                "✅ 已切换到项目: 【{}】\n🔗 自动连接到活跃会话: 【{}】(ID: {})\n\n💡 现在输入任意文字即可直接与此会话交互！",
                ws_name, s_name, &sid[..sid.len().min(8)]
            )
        )
    } else {
        (
            None,
            format!(
                "✅ 已切换到项目: 【{}】\n⚠️ 该项目当前没有活跃运行的会话。\n在 TDE 中启动新会话后，发送 `/project list session` 查看并连接。",
                ws_name
            )
        )
    };

    sqlx::query(
        "UPDATE remote_pairings SET bound_workspace_id = $1, bound_session_id = $2, updated_at = CURRENT_TIMESTAMP WHERE platform = $3 AND chat_id = $4"
    )
    .bind(&ws_id)
    .bind(&bound_sid)
    .bind(&pairing.platform)
    .bind(&pairing.chat_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &confirm_msg, pool).await;
    Ok(())
}

fn get_running_session_ids(manager: &ProcessManager) -> std::collections::HashSet<String> {
    if let Ok(guard) = manager.active_sessions.lock() {
        guard.keys().cloned().collect()
    } else {
        std::collections::HashSet::new()
    }
}

#[derive(Clone)]
struct SessionItem {
    id: String,
    display_name: String,
    workspace_id: Option<String>,
    ws_name: Option<String>,
}

async fn list_sessions(
    pairing: &RemotePairing,
    pool: &SqlitePool,
    manager: &ProcessManager,
) -> Result<(), String> {
    let (query, ws_name) = if let Some(ref ws_id) = pairing.bound_workspace_id {
        let name: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1")
            .bind(ws_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);
        (
            format!("SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.status, s.cwd FROM sessions s WHERE s.workspace_id = '{}' AND s.status = 'active' ORDER BY s.created_at DESC", ws_id),
            name.unwrap_or_else(|| "当前项目".into())
        )
    } else {
        (
            "SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.status, s.cwd FROM sessions s WHERE s.status = 'active' ORDER BY s.created_at DESC LIMIT 15".to_string(),
            "所有项目".to_string()
        )
    };

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        let msg = format!("⚡ 项目【{}】暂无活跃会话。\n请先在 TDE 中启动 Agent 会话，或发送 `/switch project <序号>` 切换其他项目。", ws_name);
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
        return Ok(());
    }

    let running_ids = get_running_session_ids(manager);

    let mut out = format!("⚡ 项目【{}】活跃会话列表:\n", ws_name);
    for (idx, row) in rows.iter().enumerate() {
        let id: String = row.get("id");
        let display_name: String = row.get("display_name");
        let is_running = running_ids.contains(&id);
        let status_badge = if is_running { "🟢 运行中" } else { "⚪ 已就绪" };

        let is_bound = pairing.bound_session_id.as_deref() == Some(&id);
        let marker = if is_bound { " ◀ [当前连接]" } else { "" };
        out.push_str(&format!("• [{}] {} (ID: {}) [{}]\n", idx + 1, display_name, &id[..id.len().min(8)], status_badge));
        if is_bound {
            out.pop();
            out.push_str(&format!("{}\n", marker));
        }
    }

    out.push_str("\n💡 快速切换会话: 发送 `/switch 1` 或 `/switch <序号/ID>`");
    let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &out, pool).await;
    Ok(())
}

async fn switch_session(
    target_id: &str,
    pairing: &RemotePairing,
    pool: &SqlitePool,
    manager: &ProcessManager,
) -> Result<(), String> {
    let clean_target = target_id.trim();

    // Query active sessions in bound workspace
    let active_query = if let Some(ref ws_id) = pairing.bound_workspace_id {
        format!("SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.workspace_id, w.name as ws_name, s.status FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id WHERE s.workspace_id = '{}' AND s.status = 'active' ORDER BY s.created_at DESC", ws_id)
    } else {
        "SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.workspace_id, w.name as ws_name, s.status FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id WHERE s.status = 'active' ORDER BY s.created_at DESC LIMIT 15".to_string()
    };

    let active_rows: Vec<SessionItem> = sqlx::query(&active_query)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|r| SessionItem {
            id: r.get("id"),
            display_name: r.get("display_name"),
            workspace_id: r.get("workspace_id"),
            ws_name: r.get("ws_name"),
        })
        .collect();

    let matched_item = if let Ok(idx) = clean_target.parse::<usize>() {
        if idx >= 1 && idx <= active_rows.len() {
            Some(active_rows[idx - 1].clone())
        } else {
            None
        }
    } else {
        let target_lower = clean_target.to_lowercase();
        active_rows.iter().find(|r| {
            r.id.starts_with(clean_target)
                || r.id.eq_ignore_ascii_case(clean_target)
                || r.display_name.to_lowercase() == target_lower
        }).cloned()
    };

    let final_item = match matched_item {
        Some(item) => Some(item),
        None => {
            sqlx::query(
                "SELECT s.id, COALESCE(s.name, s.agent_type) as display_name, s.workspace_id, w.name as ws_name, s.status FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id WHERE (s.id = $1 OR s.id LIKE $2) AND s.status = 'active'"
            )
            .bind(clean_target)
            .bind(format!("{}%", clean_target))
            .fetch_optional(pool)
            .await
            .unwrap_or(None)
            .map(|r| SessionItem {
                id: r.get("id"),
                display_name: r.get("display_name"),
                workspace_id: r.get("workspace_id"),
                ws_name: r.get("ws_name"),
            })
        }
    };

    let item = match final_item {
        Some(it) => it,
        None => {
            let msg = format!("❌ 未找到匹配的活跃会话: `{}`\n发送 `/project list session` 查看当前可用会话序号与ID。", clean_target);
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
            return Ok(());
        }
    };

    let is_running = get_running_session_ids(manager).contains(&item.id);
    let status_str = if is_running { "🟢 运行中" } else { "⚪ 已就绪" };

    sqlx::query(
        "UPDATE remote_pairings SET bound_session_id = $1, bound_workspace_id = COALESCE($2, bound_workspace_id), updated_at = CURRENT_TIMESTAMP WHERE platform = $3 AND chat_id = $4"
    )
    .bind(&item.id)
    .bind(&item.workspace_id)
    .bind(&pairing.platform)
    .bind(&pairing.chat_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let confirm_msg = format!(
        "✅ 已连接到会话: 【{}】\n• 会话ID: {}\n• 所属项目: {}\n• 状态: {}\n\n💡 现在直接发送任意文字即可与此会话交互！",
        item.display_name,
        &item.id[..item.id.len().min(8)],
        item.ws_name.unwrap_or_else(|| "默认项目".into()),
        status_str
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
            let msg = "⚠️ 当前未连接到任何会话。\n请使用 `/project list session` 查看可用会话，然后输入 `/switch <序号>` 连接。";
            let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, msg, pool).await;
            return Ok(());
        }
    };

    let clean_input = text.trim();
    if clean_input.is_empty() {
        return Ok(());
    }

    crate::remote_ctl::streamer::close_lark_live_messages_for_session(bound_session_id);

    // Forward to active session writer
    // In raw terminal PTY mode (Antigravity CLI / Ink / readline), Carriage Return '\r' (ASCII 13)
    // is the Enter key that submits the prompt. '\n' only inserts a newline without submitting!
    let session_active = {
        let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(proc) = active_sessions.get(bound_session_id) {
            let mut writer = proc.writer.lock().map_err(|e| e.to_string())?;
            let payload = format!("{}\r", clean_input);
            writer.write_all(payload.as_bytes()).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            true
        } else {
            false
        }
    };

    if !session_active {
        let msg = format!(
            "⚠️ 会话 `{}` 当前未在运行中。\n请发送 `/project list session` 查看活跃会话，或在 TDE 中启动该会话。",
            &bound_session_id[..bound_session_id.len().min(8)]
        );
        let _ = send_to_remote_chat(&pairing.platform, &pairing.chat_id, &msg, pool).await;
    }

    Ok(())
}
