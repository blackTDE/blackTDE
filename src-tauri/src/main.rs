mod db;
mod process;
mod event_bus;
mod file_manager;
mod git_runner;
mod provider;
mod settings;

use std::io::Write;
use std::path::{Path, PathBuf};
use std::fs;
use std::time::SystemTime;
use tauri::Manager;
use tauri::State;
use sqlx::{SqlitePool, Row};

#[tauri::command]
async fn spawn_session(
    id: String,
    workspace_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    rows: u16,
    cols: u16,
    provider: String,
    resume_session_id: Option<String>,
    privileged: bool,
    pool: State<'_, SqlitePool>,
    manager: State<'_, process::ProcessManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 1. Ensure workspace exists (for foreign key constraint)
    sqlx::query(
        "INSERT OR IGNORE INTO workspaces (id, name, path) VALUES ($1, $2, $3)"
    )
    .bind(&workspace_id)
    .bind("Default Workspace")
    .bind(&cwd)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. Resolve provider details via virtual models mapping or default provider
    let clean_cmd = command.split(|c| c == '/' || c == '\\').last().unwrap_or(&command).to_lowercase();
    let virtual_model_row = sqlx::query(
        "SELECT provider, model FROM proxy_virtual_models WHERE name = $1"
    )
    .bind(&clean_cmd)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut provider_name = None;
    let mut model_override = None;

    if let Some(row) = virtual_model_row {
        provider_name = Some(row.get::<String, _>("provider"));
        model_override = Some(row.get::<String, _>("model"));
    } else {
        // Fallback to default provider
        let default_prov_row = sqlx::query(
            "SELECT name, default_model FROM proxy_providers WHERE is_default = 1"
        )
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = default_prov_row {
            provider_name = Some(row.get::<String, _>("name"));
            model_override = Some(row.get::<String, _>("default_model"));
        }
    }

    let mut envs = Vec::new();

    // Check if there is an active local proxy
    let active_local_proxy = sqlx::query(
        "SELECT provider, base_url, default_model FROM local_proxies WHERE active = 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(lp) = active_local_proxy {
        let lp_provider: String = lp.get("provider");
        let lp_base_url: String = lp.get("base_url");
        let lp_default_model: String = lp.get("default_model");

        if model_override.is_none() {
            model_override = Some(lp_default_model);
        }

        let base = lp_base_url.trim_end_matches('/').to_string();

        let mut api_key = String::new();
        let key_row = sqlx::query(
            "SELECT api_key FROM provider_keys WHERE provider = $1"
        )
        .bind(&lp_provider)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = key_row {
            api_key = row.get("api_key");
        } else {
            let prov_row = sqlx::query(
                "SELECT api_key FROM proxy_providers WHERE name = $1"
            )
            .bind(&lp_provider)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            if let Some(row) = prov_row {
                api_key = row.get("api_key");
            }
        }

        let active_key = if api_key.is_empty() { "proxy-dummy-key".to_string() } else { api_key };

        let mut anthropic_url = base.clone();
        if anthropic_url.ends_with("/v1") {
            anthropic_url = anthropic_url[..anthropic_url.len() - 3].to_string();
        }
        anthropic_url = format!("{}/anthropic", anthropic_url.trim_end_matches('/'));

        let mut openai_url = base.clone();
        if !openai_url.ends_with("/v1") {
            openai_url = format!("{}/v1", openai_url.trim_end_matches('/'));
        }

        let mut gemini_url = base.clone();
        if gemini_url.ends_with("/v1") {
            gemini_url = gemini_url[..gemini_url.len() - 3].to_string();
        }

        envs.push(("ANTHROPIC_BASE_URL".to_string(), anthropic_url));
        envs.push(("ANTHROPIC_API_KEY".to_string(), active_key.clone()));
        envs.push(("OPENAI_BASE_URL".to_string(), openai_url));
        envs.push(("OPENAI_API_KEY".to_string(), active_key.clone()));
        envs.push(("GEMINI_BASE_URL".to_string(), gemini_url.clone()));
        envs.push(("GOOGLE_GEMINI_BASE_URL".to_string(), gemini_url));
        envs.push(("GEMINI_API_KEY".to_string(), active_key));
    } else if let Some(p_name) = provider_name {
        let provider_row = sqlx::query(
            "SELECT type, base_url, api_key FROM proxy_providers WHERE name = $1"
        )
        .bind(&p_name)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = provider_row {
            let p_type: String = row.get("type");
            let base_url: String = row.get("base_url");
            let api_key: String = row.get("api_key");

            if p_type == "openai" {
                envs.push(("OPENAI_BASE_URL".to_string(), base_url.clone()));
                envs.push(("OPENAI_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                
                if clean_cmd == "claude" {
                    envs.push(("ANTHROPIC_BASE_URL".to_string(), format!("{}/anthropic", base_url.trim_end_matches('/'))));
                    envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                }
            } else if p_type == "anthropic" {
                envs.push(("ANTHROPIC_BASE_URL".to_string(), base_url.clone()));
                envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                envs.push(("OPENAI_BASE_URL".to_string(), base_url.clone()));
                envs.push(("OPENAI_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
            }
        }
    }

    let has_anthropic_key = envs.iter().any(|(k, _)| k == "ANTHROPIC_API_KEY");
    if !has_anthropic_key && (provider == "anthropic" || clean_cmd == "claude") {
        envs.push(("ANTHROPIC_API_KEY".to_string(), "dummy-proxy-key".to_string()));
    }
    let has_openai_key = envs.iter().any(|(k, _)| k == "OPENAI_API_KEY");
    if !has_openai_key && (provider == "openai" || clean_cmd == "aider") {
        envs.push(("OPENAI_API_KEY".to_string(), "dummy-proxy-key".to_string()));
    }

    // 4. Adapt CLI options & handle session resume
    let mut command_args = args.clone();
    if let Some(ref m_override) = model_override {
        if clean_cmd == "aider" {
            if !command_args.iter().any(|arg| arg == "--model") {
                command_args.push("--model".to_string());
                command_args.push(m_override.clone());
            }
        } else if clean_cmd == "claude" {
            if !envs.iter().any(|(k, _)| k == "CLAUDE_MODEL") {
                envs.push(("CLAUDE_MODEL".to_string(), m_override.clone()));
            }
        }
    }

    let is_agent = matches!(clean_cmd.as_str(), "claude" | "codex" | "opencode" | "open-code" | "gemini" | "pi" | "pi-agent");
    if is_agent {
        if clean_cmd == "claude" {
            if privileged {
                if !command_args.iter().any(|arg| arg == "--dangerously-skip-permissions") {
                    command_args.push("--dangerously-skip-permissions".to_string());
                }
            }
            if !command_args.iter().any(|arg| arg == "--output-format") {
                command_args.push("--output-format".to_string());
                command_args.push("stream-json".to_string());
            }
        }
        if let Some(ref r_id) = resume_session_id {
            if !r_id.trim().is_empty() {
                if !command_args.iter().any(|arg| arg == "--resume") {
                    command_args.push("--resume".to_string());
                    command_args.push(r_id.clone());
                }
            }
        }
    }

    // 5. Insert session record to DB
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, agent_type, cwd, status, provider, model) VALUES ($1, $2, $3, $4, 'active', $5, $6)"
    )
    .bind(&id)
    .bind(&workspace_id)
    .bind(&command)
    .bind(&cwd)
    .bind(&provider)
    .bind(&model_override)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 6. Spawn PTY process with injected environment variables
    let mut resolved_command = command.clone();
    if command == "zsh" {
        resolved_command = "/bin/zsh".to_string();
    } else if command == "bash" {
        resolved_command = "/bin/bash".to_string();
    } else if command == "sh" {
        resolved_command = "/bin/sh".to_string();
    }

    let active_process = process::spawn_pty_process(&resolved_command, command_args, &cwd, rows, cols, envs)
        .map_err(|e| e.to_string())?;

    let master_clone = active_process.master.clone();

    // 7. Register active session in process manager
    {
        let mut active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        active_sessions.insert(id.clone(), active_process);
    }

    // 8. Start stdout reader loop
    event_bus::start_stdout_reader(id, master_clone, pool.inner().clone(), app_handle);

    Ok(())
}

#[tauri::command]
async fn write_to_session(
    id: String,
    data: Vec<u8>,
    manager: State<'_, process::ProcessManager>,
) -> Result<(), String> {
    let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
    if let Some(proc) = active_sessions.get(&id) {
        let mut writer = proc.writer.lock().map_err(|e| e.to_string())?;
        writer.write_all(&data).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Session {} not found", id));
    }
    Ok(())
}

#[tauri::command]
async fn resize_session(
    id: String,
    rows: u16,
    cols: u16,
    manager: State<'_, process::ProcessManager>,
) -> Result<(), String> {
    let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
    if let Some(proc) = active_sessions.get(&id) {
        let master = proc.master.lock().map_err(|e| e.to_string())?;
        master.resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Session {} not found", id));
    }
    Ok(())
}

#[tauri::command]
async fn delete_session(
    id: String,
    pool: State<'_, SqlitePool>,
    manager: State<'_, process::ProcessManager>,
) -> Result<(), String> {
    {
        let mut active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(proc) = active_sessions.remove(&id) {
            let mut child = proc.child.lock().map_err(|e| e.to_string())?;
            let _ = child.kill();
        }
    }

    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_session_history(
    id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<u8>, String> {
    let rows = sqlx::query("SELECT data FROM transcripts WHERE session_id = $1 ORDER BY id ASC")
        .bind(&id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    for row in rows {
        let chunk: Vec<u8> = row.get("data");
        history.extend(chunk);
    }
    Ok(history)
}

#[tauri::command]
async fn detect_available_clis() -> Result<Vec<String>, String> {
    let common_commands = vec![
        "zsh", "bash", "sh", "fish",
        "claude", "aider", "git", "gh", "node", "python3"
    ];

    let path_var = std::env::var("PATH").unwrap_or_default();
    let paths: Vec<&str> = path_var.split(':').collect();

    let mut detected = Vec::new();
    for cmd in common_commands {
        let mut found = false;
        for p in &paths {
            let path = std::path::Path::new(p).join(cmd);
            if path.exists() && path.is_file() {
                found = true;
                break;
            }
        }
        
        // Check standard macOS absolute locations as fallback (in case PATH is not fully populated in the environment context)
        if !found {
            let fallbacks = match cmd {
                "zsh" => vec!["/bin/zsh", "/usr/bin/zsh"],
                "bash" => vec!["/bin/bash", "/usr/bin/bash"],
                "sh" => vec!["/bin/sh", "/usr/bin/sh"],
                "fish" => vec!["/usr/local/bin/fish", "/opt/homebrew/bin/fish"],
                "claude" => vec!["/usr/local/bin/claude", "/opt/homebrew/bin/claude"],
                "aider" => vec!["/usr/local/bin/aider", "/opt/homebrew/bin/aider"],
                "git" => vec!["/usr/bin/git", "/usr/local/bin/git"],
                _ => vec![],
            };
            for fb in fallbacks {
                if std::path::Path::new(fb).exists() {
                    found = true;
                    break;
                }
            }
        }

        if found {
            detected.push(cmd.to_string());
        }
    }

    Ok(detected)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct WorkspaceEntry {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[tauri::command]
async fn list_workspaces(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<WorkspaceEntry>, String> {
    let rows = sqlx::query("SELECT id, name, path FROM workspaces ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        let name: String = row.get("name");
        let path: String = row.get("path");
        entries.push(WorkspaceEntry { id, name, path });
    }
    Ok(entries)
}

#[tauri::command]
async fn select_directory() -> Result<Option<String>, String> {
    let dir = rfd::AsyncFileDialog::new()
        .pick_folder()
        .await;
    Ok(dir.map(|d| d.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn create_workspace(
    id: String,
    name: String,
    path: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("INSERT INTO workspaces (id, name, path) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(name)
        .bind(path)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_workspace(
    id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct PastSession {
    pub id: String,
    pub agent_type: String,
    pub cwd: String,
    pub remote_session_id: Option<String>,
    pub status: String,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
async fn list_past_sessions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PastSession>, String> {
    let rows = sqlx::query("SELECT id, agent_type, cwd, remote_session_id, status, provider, model FROM sessions ORDER BY id DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        let agent_type: String = row.get("agent_type");
        let cwd: String = row.get("cwd");
        let remote_session_id: Option<String> = row.get("remote_session_id");
        let status: String = row.get("status");
        let provider: Option<String> = row.get("provider");
        let model: Option<String> = row.get("model");
        entries.push(PastSession {
            id,
            agent_type,
            cwd,
            remote_session_id,
            status,
            provider,
            model,
        });
    }
    Ok(entries)
}

#[tauri::command]
async fn list_active_session_ids(
    manager: State<'_, process::ProcessManager>,
) -> Result<Vec<String>, String> {
    let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
    let ids: Vec<String> = active_sessions.keys().cloned().collect();
    Ok(ids)
}

#[tauri::command]
async fn clear_terminated_sessions(
    pool: State<'_, SqlitePool>,
    manager: State<'_, process::ProcessManager>,
) -> Result<(), String> {
    let active_ids: Vec<String> = {
        let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        active_sessions.keys().cloned().collect()
    };

    if active_ids.is_empty() {
        sqlx::query("DELETE FROM sessions")
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        let placeholders = active_ids.iter().enumerate().map(|(i, _)| format!("${}", i + 1)).collect::<Vec<_>>().join(",");
        let query_str = format!("DELETE FROM sessions WHERE id NOT IN ({})", placeholders);
        let mut query = sqlx::query(&query_str);
        for id in &active_ids {
            query = query.bind(id);
        }
        query.execute(&*pool).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn get_claude_project_key(cwd: &str) -> String {
    let mut sanitized = String::new();
    for c in cwd.chars() {
        if c.is_ascii_alphanumeric() {
            sanitized.push(c);
        } else {
            sanitized.push('-');
        }
    }

    if sanitized.len() <= 200 {
        sanitized
    } else {
        // Calculate simple hash matching JS absolute value behaviors
        let mut h: i64 = 0;
        for ch in cwd.chars() {
            let char_val = ch as i64;
            h = (h << 5) - h + char_val;
            h = h & 0xFFFFFFFF; // coerce to 32-bit
        }
        let h_u32 = h as u32;
        let h_abs = if (h_u32 as i32) < 0 {
            (-(h_u32 as i32)) as u32
        } else {
            h_u32
        };
        
        let mut base36 = String::new();
        let digits = b"0123456789abcdefghijklmnopqrstuvwxyz";
        let mut n = h_abs;
        if n == 0 {
            base36.push('0');
        } else {
            while n > 0 {
                base36.push(digits[(n % 36) as usize] as char);
                n /= 36;
            }
        }
        let hash_str: String = base36.chars().rev().collect();
        format!("{}-{}", &sanitized[..200], hash_str)
    }
}

fn find_latest_file_in_dir(dir: &Path, extension: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    let mut latest_file = None;
    let mut latest_mtime = SystemTime::UNIX_EPOCH;
    
    fn walk_dir(dir: &Path, extension: &str, latest_file: &mut Option<PathBuf>, latest_mtime: &mut SystemTime) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_dir() {
                        walk_dir(&path, extension, latest_file, latest_mtime);
                    } else if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some(extension) {
                        if let Ok(metadata) = fs::metadata(&path) {
                            if let Ok(modified) = metadata.modified() {
                                if modified > *latest_mtime {
                                    *latest_mtime = modified;
                                    *latest_file = Some(path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    walk_dir(dir, extension, &mut latest_file, &mut latest_mtime);
    latest_file
}

#[tauri::command]
async fn get_remote_session_id(
    id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<String>, String> {
    // 1. Fetch details of the session from DB
    let row = sqlx::query("SELECT agent_type, cwd, remote_session_id FROM sessions WHERE id = $1")
        .bind(&id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let (command, cwd, remote_id) = match row {
        Some(r) => {
            let cmd: String = r.get("agent_type");
            let dir: String = r.get("cwd");
            let rid: Option<String> = r.get("remote_session_id");
            (cmd, dir, rid)
        }
        None => return Ok(None),
    };

    // If already resolved, return it
    if let Some(ref rid_val) = remote_id {
        if !rid_val.trim().is_empty() {
            return Ok(Some(rid_val.clone()));
        }
    }

    // Try to auto-resolve/heal session ID from local directories based on agent type
    let clean_cmd = command.split(|c| c == '/' || c == '\\').last().unwrap_or(&command).to_lowercase();
    let home = std::env::var("HOME").ok().map(PathBuf::from);

    if let Some(home_path) = home {
        if clean_cmd == "claude" {
            let project_key = get_claude_project_key(&cwd);
            let project_dir = home_path.join(".claude").join("projects").join(&project_key);
            if let Some(latest_path) = find_latest_file_in_dir(&project_dir, "jsonl") {
                if let Some(stem) = latest_path.file_stem().and_then(|s| s.to_str()) {
                    let resolved = stem.to_string();
                    // Update database
                    sqlx::query("UPDATE sessions SET remote_session_id = $1 WHERE id = $2")
                        .bind(&resolved)
                        .bind(&id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    return Ok(Some(resolved));
                }
            }
        } else if clean_cmd == "codex" {
            let codex_dir = home_path.join(".codex").join("sessions");
            if let Some(latest_path) = find_latest_file_in_dir(&codex_dir, "jsonl") {
                if let Some(stem) = latest_path.file_stem().and_then(|s| s.to_str()) {
                    let resolved = stem.to_string();
                    // Update database
                    sqlx::query("UPDATE sessions SET remote_session_id = $1 WHERE id = $2")
                        .bind(&resolved)
                        .bind(&id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    return Ok(Some(resolved));
                }
            }
        } else if clean_cmd == "opencode" || clean_cmd == "open-code" {
            let opencode_dir = home_path.join(".local").join("share").join("opencode").join("project");
            if let Some(latest_path) = find_latest_file_in_dir(&opencode_dir, "json") {
                if let Some(stem) = latest_path.file_stem().and_then(|s| s.to_str()) {
                    let resolved = stem.to_string();
                    // Update database
                    sqlx::query("UPDATE sessions SET remote_session_id = $1 WHERE id = $2")
                        .bind(&resolved)
                        .bind(&id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    return Ok(Some(resolved));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
async fn resume_terminated_session(
    id: String,
    pool: State<'_, SqlitePool>,
    manager: State<'_, process::ProcessManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 1. Check if the session is already active in process manager
    {
        let active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        if active_sessions.contains_key(&id) {
            return Ok(()); // Already running
        }
    }

    // 2. Fetch session details from SQLite
    let session_row = sqlx::query(
        "SELECT workspace_id, agent_type, cwd, remote_session_id, provider, model FROM sessions WHERE id = $1"
    )
    .bind(&id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = match session_row {
        Some(r) => r,
        None => return Err(format!("Session {} not found in database", id)),
    };

    let _workspace_id: String = row.get("workspace_id");
    let command: String = row.get("agent_type");
    let cwd: String = row.get("cwd");
    let remote_session_id: Option<String> = row.get("remote_session_id");
    let provider: String = row.get("provider");
    let model: Option<String> = row.get("model");

    let clean_cmd = command.split(|c| c == '/' || c == '\\').last().unwrap_or(&command).to_lowercase();

    // 3. Resolve environment variables and arguments
    let mut envs = Vec::new();
    let mut model_override = model.clone();

    // Check active local proxy
    let active_local_proxy = sqlx::query(
        "SELECT provider, base_url, default_model FROM local_proxies WHERE active = 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(lp) = active_local_proxy {
        let lp_provider: String = lp.get("provider");
        let lp_base_url: String = lp.get("base_url");
        let lp_default_model: String = lp.get("default_model");

        if model_override.is_none() {
            model_override = Some(lp_default_model);
        }

        let base = lp_base_url.trim_end_matches('/').to_string();

        let mut api_key = String::new();
        let key_row = sqlx::query("SELECT api_key FROM provider_keys WHERE provider = $1")
            .bind(&lp_provider)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(r) = key_row {
            api_key = r.get("api_key");
        } else {
            let prov_row = sqlx::query("SELECT api_key FROM proxy_providers WHERE name = $1")
                .bind(&lp_provider)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            if let Some(r) = prov_row {
                api_key = r.get("api_key");
            }
        }

        let active_key = if api_key.is_empty() { "proxy-dummy-key".to_string() } else { api_key };

        let mut anthropic_url = base.clone();
        if anthropic_url.ends_with("/v1") {
            anthropic_url = anthropic_url[..anthropic_url.len() - 3].to_string();
        }
        anthropic_url = format!("{}/anthropic", anthropic_url.trim_end_matches('/'));

        let mut openai_url = base.clone();
        if !openai_url.ends_with("/v1") {
            openai_url = format!("{}/v1", openai_url.trim_end_matches('/'));
        }

        let mut gemini_url = base.clone();
        if gemini_url.ends_with("/v1") {
            gemini_url = gemini_url[..gemini_url.len() - 3].to_string();
        }

        envs.push(("ANTHROPIC_BASE_URL".to_string(), anthropic_url));
        envs.push(("ANTHROPIC_API_KEY".to_string(), active_key.clone()));
        envs.push(("OPENAI_BASE_URL".to_string(), openai_url));
        envs.push(("OPENAI_API_KEY".to_string(), active_key.clone()));
        envs.push(("GEMINI_BASE_URL".to_string(), gemini_url.clone()));
        envs.push(("GOOGLE_GEMINI_BASE_URL".to_string(), gemini_url));
        envs.push(("GEMINI_API_KEY".to_string(), active_key));
    } else {
        // Fallback to proxy_providers
        let provider_row = sqlx::query(
            "SELECT type, base_url, api_key FROM proxy_providers WHERE name = $1"
        )
        .bind(&provider)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = provider_row {
            let p_type: String = row.get("type");
            let base_url: String = row.get("base_url");
            let api_key: String = row.get("api_key");

            if p_type == "openai" {
                envs.push(("OPENAI_BASE_URL".to_string(), base_url.clone()));
                envs.push(("OPENAI_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                if clean_cmd == "claude" {
                    envs.push(("ANTHROPIC_BASE_URL".to_string(), format!("{}/anthropic", base_url.trim_end_matches('/'))));
                    envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                }
            } else if p_type == "anthropic" {
                envs.push(("ANTHROPIC_BASE_URL".to_string(), base_url.clone()));
                envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                envs.push(("OPENAI_BASE_URL".to_string(), base_url.clone()));
                envs.push(("OPENAI_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
            }
        }
    }

    let has_anthropic_key = envs.iter().any(|(k, _)| k == "ANTHROPIC_API_KEY");
    if !has_anthropic_key && (provider == "anthropic" || clean_cmd == "claude") {
        envs.push(("ANTHROPIC_API_KEY".to_string(), "dummy-proxy-key".to_string()));
    }
    let has_openai_key = envs.iter().any(|(k, _)| k == "OPENAI_API_KEY");
    if !has_openai_key && (provider == "openai" || clean_cmd == "aider") {
        envs.push(("OPENAI_API_KEY".to_string(), "dummy-proxy-key".to_string()));
    }

    // 4. Construct CLI arguments
    let mut command_args = Vec::new();
    if let Some(ref m_override) = model_override {
        if clean_cmd == "aider" {
            command_args.push("--model".to_string());
            command_args.push(m_override.clone());
        } else if clean_cmd == "claude" {
            envs.push(("CLAUDE_MODEL".to_string(), m_override.clone()));
        }
    }

    // Standard agent list for auto-resume
    let is_agent = matches!(clean_cmd.as_str(), "claude" | "codex" | "opencode" | "open-code" | "gemini" | "pi" | "pi-agent");
    if is_agent {
        if clean_cmd == "claude" {
            // Default skip permission is true for resume
            command_args.push("--dangerously-skip-permissions".to_string());
            command_args.push("--output-format".to_string());
            command_args.push("stream-json".to_string());
        }

        if let Some(ref r_id) = remote_session_id {
            if !r_id.trim().is_empty() {
                command_args.push("--resume".to_string());
                command_args.push(r_id.clone());
            }
        }
    }

    // 5. Spawn PTY process
    let mut resolved_command = command.clone();
    if command == "zsh" {
        resolved_command = "/bin/zsh".to_string();
    } else if command == "bash" {
        resolved_command = "/bin/bash".to_string();
    } else if command == "sh" {
        resolved_command = "/bin/sh".to_string();
    }

    let active_process = process::spawn_pty_process(&resolved_command, command_args, &cwd, 24, 80, envs)
        .map_err(|e| e.to_string())?;

    let master_clone = active_process.master.clone();

    // 6. Register in process manager
    {
        let mut active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        active_sessions.insert(id.clone(), active_process);
    }

    // 7. Start stdout reader
    event_bus::start_stdout_reader(id, master_clone, pool.inner().clone(), app_handle);

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Initialize process manager state
            let process_manager = process::ProcessManager::default();
            app.manage(process_manager);

            // Initialize database synchronously on startup using Tauri's async runtime executor
            tauri::async_runtime::block_on(async move {
                let pool = db::initialize_db(&app_handle)
                    .await
                    .expect("Failed to initialize database");
                app_handle.manage(pool);
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_session,
            write_to_session,
            resize_session,
            delete_session,
            get_session_history,
            file_manager::list_directory,
            file_manager::read_file_content,
            file_manager::write_file_content,
            file_manager::read_file_base64,
            git_runner::get_git_status,
            git_runner::get_git_diff,
            git_runner::git_stage_file,
            git_runner::git_unstage_file,
            git_runner::git_commit_changes,
            git_runner::get_git_branch,
            git_runner::get_git_commit_log,
            git_runner::get_git_commit_files,
            git_runner::get_git_file_content_at_rev,
            provider::save_provider_key,
            provider::get_provider_keys,
            settings::save_local_proxy,
            settings::get_local_proxies,
            settings::save_mcp_server,
            settings::get_mcp_servers,
            settings::check_cli_version,
            settings::save_proxy_provider,
            settings::get_proxy_providers,
            settings::delete_proxy_provider,
            settings::set_default_proxy_provider,
            settings::save_proxy_virtual_model,
            settings::get_proxy_virtual_models,
            settings::delete_proxy_virtual_model,
            list_past_sessions,
            list_active_session_ids,
            get_remote_session_id,
            clear_terminated_sessions,
            resume_terminated_session,
            list_workspaces,
            detect_available_clis,
            create_workspace,
            delete_workspace,
            select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
