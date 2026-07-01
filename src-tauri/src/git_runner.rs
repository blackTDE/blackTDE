use std::process::Command;

#[derive(serde::Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "??", etc.
    pub staged: bool,
}

#[tauri::command]
pub fn get_git_status(cwd: String) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let (x_y, path) = line.split_at(3);
        let status_code = x_y.trim().to_string();
        
        let first_char = x_y.chars().next().unwrap_or(' ');
        let staged = first_char != ' ' && first_char != '?';

        statuses.push(GitFileStatus {
            path: path.trim().to_string(),
            status: status_code,
            staged,
        });
    }

    Ok(statuses)
}

#[tauri::command]
pub fn get_git_diff(cwd: String, file_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", "HEAD", "--", &file_path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    
    // If output is empty (e.g. untracked file has no diff), return raw contents
    if stdout.trim().is_empty() {
        let raw = std::fs::read_to_string(std::path::Path::new(&cwd).join(&file_path))
            .unwrap_or_else(|_| "".into());
        // prefix with diff format dummy header
        return Ok(format!("--- /dev/null\n+++ b/{}\n@@ -0,0 +1,1 @@\n+{}", file_path, raw));
    }

    Ok(stdout)
}

#[tauri::command]
pub fn git_stage_file(cwd: String, file_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["add", &file_path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_unstage_file(cwd: String, file_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["restore", "--staged", &file_path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn git_commit_changes(cwd: String, message: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_git_branch(cwd: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok("no-git".to_string());
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        Ok("detached HEAD".into())
    } else {
        Ok(branch)
    }
}
