use std::process::Command;

fn git_command(cwd: &str) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd)
        .args(["-c", "core.quotepath=false", "-c", "i18n.logoutputencoding=utf-8"]);
    cmd
}

fn decode_git_bytes(bytes: &[u8]) -> String {
    crate::file_manager::decode_text_buffer(bytes).0
}

fn unescape_git_path(path: &str) -> String {
    let trimmed = path.trim();
    if !(trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2) {
        return trimmed.to_string();
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    let mut raw = Vec::new();
    let bytes = inner.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            match bytes[i + 1] {
                b'n' => {
                    raw.push(b'\n');
                    i += 2;
                }
                b't' => {
                    raw.push(b'\t');
                    i += 2;
                }
                b'r' => {
                    raw.push(b'\r');
                    i += 2;
                }
                b'"' => {
                    raw.push(b'"');
                    i += 2;
                }
                b'\\' => {
                    raw.push(b'\\');
                    i += 2;
                }
                b'0'..=b'7' if i + 3 < bytes.len()
                    && bytes[i + 2].is_ascii_digit()
                    && bytes[i + 3].is_ascii_digit() =>
                {
                    let oct = std::str::from_utf8(&bytes[i + 1..i + 4])
                        .ok()
                        .and_then(|value| u8::from_str_radix(value, 8).ok());
                    if let Some(byte) = oct {
                        raw.push(byte);
                        i += 4;
                    } else {
                        raw.push(bytes[i]);
                        i += 1;
                    }
                }
                _ => {
                    raw.push(bytes[i]);
                    i += 1;
                }
            }
        } else {
            raw.push(bytes[i]);
            i += 1;
        }
    }
    decode_git_bytes(&raw)
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command(cwd)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr).trim().to_string());
    }
    let stdout = decode_git_bytes(&output.stdout).trim().to_string();
    let stderr = decode_git_bytes(&output.stderr).trim().to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

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

#[derive(Default, serde::Serialize)]
pub struct GitRemoteStatus {
    pub remote_name: String,
    pub remote_url: String,
    pub upstream: String,
    pub ahead: u32,
    pub behind: u32,
}

fn parse_remote_status(stdout: &str) -> GitRemoteStatus {
    let mut status = GitRemoteStatus::default();
    for line in stdout.lines() {
        if let Some(upstream) = line.strip_prefix("# branch.upstream ") {
            status.upstream = upstream.to_string();
            status.remote_name = upstream.split('/').next().unwrap_or_default().to_string();
        } else if let Some(counts) = line.strip_prefix("# branch.ab ") {
            let mut counts = counts.split_whitespace();
            status.ahead = counts
                .next()
                .and_then(|value| value.strip_prefix('+'))
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            status.behind = counts
                .next()
                .and_then(|value| value.strip_prefix('-'))
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
    }
    status
}

#[tauri::command(async)]
pub fn get_git_status(cwd: String) -> Result<Vec<GitFileStatus>, String> {
    let output = git_command(&cwd)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }

    Ok(parse_git_status(&decode_git_bytes(&output.stdout)))
}

fn parse_git_status(stdout: &str) -> Vec<GitFileStatus> {
    let mut statuses = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let status_chars: Vec<char> = line.chars().take(2).collect();
        let staged_status = status_chars[0];
        let unstaged_status = status_chars[1];
        let path = unescape_git_path(line[3..].trim());

        if staged_status != ' ' && staged_status != '?' {
            statuses.push(GitFileStatus {
                path: path.clone(),
                status: staged_status.to_string(),
                staged: true,
            });
        }
        if unstaged_status != ' ' || staged_status == '?' {
            statuses.push(GitFileStatus {
                path,
                status: if staged_status == '?' {
                    "??".into()
                } else {
                    unstaged_status.to_string()
                },
                staged: false,
            });
        }
    }

    statuses
}

#[tauri::command(async)]
pub fn get_git_diff(cwd: String, file_path: String) -> Result<String, String> {
    let output = git_command(&cwd)
        .args(["diff", "HEAD", "--", &file_path])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = decode_git_bytes(&output.stdout);

    // If output is empty (e.g. untracked file has no diff), return raw contents
    if stdout.trim().is_empty() {
        let raw_path = std::path::Path::new(&cwd).join(&file_path);
        let raw = std::fs::read(&raw_path)
            .map(|bytes| decode_git_bytes(&bytes))
            .unwrap_or_default();
        // prefix with diff format dummy header
        return Ok(format!(
            "--- /dev/null\n+++ b/{}\n@@ -0,0 +1,1 @@\n+{}",
            file_path, raw
        ));
    }

    Ok(stdout)
}

#[tauri::command(async)]
pub fn git_stage_file(cwd: String, file_path: String) -> Result<(), String> {
    let output = git_command(&cwd)
        .args(["add", &file_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_unstage_file(cwd: String, file_path: String) -> Result<(), String> {
    let output = git_command(&cwd)
        .args(["restore", "--staged", &file_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_restore_file(cwd: String, file_path: String) -> Result<(), String> {
    let tracked = git_command(&cwd)
        .args(["ls-files", "--error-unmatch", "--", &file_path])
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success();

    if tracked {
        run_git(&cwd, &["restore", "--", &file_path])?;
    } else {
        run_git(&cwd, &["clean", "-f", "--", &file_path])?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_commit_changes(cwd: String, message: String) -> Result<(), String> {
    let output = git_command(&cwd)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn get_git_branch(cwd: String) -> Result<String, String> {
    let output = git_command(&cwd)
        .args(["branch", "--show-current"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok("no-git".to_string());
    }

    let branch = decode_git_bytes(&output.stdout).trim().to_string();
    if branch.is_empty() {
        Ok("detached HEAD".into())
    } else {
        Ok(branch)
    }
}

#[tauri::command(async)]
pub fn get_git_branches(cwd: String) -> Result<Vec<String>, String> {
    let output = git_command(&cwd)
        .args(["branch", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = decode_git_bytes(&output.stdout);
    let branches: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(branches)
}

#[tauri::command(async)]
pub fn git_checkout_branch(cwd: String, branch: String) -> Result<String, String> {
    run_git(&cwd, &["checkout", &branch])
}

#[tauri::command(async)]
pub fn get_git_user(cwd: String) -> GitUser {
    let config = |key: &str| {
        git_command(&cwd)
            .args(["config", "--get", key])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| decode_git_bytes(&output.stdout).trim().to_string())
            .unwrap_or_default()
    };
    GitUser {
        name: config("user.name"),
        email: config("user.email"),
    }
}

#[tauri::command(async)]
pub fn get_git_remote_status(cwd: String) -> Result<GitRemoteStatus, String> {
    let mut status =
        parse_remote_status(&run_git(&cwd, &["status", "--porcelain=v2", "--branch"])?);
    if status.remote_name.is_empty() {
        status.remote_name = run_git(&cwd, &["remote"])?
            .lines()
            .next()
            .unwrap_or_default()
            .to_string();
    }
    if !status.remote_name.is_empty() {
        status.remote_url = run_git(&cwd, &["remote", "get-url", &status.remote_name])?;
    }
    Ok(status)
}

#[tauri::command(async)]
pub fn git_fetch_remote(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["fetch", "--prune"])
}

#[tauri::command(async)]
pub fn git_pull_remote(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["pull", "--ff-only"])
}

#[tauri::command(async)]
pub fn git_push_remote(cwd: String) -> Result<String, String> {
    if run_git(&cwd, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok() {
        return run_git(&cwd, &["push"]);
    }
    let remote = run_git(&cwd, &["remote"])?
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    let branch = run_git(&cwd, &["branch", "--show-current"])?;
    if remote.is_empty() || branch.is_empty() {
        return Err("No remote or current branch is configured".into());
    }
    run_git(&cwd, &["push", "--set-upstream", &remote, &branch])
}

#[tauri::command(async)]
pub fn git_stage_all(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["add", "--all"])
}

#[tauri::command(async)]
pub fn git_unstage_all(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["reset"])
}

#[derive(serde::Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[tauri::command(async)]
pub fn get_git_commit_log(cwd: String) -> Result<Vec<GitCommit>, String> {
    let output = git_command(&cwd)
        .args(["log", "--pretty=format:%H%x1f%an%x1f%cr%x1f%s", "-n", "50"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }

    let stdout = decode_git_bytes(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3..].join("\u{1f}"),
            });
        }
    }

    Ok(commits)
}

#[tauri::command(async)]
pub fn get_git_commit_files(cwd: String, hash: String) -> Result<Vec<GitFileStatus>, String> {
    let output = git_command(&cwd)
        .args([
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-status",
            "--no-renames",
            "-r",
            "-z",
            &hash,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(decode_git_bytes(&output.stderr));
    }

    Ok(parse_name_status(&decode_git_bytes(&output.stdout)))
}

fn parse_name_status(stdout: &str) -> Vec<GitFileStatus> {
    let mut files = Vec::new();
    let mut fields = stdout.split('\0').filter(|field| !field.is_empty());
    while let (Some(status), Some(path)) = (fields.next(), fields.next()) {
        files.push(GitFileStatus {
            path: unescape_git_path(path),
            status: status.to_string(),
            staged: false,
        });
    }
    files
}

#[tauri::command(async)]
pub fn get_git_file_content_at_rev(
    cwd: String,
    rev: String,
    file_path: String,
) -> Result<String, String> {
    let output = git_command(&cwd)
        .args(["show", &format!("{}:{}", rev, file_path)])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok("".to_string());
    }

    Ok(decode_git_bytes(&output.stdout))
}

#[tauri::command(async)]
pub fn get_git_worktree_file_content(cwd: String, file_path: String) -> String {
    std::fs::read_to_string(std::path::Path::new(&cwd).join(file_path)).unwrap_or_default()
}

#[tauri::command(async)]
pub fn git_init(cwd: String) -> Result<String, String> {
    let path = std::path::Path::new(&cwd);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    if path.join(".git").exists() {
        return Ok("Already a git repository".to_string());
    }
    run_git(&cwd, &["init"])
}

#[tauri::command(async)]
pub fn git_clone(url: String, target_dir: String) -> Result<String, String> {
    let clean_url = url.trim();
    if clean_url.is_empty() {
        return Err("Repository URL cannot be empty.".to_string());
    }

    let target_path = std::path::Path::new(&target_dir);
    if target_path.exists() {
        if let Ok(mut read_dir) = std::fs::read_dir(target_path) {
            if read_dir.next().is_some() {
                return Err(format!(
                    "Target directory '{}' already exists and is not empty.",
                    target_dir
                ));
            }
        }
    } else if let Some(parent) = target_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    let output = Command::new("git")
        .args(["clone", clean_url, &target_dir])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let err_msg = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if err_msg.is_empty() {
            "git clone failed with unknown error.".to_string()
        } else {
            err_msg
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(if !stdout.is_empty() { stdout } else { stderr })
}

#[cfg(test)]
mod tests {
    use super::{
        git_clone, git_init, git_restore_file, parse_git_status, parse_name_status,
        parse_remote_status,
    };
    use std::{fs, process::Command};

    #[test]
    fn parses_root_commit_files_and_paths_with_spaces() {
        let files = parse_name_status("A\0README.md\0M\0docs/user guide.md\0");
        assert_eq!(files.len(), 2);
        assert_eq!(files[1].path, "docs/user guide.md");
    }

    #[test]
    fn unescapes_quoted_git_cjk_paths() {
        let files = parse_git_status("?? \"\\346\\226\\207.txt\"\n");
        assert_eq!(files[0].path, "文.txt");
    }

    #[test]
    fn parses_upstream_ahead_and_behind_status() {
        let status = parse_remote_status(
            "# branch.head main\n# branch.upstream origin/main\n# branch.ab +7 -2\n",
        );
        assert_eq!(status.remote_name, "origin");
        assert_eq!(status.upstream, "origin/main");
        assert_eq!(status.ahead, 7);
        assert_eq!(status.behind, 2);
    }

    #[test]
    fn lists_index_and_worktree_changes_separately() {
        let files = parse_git_status("MM both.rs\nM  staged.rs\n M unstaged.rs\n?? new.rs\n");
        assert_eq!(files.len(), 5);
        assert_eq!(
            files.iter().filter(|file| file.path == "both.rs").count(),
            2
        );
        assert!(files
            .iter()
            .any(|file| file.path == "both.rs" && file.staged));
        assert!(files
            .iter()
            .any(|file| file.path == "both.rs" && !file.staged));
    }

    #[test]
    fn restores_tracked_files_and_removes_untracked_files() {
        let repo = std::env::temp_dir().join(format!("tde-git-restore-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&repo).unwrap();
        Command::new("git")
            .arg("init")
            .current_dir(&repo)
            .output()
            .unwrap();
        fs::write(repo.join("tracked.txt"), "original").unwrap();
        Command::new("git")
            .args(["add", "tracked.txt"])
            .current_dir(&repo)
            .output()
            .unwrap();
        Command::new("git")
            .args([
                "-c",
                "user.name=TDE",
                "-c",
                "user.email=tde@example.com",
                "commit",
                "-m",
                "initial",
            ])
            .current_dir(&repo)
            .output()
            .unwrap();
        fs::write(repo.join("tracked.txt"), "changed").unwrap();
        fs::write(repo.join("untracked.txt"), "temporary").unwrap();

        git_restore_file(repo.to_string_lossy().into_owned(), "tracked.txt".into()).unwrap();
        git_restore_file(repo.to_string_lossy().into_owned(), "untracked.txt".into()).unwrap();

        assert_eq!(
            fs::read_to_string(repo.join("tracked.txt")).unwrap(),
            "original"
        );
        assert!(!repo.join("untracked.txt").exists());
        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn initializes_git_repository_if_not_present() {
        let dir = std::env::temp_dir().join(format!("tde-init-test-{}", uuid::Uuid::new_v4()));
        assert!(!dir.join(".git").exists());

        let res = git_init(dir.to_string_lossy().into_owned());
        assert!(res.is_ok());
        assert!(dir.join(".git").exists());

        // Calling it again on an existing git repo returns Ok without error
        let second = git_init(dir.to_string_lossy().into_owned());
        assert!(second.is_ok());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn clones_git_repository_to_custom_directory_name() {
        let temp_dir = std::env::temp_dir().join(format!("tde-test-origin-{}", uuid::Uuid::new_v4()));
        let clone_dir = std::env::temp_dir().join(format!("tde-test-clone-renamed-{}", uuid::Uuid::new_v4()));

        let _ = fs::create_dir_all(&temp_dir);
        let _ = git_init(temp_dir.to_string_lossy().into_owned());
        let _ = fs::write(temp_dir.join("README.md"), "# Test Cloned Repo");
        let _ = Command::new("git")
            .args(["add", "README.md"])
            .current_dir(&temp_dir)
            .output();
        let _ = Command::new("git")
            .args(["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "initial"])
            .current_dir(&temp_dir)
            .output();

        let clone_res = git_clone(
            temp_dir.to_string_lossy().into_owned(),
            clone_dir.to_string_lossy().into_owned(),
        );
        assert!(clone_res.is_ok(), "git_clone failed: {:?}", clone_res);
        assert!(clone_dir.join("README.md").exists());
        assert!(clone_dir.join(".git").exists());

        let _ = fs::remove_dir_all(temp_dir);
        let _ = fs::remove_dir_all(clone_dir);
    }
}
