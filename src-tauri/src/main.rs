mod db;
mod process;
mod event_bus;

use std::io::Write;
use tauri::Manager;
use tauri::State;
use sqlx::SqlitePool;

#[tauri::command]
async fn spawn_session(
    id: String,
    workspace_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    rows: u16,
    cols: u16,
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

    // 2. Insert session record to DB
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

    // 3. Spawn PTY process
    let active_process = process::spawn_pty_process(&command, args, &cwd, rows, cols)
        .map_err(|e| e.to_string())?;

    let master_clone = active_process.master.clone();

    // 4. Register active session in process manager
    {
        let mut active_sessions = manager.active_sessions.lock().map_err(|e| e.to_string())?;
        active_sessions.insert(id.clone(), active_process);
    }

    // 5. Start stdout reader loop
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
            terminate_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
