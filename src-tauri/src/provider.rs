use sqlx::{SqlitePool, Row};
use tauri::State;

#[derive(serde::Serialize)]
pub struct ProviderKeyEntry {
    pub provider: String,
    pub has_key: bool,
}

#[tauri::command]
pub async fn save_provider_key(
    provider: String,
    api_key: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO provider_keys (provider, api_key, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)"
    )
    .bind(provider)
    .bind(api_key)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_provider_keys(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProviderKeyEntry>, String> {
    let rows = sqlx::query("SELECT provider FROM provider_keys")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let provider: String = row.get("provider");
        entries.push(ProviderKeyEntry {
            provider,
            has_key: true,
        });
    }

    Ok(entries)
}
