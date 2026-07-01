mod db;
mod process;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Initialize database synchronously on startup using Tauri's async runtime executor
            tauri::async_runtime::block_on(async move {
                let pool = db::initialize_db(&app_handle)
                    .await
                    .expect("Failed to initialize database");
                app_handle.manage(pool);
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
