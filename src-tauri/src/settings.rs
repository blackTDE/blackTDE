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

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ProxyProvider {
    pub name: String,
    pub r#type: String,
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
    pub is_default: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ProxyVirtualModel {
    pub name: String,
    pub provider: String,
    pub model: String,
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

// ── Redesigned Proxy Providers CRUD ───────────────────────────────────────────

#[tauri::command]
pub async fn save_proxy_provider(
    name: String,
    r#type: String,
    base_url: String,
    api_key: String,
    default_model: String,
    is_default: bool,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    let default_val = if is_default { 1 } else { 0 };

    if is_default {
        // Clear default flag on all other providers
        sqlx::query("UPDATE proxy_providers SET is_default = 0")
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT OR REPLACE INTO proxy_providers (name, type, base_url, api_key, default_model, is_default) VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(name)
    .bind(r#type)
    .bind(base_url)
    .bind(api_key)
    .bind(default_model)
    .bind(default_val)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_proxy_providers(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProxyProvider>, String> {
    let rows = sqlx::query("SELECT name, type, base_url, api_key, default_model, is_default FROM proxy_providers")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let name: String = row.get("name");
        let r#type: String = row.get("type");
        let base_url: String = row.get("base_url");
        let api_key: String = row.get("api_key");
        let default_model: String = row.get("default_model");
        let is_default: i32 = row.get("is_default");
        
        list.push(ProxyProvider {
            name,
            r#type,
            base_url,
            api_key,
            default_model,
            is_default: is_default == 1,
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn delete_proxy_provider(
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM proxy_providers WHERE name = $1")
        .bind(name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_default_proxy_provider(
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE proxy_providers SET is_default = 0")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE proxy_providers SET is_default = 1 WHERE name = $1")
        .bind(name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Redesigned Proxy Virtual Models CRUD ──────────────────────────────────────

#[tauri::command]
pub async fn save_proxy_virtual_model(
    name: String,
    provider: String,
    model: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO proxy_virtual_models (name, provider, model) VALUES ($1, $2, $3)"
    )
    .bind(name)
    .bind(provider)
    .bind(model)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_proxy_virtual_models(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProxyVirtualModel>, String> {
    let rows = sqlx::query("SELECT name, provider, model FROM proxy_virtual_models")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let name: String = row.get("name");
        let provider: String = row.get("provider");
        let model: String = row.get("model");
        list.push(ProxyVirtualModel { name, provider, model });
    }
    Ok(list)
}

#[tauri::command]
pub async fn delete_proxy_virtual_model(
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM proxy_virtual_models WHERE name = $1")
        .bind(name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
