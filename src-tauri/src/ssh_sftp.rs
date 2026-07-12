use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RemoteFile {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
}

fn parse_ssh_host_args(host_str: &str) -> (String, Vec<String>) {
    let parts: Vec<&str> = host_str.split_whitespace().collect();
    let mut clean_host = String::new();
    let mut extra_args = Vec::new();
    
    let mut i = 0;
    while i < parts.len() {
        if parts[i] == "-p" && i + 1 < parts.len() {
            extra_args.push("-o".to_string());
            extra_args.push(format!("Port={}", parts[i + 1]));
            i += 2;
        } else {
            if clean_host.is_empty() {
                clean_host = parts[i].to_string();
            } else {
                extra_args.push(parts[i].to_string());
            }
            i += 1;
        }
    }
    if clean_host.is_empty() {
        clean_host = host_str.to_string();
    }
    (clean_host, extra_args)
}

#[tauri::command]
pub fn get_ssh_config_hosts() -> Result<Vec<String>, String> {
    let mut hosts = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default();
    if home.is_empty() {
        return Ok(hosts);
    }
    let config_path = Path::new(&home).join(".ssh").join("config");
    if !config_path.exists() {
        return Ok(hosts);
    }
    if let Ok(file) = File::open(config_path) {
        let reader = BufReader::new(file);
        for line in reader.lines() {
            if let Ok(line) = line {
                let trimmed = line.trim();
                if trimmed.to_lowercase().starts_with("host ") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() > 1 {
                        let host_val = parts[1];
                        if !host_val.contains('*') && !host_val.contains('?') {
                            hosts.push(host_val.to_string());
                        }
                    }
                }
            }
        }
    }
    // De-duplicate
    hosts.sort();
    hosts.dedup();
    Ok(hosts)
}

#[tauri::command]
pub fn sftp_list_dir(host: String, path: String) -> Result<Vec<RemoteFile>, String> {
    // Clean path (handling default/empty as remote home "~")
    let target_path = if path.trim().is_empty() {
        ".".to_string()
    } else {
        path
    };

    // Try Python 3 first for robust JSON output
    let python_cmd = format!(
        "python3 -c \"import os, json, stat; \
        res = []; \
        path = '{}'; \
        real_path = os.path.expanduser(path); \
        entries = os.scandir(real_path); \
        for e in entries: \
            try: \
                s = e.stat(); \
                res.append({{'name': e.name, 'is_dir': stat.S_ISDIR(s.st_mode), 'size': s.st_size, 'mtime': int(s.st_mtime)}}); \
            except: pass; \
        print(json.dumps(res))\" 2>/dev/null",
        target_path.replace("'", "\\'")
    );

    let (clean_host, extra_args) = parse_ssh_host_args(&host);

    let mut cmd = Command::new("ssh");
    cmd.arg("-o").arg("BatchMode=yes")
       .arg("-o").arg("StrictHostKeyChecking=accept-new")
       .arg("-o").arg("ConnectTimeout=5");
    for arg in &extra_args {
        cmd.arg(arg);
    }
    cmd.arg(&clean_host).arg(&python_cmd);
    let output = cmd.output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout_str = String::from_utf8_lossy(&out.stdout);
            if let Ok(parsed) = serde_json::from_str::<Vec<RemoteFile>>(&stdout_str) {
                let mut files = parsed;
                // Sort dirs first, then alphabetical
                files.sort_by(|a, b| {
                    if a.is_dir && !b.is_dir {
                        std::cmp::Ordering::Less
                    } else if !a.is_dir && b.is_dir {
                        std::cmp::Ordering::Greater
                    } else {
                        a.name.to_lowercase().cmp(&b.name.to_lowercase())
                    }
                });
                return Ok(files);
            }
        }
    }

    // Fallback: parse `ls -ap`
    let fallback_cmd = format!("ls -ap '{}'", target_path.replace("'", "\\'"));
    let mut cmd = Command::new("ssh");
    cmd.arg("-o").arg("BatchMode=yes")
       .arg("-o").arg("StrictHostKeyChecking=accept-new")
       .arg("-o").arg("ConnectTimeout=5");
    for arg in &extra_args {
        cmd.arg(arg);
    }
    cmd.arg(&clean_host).arg(&fallback_cmd);
    let output = cmd.output();

    match output {
        Ok(out) => {
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                return Err(format!("SSH list directory failed: {}", stderr));
            }
            let stdout_str = String::from_utf8_lossy(&out.stdout);
            let mut files = Vec::new();
            for line in stdout_str.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
                    continue;
                }
                let is_dir = trimmed.ends_with('/');
                let name = if is_dir {
                    trimmed.trim_end_matches('/').to_string()
                } else {
                    trimmed.to_string()
                };
                files.push(RemoteFile {
                    name,
                    is_dir,
                    size: 0,
                    mtime: 0,
                });
            }
            // Sort dirs first, then alphabetical
            files.sort_by(|a, b| {
                if a.is_dir && !b.is_dir {
                    std::cmp::Ordering::Less
                } else if !a.is_dir && b.is_dir {
                    std::cmp::Ordering::Greater
                } else {
                    a.name.to_lowercase().cmp(&b.name.to_lowercase())
                }
            });
            Ok(files)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn sftp_download_file(host: String, remote_path: String, local_path: String) -> Result<(), String> {
    let (clean_host, extra_args) = parse_ssh_host_args(&host);

    let mut cmd = Command::new("scp");
    cmd.arg("-o").arg("BatchMode=yes")
       .arg("-o").arg("StrictHostKeyChecking=accept-new");
    for arg in &extra_args {
        cmd.arg(arg);
    }
    cmd.arg(format!("{}:{}", clean_host, remote_path))
       .arg(local_path);
    let output = cmd.output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(format!("Download failed: {}", stderr))
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn sftp_upload_file(host: String, local_path: String, remote_path: String) -> Result<(), String> {
    let (clean_host, extra_args) = parse_ssh_host_args(&host);

    let mut cmd = Command::new("scp");
    cmd.arg("-o").arg("BatchMode=yes")
       .arg("-o").arg("StrictHostKeyChecking=accept-new");
    for arg in &extra_args {
        cmd.arg(arg);
    }
    cmd.arg(local_path)
       .arg(format!("{}:{}", clean_host, remote_path));
    let output = cmd.output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err(format!("Upload failed: {}", stderr))
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn select_local_file_to_upload() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn select_local_download_destination(file_name: String) -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_file_name(&file_name)
        .save_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}
