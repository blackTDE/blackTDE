use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::{oneshot, Mutex as AsyncMutex, OwnedMutexGuard};
use uuid::Uuid;

pub struct ActiveProcess {
    pub instance_id: Uuid,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    pub kill_tx: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct ProcessManager {
    pub active_sessions: Arc<Mutex<HashMap<String, ActiveProcess>>>,
    pub resume_locks: ResumeLocks,
}

pub type ResumeLocks = Arc<AsyncMutex<HashMap<String, Arc<AsyncMutex<()>>>>>;

pub fn remove_active_session(
    active_sessions: &Arc<Mutex<HashMap<String, ActiveProcess>>>,
    session_id: &str,
    instance_id: Uuid,
) -> bool {
    if let Ok(mut sessions) = active_sessions.lock() {
        if sessions.get(session_id).map(|process| process.instance_id) == Some(instance_id) {
            sessions.remove(session_id);
            return true;
        }
    }
    false
}

pub async fn lock_session_resume(locks: &ResumeLocks, session_id: &str) -> OwnedMutexGuard<()> {
    let session_lock = {
        let mut locks = locks.lock().await;
        locks
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    };

    session_lock.lock_owned().await
}

pub fn build_enriched_path() -> String {
    let current_paths: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let home = std::env::var("HOME").unwrap_or_default();
    let mut priority_dirs = vec![
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
    ];

    if !home.is_empty() {
        priority_dirs.push(format!("{}/.cargo/bin", home));
        priority_dirs.push(format!("{}/.gemini/bin", home));
        priority_dirs.push(format!("{}/.local/bin", home));
        priority_dirs.push(format!("{}/.npm-global/bin", home));
        priority_dirs.push(format!("{}/.bun/bin", home));

        let nvm_dir = std::path::Path::new(&home).join(".nvm").join("versions").join("node");
        if let Ok(entries) = std::fs::read_dir(nvm_dir) {
            for entry in entries.flatten() {
                let bin_dir = entry.path().join("bin");
                if bin_dir.exists() {
                    if let Some(path_str) = bin_dir.to_str() {
                        priority_dirs.push(path_str.to_string());
                    }
                }
            }
        }
    }

    let mut result_paths = Vec::new();
    for dir in priority_dirs {
        if !result_paths.contains(&dir) && std::path::Path::new(&dir).exists() {
            result_paths.push(dir);
        }
    }
    for dir in current_paths {
        if !result_paths.contains(&dir) {
            result_paths.push(dir);
        }
    }

    result_paths.join(":")
}

pub fn resolve_command_executable(command: &str) -> String {
    let path_obj = std::path::Path::new(command);
    if path_obj.is_absolute() && path_obj.exists() {
        return command.to_string();
    }

    let enriched = build_enriched_path();
    for p in enriched.split(':') {
        let candidate = std::path::Path::new(p).join(command);
        if candidate.exists() && candidate.is_file() {
            return candidate.to_string_lossy().to_string();
        }
    }

    command.to_string()
}

pub fn spawn_pty_process(
    command: &str,
    args: Vec<String>,
    cwd: &str,
    rows: u16,
    cols: u16,
    envs: Vec<(String, String)>,
) -> Result<ActiveProcess, Box<dyn std::error::Error>> {
    // 1. Get PTY system
    let pty_system = native_pty_system();

    // 2. Open PTY pair
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    // 3. Resolve executable path
    let exec_path = resolve_command_executable(command);
    let mut cmd = CommandBuilder::new(&exec_path);
    cmd.args(args);
    cmd.cwd(std::path::Path::new(cwd));

    // Inherit parent environment variables (important for PATH, HOME, etc.)
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }

    // Set enriched PATH environment variable
    cmd.env("PATH".to_string(), build_enriched_path());

    // Set standard terminal variables and UTF-8 locale for powerline prompt rendering
    cmd.env("TERM".to_string(), "xterm-256color".to_string());
    cmd.env("TERM_PROGRAM".to_string(), "Apple_Terminal".to_string());
    cmd.env("COLORTERM".to_string(), "truecolor".to_string());
    if std::env::var("LANG").is_err() {
        cmd.env("LANG".to_string(), "en_US.UTF-8".to_string());
    }
    if std::env::var("LC_ALL").is_err() {
        cmd.env("LC_ALL".to_string(), "en_US.UTF-8".to_string());
    }

    // Inject/override session specific envs
    for (k, v) in envs {
        cmd.env(k, v);
    }

    // 4. Spawn command
    let child = pair.slave.spawn_command(cmd)?;
    let writer = pair.master.take_writer()?;

    Ok(ActiveProcess {
        instance_id: Uuid::new_v4(),
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(child)),
        kill_tx: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn test_spawn_pty_process() {
        let proc = spawn_pty_process(
            "echo",
            vec!["hello-pty".to_string()],
            ".",
            24,
            80,
            Vec::new(),
        )
        .unwrap();
        let mut reader = proc.master.lock().unwrap().try_clone_reader().unwrap();
        let mut buf = [0u8; 1024];
        let mut total_output = String::new();

        // Read until EOF
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            total_output.push_str(&String::from_utf8_lossy(&buf[..n]));
        }

        assert!(
            total_output.contains("hello-pty"),
            "Output '{}' does not contain 'hello-pty'",
            total_output
        );
    }

    #[test]
    fn test_remove_active_session() {
        let sessions = Arc::new(Mutex::new(HashMap::new()));
        let proc =
            spawn_pty_process("echo", vec!["done".to_string()], ".", 24, 80, Vec::new()).unwrap();
        let instance_id = proc.instance_id;
        sessions
            .lock()
            .unwrap()
            .insert("finished".to_string(), proc);

        assert!(!remove_active_session(
            &sessions,
            "finished",
            uuid::Uuid::new_v4()
        ));
        assert!(sessions.lock().unwrap().contains_key("finished"));

        assert!(remove_active_session(&sessions, "finished", instance_id));

        assert!(!sessions.lock().unwrap().contains_key("finished"));
    }

    #[tokio::test]
    async fn test_concurrent_resume_waits_for_the_session_lock() {
        let locks = Arc::new(tokio::sync::Mutex::new(HashMap::new()));
        let first = lock_session_resume(&locks, "session").await;
        let waiting_locks = locks.clone();
        let waiter = tokio::spawn(async move {
            let _second = lock_session_resume(&waiting_locks, "session").await;
        });

        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());

        drop(first);
        waiter.await.unwrap();
    }
}
