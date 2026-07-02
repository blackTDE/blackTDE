use sqlx::{SqlitePool, Row};
use tauri::State;
use std::process::Command;

#[derive(serde::Serialize)]
pub struct LocalProxyEntry {
    pub id: String,
    pub provider: String,
    pub base_url: String,
    pub default_model: String,
    pub active: bool,
}

#[derive(serde::Serialize)]
pub struct McpServerEntry {
    pub name: String,
    pub command: String,
    pub args: String,
}

#[tauri::command]
pub async fn save_local_proxy(
    id: String,
    provider: String,
    base_url: String,
    default_model: String,
    active: bool,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    let active_int = if active { 1 } else { 0 };

    if active {
        // Deactivate all other proxies
        sqlx::query("UPDATE local_proxies SET active = 0")
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT OR REPLACE INTO local_proxies (id, provider, base_url, default_model, active) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(id)
    .bind(provider)
    .bind(base_url)
    .bind(default_model)
    .bind(active_int)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_local_proxies(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<LocalProxyEntry>, String> {
    let rows = sqlx::query("SELECT id, provider, base_url, default_model, active FROM local_proxies")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        let provider: String = row.get("provider");
        let base_url: String = row.get("base_url");
        let default_model: String = row.get("default_model");
        let active: i32 = row.get("active");
        entries.push(LocalProxyEntry {
            id,
            provider,
            base_url,
            default_model,
            active: active == 1,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn save_mcp_server(
    name: String,
    command: String,
    args: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO mcp_servers (name, command, args) VALUES ($1, $2, $3)"
    )
    .bind(name)
    .bind(command)
    .bind(args)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_mcp_servers(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<McpServerEntry>, String> {
    let rows = sqlx::query("SELECT name, command, args FROM mcp_servers")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let name: String = row.get("name");
        let command: String = row.get("command");
        let args: String = row.get("args");
        entries.push(McpServerEntry { name, command, args });
    }

    Ok(entries)
}

#[tauri::command]
pub fn check_cli_version(binary: String) -> Result<String, String> {
    // Restrict binary argument strictly for security
    if binary != "claude" && binary != "aider" && binary != "git" {
        return Err("Unsupported binary check".into());
    }

    let output = Command::new(&binary)
        .arg("--version")
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
            } else {
                Ok(String::from_utf8_lossy(&out.stderr).trim().to_string())
            }
        }
        Err(_) => {
            // Fallback for some command variants (-v)
            let out_v = Command::new(&binary)
                .arg("-v")
                .output();
            match out_v {
                Ok(out) => {
                    if out.status.success() {
                        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
                    } else {
                        Err(format!("Binary '{}' is not installed", binary))
                    }
                }
                Err(_) => Err(format!("Binary '{}' is not installed or not in PATH", binary)),
            }
        }
    }
}
