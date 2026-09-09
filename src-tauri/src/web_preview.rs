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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EgoLiteStatus {
    pub is_installed: bool,
    pub app_path: Option<String>,
    pub cli_installed: bool,
    pub cli_path: Option<String>,
    pub cli_version: Option<String>,
    pub os_supported: bool,
    pub architecture: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EgoLiteInstallResult {
    pub success: bool,
    pub message: String,
    pub app_path: Option<String>,
    pub logs: Vec<String>,
}

#[tauri::command]
pub async fn check_ego_lite_status() -> Result<EgoLiteStatus, String> {
    tokio::task::spawn_blocking(|| {
        let is_mac = cfg!(target_os = "macos");
        let arch = std::env::consts::ARCH.to_string();

        if !is_mac {
            return Ok(EgoLiteStatus {
                is_installed: false,
                app_path: None,
                cli_installed: false,
                cli_path: None,
                cli_version: None,
                os_supported: false,
                architecture: arch,
            });
        }

        let sys_app = "/Applications/ego lite.app";
        let home = std::env::var("HOME").unwrap_or_default();
        let user_app = format!("{}/Applications/ego lite.app", home);

        let app_path = if std::path::Path::new(sys_app).exists() {
            Some(sys_app.to_string())
        } else if std::path::Path::new(&user_app).exists() {
            Some(user_app)
        } else {
            None
        };

        let user_cli = format!("{}/.local/bin/ego-browser", home);
        let cli_path = if std::path::Path::new(&user_cli).exists() {
            Some(user_cli)
        } else if let Ok(out) = Command::new("which").arg("ego-browser").output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let cli_version = if let Some(ref path) = cli_path {
            if let Ok(out) = Command::new(path).arg("--version").output() {
                if out.status.success() {
                    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                } else {
                    Some("installed".to_string())
                }
            } else {
                Some("installed".to_string())
            }
        } else {
            None
        };

        Ok(EgoLiteStatus {
            is_installed: app_path.is_some(),
            app_path,
            cli_installed: cli_path.is_some(),
            cli_path,
            cli_version,
            os_supported: true,
            architecture: arch,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_ego_lite_browser() -> Result<EgoLiteInstallResult, String> {
    tokio::task::spawn_blocking(|| {
        if !cfg!(target_os = "macos") {
            return Err("ego-lite browser only supports macOS (Apple Silicon / Intel)".to_string());
        }

        let mut logs = Vec::new();
        logs.push("[1/6] 🔍 Detecting system architecture...".to_string());
        let arch = std::env::consts::ARCH;
        let dmg_url = if arch == "aarch64" || arch == "arm64" {
            "https://cdn.ego.app/setup/macos/arm64/egolite-Y7MbxKIuhzFB.dmg"
        } else {
            "https://cdn.ego.app/setup/macos/x64/egolite-Y7MbxKIuhzFB.dmg"
        };
        logs.push(format!("Architecture: {} | Download source: {}", arch, dmg_url));

        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let temp_dir = std::env::temp_dir().join(format!("egolite-setup-{}", std::process::id()));
        let mount_dir = temp_dir.join("mount");
        let dmg_path = temp_dir.join("egolite.dmg");

        let _ = std::fs::create_dir_all(&mount_dir);

        // Step 2: Download DMG
        logs.push("[2/6] ⬇️ Downloading latest ego-lite DMG package (~127MB)...".to_string());
        let curl_res = Command::new("curl")
            .args([
                "-fL",
                "--retry", "3",
                "--connect-timeout", "20",
                "-o", dmg_path.to_str().unwrap(),
                dmg_url,
            ])
            .output();

        match curl_res {
            Ok(output) if output.status.success() => {
                logs.push("Download finished successfully.".to_string());
            }
            Ok(output) => {
                let err = String::from_utf8_lossy(&output.stderr);
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err(format!("Failed to download ego-lite DMG: {}", err));
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err(format!("Curl execution error: {}", e));
            }
        }

        // Step 3: Mount DMG
        logs.push("[3/6] 📦 Mounting installer disk image...".to_string());
        let attach_res = Command::new("hdiutil")
            .args([
                "attach",
                dmg_path.to_str().unwrap(),
                "-nobrowse",
                "-readonly",
                "-mountpoint",
                mount_dir.to_str().unwrap(),
            ])
            .output();

        if let Err(e) = attach_res {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(format!("Failed to mount DMG: {}", e));
        }

        // Step 4: Locate .app bundle inside DMG
        logs.push("[4/6] 🚀 Locating and copying ego lite.app...".to_string());
        let mut app_source: Option<std::path::PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(&mount_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && path.extension().and_then(|s| s.to_str()) == Some("app") {
                    app_source = Some(path);
                    break;
                }
            }
        }

        let app_source = match app_source {
            Some(p) => p,
            None => {
                let _ = Command::new("hdiutil").args(["detach", mount_dir.to_str().unwrap(), "-quiet"]).output();
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err("Could not find .app bundle in ego-lite DMG".to_string());
            }
        };

        let sys_target = std::path::PathBuf::from("/Applications/ego lite.app");
        let user_apps = std::path::PathBuf::from(&home).join("Applications");
        let _ = std::fs::create_dir_all(&user_apps);
        let user_target = user_apps.join("ego lite.app");

        // Try /Applications first; if permission denied, fallback to ~/Applications
        let mut target_app = sys_target.clone();
        let _ = std::fs::remove_dir_all(&sys_target);
        let ditto_sys = Command::new("ditto")
            .args([
                app_source.to_str().unwrap(),
                sys_target.to_str().unwrap(),
            ])
            .output();

        let copy_succeeded = match ditto_sys {
            Ok(out) if out.status.success() => true,
            _ => {
                logs.push("/Applications requires elevated permissions, installing to ~/Applications instead...".to_string());
                target_app = user_target.clone();
                let _ = std::fs::remove_dir_all(&user_target);
                let ditto_user = Command::new("ditto")
                    .args([
                        app_source.to_str().unwrap(),
                        user_target.to_str().unwrap(),
                    ])
                    .output();
                matches!(ditto_user, Ok(out) if out.status.success())
            }
        };

        // Step 5: Unmount DMG immediately
        logs.push("[5/6] 🧹 Detaching disk image and cleaning up installer cache...".to_string());
        let _ = Command::new("hdiutil")
            .args(["detach", mount_dir.to_str().unwrap(), "-quiet"])
            .output();
        let _ = std::fs::remove_dir_all(&temp_dir);

        if !copy_succeeded {
            return Err("Failed to copy ego lite.app to Applications directory".to_string());
        }

        logs.push(format!("Application installed at: {}", target_app.display()));

        // Step 6: Security and CLI symlink
        logs.push("[6/6] 🛡️ Stripping quarantine attribute and configuring CLI helpers...".to_string());
        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine", target_app.to_str().unwrap()])
            .output();

        // Attempt to link ego-browser helper if present
        let local_bin = std::path::PathBuf::from(&home).join(".local/bin");
        let _ = std::fs::create_dir_all(&local_bin);

        let candidate_clis = [
            target_app.join("Contents/Resources/ego-browser"),
            target_app.join("Contents/MacOS/ego-browser"),
            target_app.join("Contents/Resources/app.asar.unpacked/bin/ego-browser"),
        ];

        for candidate in candidate_clis {
            if candidate.exists() {
                let target_symlink = local_bin.join("ego-browser");
                let _ = std::fs::remove_file(&target_symlink);
                #[cfg(unix)]
                let _ = std::os::unix::fs::symlink(&candidate, &target_symlink);
                logs.push(format!("Linked CLI: {} -> {}", candidate.display(), target_symlink.display()));
                break;
            }
        }

        logs.push("✨ Launching ego lite for first-time profile & session onboarding...".to_string());
        let _ = Command::new("open").arg(&target_app).spawn();

        Ok(EgoLiteInstallResult {
            success: true,
            message: format!("ego lite successfully installed at {}", target_app.display()),
            app_path: Some(target_app.to_string_lossy().to_string()),
            logs,
        })
    })
    .await
    .map_err(|e| e.to_string())?
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
