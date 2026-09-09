use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebPreviewResult {
    pub html: String,
    pub original_url: String,
    pub title: Option<String>,
    pub status_code: u16,
    pub is_proxy_rendered: bool,
}

#[tauri::command]
pub async fn fetch_web_preview(url: String) -> Result<WebPreviewResult, String> {
    tokio::task::spawn_blocking(move || fetch_web_preview_sync(&url))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn fetch_web_preview_sync(url: &str) -> Result<WebPreviewResult, String> {
    let mut normalized_url = url.trim().to_string();
    if !normalized_url.starts_with("http://") && !normalized_url.starts_with("https://") {
        normalized_url = format!("https://{}", normalized_url);
    }

    let output = Command::new("curl")
        .args([
            "-sL",
            "--max-time",
            "12",
            "-A",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "-H",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            &normalized_url,
        ])
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to load web content from {}. Status: {:?}",
            normalized_url, output.status
        ));
    }

    let raw_html = String::from_utf8_lossy(&output.stdout).to_string();
    let title = extract_title(&raw_html);

    // Inject <base href="..."> so that all relative links, CSS, images, and fonts load accurately
    let base_tag = format!("<base href=\"{}\" target=\"_blank\">", normalized_url);
    let mut processed_html = raw_html;

    // Neutralize any frame-busting or X-Frame-Options meta tags
    processed_html = processed_html.replace("http-equiv=\"X-Frame-Options\"", "http-equiv=\"X-Disabled-Frame-Options\"");
    processed_html = processed_html.replace("http-equiv='X-Frame-Options'", "http-equiv='X-Disabled-Frame-Options'");

    if processed_html.to_lowercase().contains("<head") {
        if let Some(idx) = processed_html.to_lowercase().find("<head") {
            if let Some(end_tag_idx) = processed_html[idx..].find('>') {
                let insert_pos = idx + end_tag_idx + 1;
                processed_html.insert_str(insert_pos, &format!("\n  {}", base_tag));
            }
        }
    } else {
        processed_html = format!("{}\n{}", base_tag, processed_html);
    }

    Ok(WebPreviewResult {
        html: processed_html,
        original_url: normalized_url,
        title,
        status_code: 200,
        is_proxy_rendered: true,
    })
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start_idx = lower.find("<title")?;
    let tag_end = lower[start_idx..].find('>')? + start_idx + 1;
    let end_idx = lower[tag_end..].find("</title>")? + tag_end;
    let title = html[tag_end..end_idx].trim().to_string();
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

#[tauri::command]
pub async fn open_in_ego_lite(url: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let ego_app = "/Applications/ego lite.app";
        let user_ego_app = format!("{}/Applications/ego lite.app", std::env::var("HOME").unwrap_or_default());

        let app_to_open = if std::path::Path::new(ego_app).exists() {
            Some(ego_app)
        } else if std::path::Path::new(&user_ego_app).exists() {
            Some(user_ego_app.as_str())
        } else {
            None
        };

        if let Some(app) = app_to_open {
            let _ = Command::new("open")
                .arg("-a")
                .arg(app)
                .arg(&url)
                .spawn();
            return Ok(true);
        }

        // Default open
        let _ = Command::new("open")
            .arg(&url)
            .spawn();

        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}
