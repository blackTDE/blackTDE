mod db;
mod process;
mod event_bus;
mod file_manager;
mod git_runner;
mod provider;
mod settings;

use std::io::Write;
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

    if let Some(p_name) = provider_name {
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
                
                // If it's Claude CLI, direct it to the openai proxy endpoint but using anthropic paths
                if clean_cmd == "claude" {
                    envs.push(("ANTHROPIC_BASE_URL".to_string(), format!("{}/anthropic", base_url.trim_end_matches('/'))));
                    envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                }
            } else if p_type == "anthropic" {
                envs.push(("ANTHROPIC_BASE_URL".to_string(), base_url.clone()));
                envs.push(("ANTHROPIC_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
                
                // Also set OpenAI compatibility envs if Aider/other clients need it
                envs.push(("OPENAI_BASE_URL".to_string(), base_url.clone()));
                envs.push(("OPENAI_API_KEY".to_string(), if api_key.is_empty() { "dummy-proxy-key".to_string() } else { api_key.clone() }));
            }
        }
    }

    // Ensure fallback dummy keys are injected if envs are empty (to prevent startup validation errors)
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
    if command == "claude" {
        // Run Claude Code CLI in stream-json mode to auto-capture session ID
        command_args.extend(vec![
            "--dangerously-skip-permissions".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string()
        ]);
        if let Some(ref r_id) = resume_session_id {
            if !r_id.trim().is_empty() {
                command_args.extend(vec![
                    "--resume".to_string(),
                    r_id.clone()
                ]);
            }
        }
    }

    // 5. Insert session record to DB
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, agent_type, cwd, status) VALUES ($1, $2, $3, $4, 'active')"
    )
    .bind(&id)
    .bind(&workspace_id)
    .bind(&command)
    .bind(&cwd)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 6. Spawn PTY process with injected environment variables
    let active_process = process::spawn_pty_process(&command, command_args, &cwd, rows, cols, envs)
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
async fn terminate_session(
    id: String,
    manager: State<'_, process::ProcessManager>,
) -> Result<(), String> {
    let mut active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
    if let Some(proc) = active_sessions.remove(&id) {
        let mut child = proc.child.lock().map_err(|e| e.to_string())?;
        child.kill().map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Session {} not found", id));
    }
    Ok(())
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
}

#[tauri::command]
async fn list_past_sessions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PastSession>, String> {
    let rows = sqlx::query("SELECT id, agent_type, cwd, remote_session_id, status FROM sessions ORDER BY id DESC")
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
        entries.push(PastSession {
            id,
            agent_type,
            cwd,
            remote_session_id,
            status,
        });
    }
    Ok(entries)
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
            terminate_session,
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
            list_workspaces,
            create_workspace,
            delete_workspace,
            select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
