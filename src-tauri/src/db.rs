use std::fs;
use tauri::Manager;
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};

pub async fn initialize_db(app_handle: &tauri::AppHandle) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    // Resolve the application data directory
    let app_dir = app_handle.path().app_data_dir()?;
    
    // Ensure the directory exists
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }

    let db_path = app_dir.join("tde.db");

    // Configure connection options
    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    // Create the connection pool
    let pool = SqlitePool::connect_with(connect_options).await?;

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;

    Ok(pool)
}
