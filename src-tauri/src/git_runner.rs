use std::process::Command;

#[derive(serde::Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "??", etc.
    pub staged: bool,
}

#[derive(serde::Serialize)]
pub struct GitUser {
    pub name: String,
    pub email: String,
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

#[tauri::command]
pub fn get_git_user(cwd: String) -> GitUser {
    let config = |key: &str| {
        Command::new("git")
            .args(["config", "--get", key])
            .current_dir(&cwd)
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default()
    };
    GitUser {
        name: config("user.name"),
        email: config("user.email"),
    }
}

#[derive(serde::Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[tauri::command]
pub fn get_git_commit_log(cwd: String) -> Result<Vec<GitCommit>, String> {
    let output = Command::new("git")
        .args(["log", "--pretty=format:%H|%an|%cr|%s", "-n", "50"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3..].join("|"),
            });
        }
    }

    Ok(commits)
}

#[tauri::command]
pub fn get_git_commit_files(cwd: String, hash: String) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .args(["diff-tree", "--root", "--no-commit-id", "--name-status", "--no-renames", "-r", "-z", &hash])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(parse_name_status(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_name_status(stdout: &str) -> Vec<GitFileStatus> {
    let mut files = Vec::new();
    let mut fields = stdout.split('\0').filter(|field| !field.is_empty());
    while let (Some(status), Some(path)) = (fields.next(), fields.next()) {
            files.push(GitFileStatus {
                path: path.to_string(),
                status: status.to_string(),
                staged: false,
            });
    }
    files
}

#[tauri::command]
pub fn get_git_file_content_at_rev(cwd: String, rev: String, file_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", rev, file_path)])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok("".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn get_git_worktree_file_content(cwd: String, file_path: String) -> String {
    std::fs::read_to_string(std::path::Path::new(&cwd).join(file_path)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::parse_name_status;

    #[test]
    fn parses_root_commit_files_and_paths_with_spaces() {
        let files = parse_name_status("A\0README.md\0M\0docs/user guide.md\0");
        assert_eq!(files.len(), 2);
        assert_eq!(files[1].path, "docs/user guide.md");
    }
}
