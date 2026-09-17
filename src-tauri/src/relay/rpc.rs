use super::protocol::{append_prompt_submit, control_bytes, resolve_allowed_path};
use crate::file_manager::{self, FileEntry};
use crate::git_runner;
use crate::process::ProcessManager;
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use std::path::Path;
use tauri::AppHandle;

const HISTORY_LIMIT: usize = 64 * 1024;
const FILE_READ_LIMIT: u64 = 200 * 1024;
const BINARY_PREVIEW_LIMIT: u64 = 20 * 1024 * 1024;

pub async fn dispatch(
    method: &str,
    params: &Value,
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
) -> Result<Value, String> {
    match method {
        "list_workspaces" => list_workspaces(pool).await,
        "list_sessions" => list_sessions(pool, manager, params).await,
        "resume_session" => resume_session(pool, manager, app_handle, params).await,
        "write_input" => write_input(pool, manager, app_handle, params).await,
        "write_bytes" => write_raw(pool, manager, app_handle, params).await,
        "resize_session" => resize_session(pool, manager, app_handle, params).await,
        "send_control" => send_control(pool, manager, app_handle, params).await,
        "get_session_history" => get_session_history(pool, params).await,
        "list_files" => list_files(pool, params).await,
        "read_file" => read_file(pool, params).await,
        "git_status" => git_status(pool, params).await,
        "git_diff" => git_diff(pool, params).await,
        "git_log" => git_log(pool, params).await,
        "git_commit_files" => git_commit_files_rpc(pool, params).await,
        other => Err(format!("Unknown method: {other}")),
    }
}

async fn workspace_roots(pool: &SqlitePool) -> Result<Vec<String>, String> {
    let rows = sqlx::query("SELECT path FROM workspaces")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|row| row.get::<String, _>("path")).collect())
}

async fn list_workspaces(pool: &SqlitePool) -> Result<Value, String> {
    let rows = sqlx::query("SELECT id, name, path FROM workspaces ORDER BY created_at DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let workspaces: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "name": row.get::<String, _>("name"),
                "path": row.get::<String, _>("path"),
            })
        })
        .collect();
    Ok(json!({ "workspaces": workspaces }))
}

async fn list_sessions(
    pool: &SqlitePool,
    manager: &ProcessManager,
    params: &Value,
) -> Result<Value, String> {
    let workspace_id = params.get("workspaceId").and_then(|v| v.as_str());
    let rows = if let Some(workspace_id) = workspace_id {
        sqlx::query(
            "SELECT s.id, s.name, s.agent_type, s.cwd, s.status, s.workspace_id, w.name as workspace_name
             FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id
             WHERE s.workspace_id = $1
             ORDER BY s.updated_at DESC, s.id DESC",
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT s.id, s.name, s.agent_type, s.cwd, s.status, s.workspace_id, w.name as workspace_name
             FROM sessions s LEFT JOIN workspaces w ON s.workspace_id = w.id
             ORDER BY s.updated_at DESC, s.id DESC",
        )
        .fetch_all(pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    let sessions: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let id: String = row.get("id");
            json!({
                "id": id.clone(),
                "name": row.get::<Option<String>, _>("name"),
                "agentType": row.get::<String, _>("agent_type"),
                "cwd": row.get::<String, _>("cwd"),
                "status": row.get::<String, _>("status"),
                "workspaceId": row.get::<Option<String>, _>("workspace_id"),
                "workspaceName": row.get::<Option<String>, _>("workspace_name"),
                "running": manager.is_active(&id),
            })
        })
        .collect();
    Ok(json!({ "sessions": sessions }))
}

fn optional_u16(params: &Value, key: &str) -> Option<u16> {
    params
        .get(key)
        .and_then(|value| value.as_u64())
        .map(|value| value as u16)
}

async fn ensure_session_running(
    session_id: &str,
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<(), String> {
    if manager.is_active(session_id) {
        return Ok(());
    }
    crate::resume_session_core(
        session_id.to_string(),
        optional_u16(params, "rows").or(Some(24)),
        optional_u16(params, "cols").or(Some(80)),
        pool,
        manager,
        app_handle.clone(),
    )
    .await?;
    Ok(())
}

async fn resume_session(
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    let outcome = crate::resume_session_core(
        session_id.to_string(),
        optional_u16(params, "rows").or(Some(24)),
        optional_u16(params, "cols").or(Some(80)),
        pool,
        manager,
        app_handle.clone(),
    )
    .await?;
    Ok(json!({ "kind": outcome.kind, "running": true }))
}

async fn write_input(
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    let text = required_str(params, "text")?;
    ensure_session_running(session_id, pool, manager, app_handle, params).await?;
    manager.write_bytes(session_id, &append_prompt_submit(text))?;
    Ok(json!({}))
}

async fn write_raw(
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    ensure_session_running(session_id, pool, manager, app_handle, params).await?;
    if let Some(text) = params.get("text").and_then(|value| value.as_str()) {
        manager.write_bytes(session_id, text.as_bytes())?;
        return Ok(json!({}));
    }
    let data_b64 = required_str(params, "dataB64")?;
    let data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data_b64)
        .map_err(|e| format!("Invalid dataB64: {e}"))?;
    manager.write_bytes(session_id, &data)?;
    Ok(json!({}))
}

async fn resize_session(
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    let rows = params
        .get("rows")
        .and_then(|value| value.as_u64())
        .ok_or("Missing rows")?;
    let cols = params
        .get("cols")
        .and_then(|value| value.as_u64())
        .ok_or("Missing cols")?;
    ensure_session_running(session_id, pool, manager, app_handle, params).await?;
    manager.resize(session_id, rows as u16, cols as u16)?;
    Ok(json!({}))
}

async fn send_control(
    pool: &SqlitePool,
    manager: &ProcessManager,
    app_handle: &AppHandle,
    params: &Value,
) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    let key = required_str(params, "key")?;
    ensure_session_running(session_id, pool, manager, app_handle, params).await?;
    manager.write_bytes(session_id, &control_bytes(key)?)?;
    Ok(json!({}))
}

async fn get_session_history(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let session_id = required_str(params, "sessionId")?;
    let rows = sqlx::query(
        "SELECT data FROM (
            SELECT id, data FROM transcripts WHERE session_id = $1 ORDER BY id DESC LIMIT 200
         ) ORDER BY id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    for row in rows {
        history.extend(row.get::<Vec<u8>, _>("data"));
    }
    if history.len() > HISTORY_LIMIT {
        history = history[history.len() - HISTORY_LIMIT..].to_vec();
    }
    Ok(json!({ "dataB64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, history) }))
}

async fn list_files(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let path = required_str(params, "path")?;
    let roots = workspace_roots(pool).await?;
    let resolved = resolve_allowed_path(path, &roots)?;
    let entries: Vec<Value> = file_manager::list_directory(resolved.to_string_lossy().to_string())?
        .into_iter()
        .map(|entry: FileEntry| {
            json!({
                "name": entry.name,
                "path": entry.path,
                "isDir": entry.is_dir,
                "size": entry.size,
            })
        })
        .collect();
    Ok(json!({ "entries": entries }))
}

async fn read_file(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let path = required_str(params, "path")?;
    let roots = workspace_roots(pool).await?;
    let resolved = resolve_allowed_path(path, &roots)?;
    if let Some(mime) = preview_mime(&resolved) {
        let metadata = std::fs::metadata(&resolved).map_err(|e| e.to_string())?;
        if metadata.len() > BINARY_PREVIEW_LIMIT {
            return Err(format!(
                "File is too large to preview remotely ({} MB limit)",
                BINARY_PREVIEW_LIMIT / (1024 * 1024)
            ));
        }
        let data_b64 = file_manager::read_file_base64(resolved.to_string_lossy().to_string())?;
        return Ok(json!({
            "content": "",
            "truncated": false,
            "isBinary": true,
            "mime": mime,
            "dataB64": data_b64,
            "name": resolved.file_name().and_then(|name| name.to_str()).unwrap_or_default(),
        }));
    }
    let result = file_manager::read_file_content(
        resolved.to_string_lossy().to_string(),
        Some(FILE_READ_LIMIT),
    )?;
    Ok(json!({
        "content": result.content,
        "truncated": result.truncated,
        "isBinary": result.is_binary,
    }))
}

fn preview_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => Some("application/pdf"),
        _ => None,
    }
}

async fn git_status(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let cwd = required_str(params, "cwd")?;
    let roots = workspace_roots(pool).await?;
    let resolved = resolve_allowed_path(cwd, &roots)?;
    let path = resolved.to_string_lossy().to_string();
    let branch = git_runner::get_git_branch(path.clone()).unwrap_or_default();
    let files = git_runner::get_git_status(path)?;
    Ok(json!({ "branch": branch, "files": files }))
}

async fn git_diff(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let cwd = required_str(params, "cwd")?;
    let path = required_str(params, "path")?;
    let roots = workspace_roots(pool).await?;
    let resolved_cwd = resolve_allowed_path(cwd, &roots)?;
    let diff = git_runner::get_git_diff(resolved_cwd.to_string_lossy().to_string(), path.to_string())?;
    Ok(json!({ "diff": diff }))
}

async fn git_log(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let cwd = required_str(params, "cwd")?;
    let roots = workspace_roots(pool).await?;
    let resolved = resolve_allowed_path(cwd, &roots)?;
    let commits = git_runner::get_git_commit_log(resolved.to_string_lossy().to_string())?;
    Ok(json!({ "commits": commits }))
}

async fn git_commit_files_rpc(pool: &SqlitePool, params: &Value) -> Result<Value, String> {
    let cwd = required_str(params, "cwd")?;
    let hash = required_str(params, "hash")?;
    let roots = workspace_roots(pool).await?;
    let resolved = resolve_allowed_path(cwd, &roots)?;
    let files = git_runner::get_git_commit_files(resolved.to_string_lossy().to_string(), hash.to_string())?;
    Ok(json!({ "files": files }))
}

fn required_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Missing {key}"))
}
