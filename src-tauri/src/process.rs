use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tokio::sync::oneshot;
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
    pub resuming_sessions: Arc<Mutex<HashSet<String>>>,
}

pub fn remove_active_session(
    active_sessions: &Arc<Mutex<HashMap<String, ActiveProcess>>>,
    session_id: &str,
    instance_id: Uuid,
) {
    if let Ok(mut sessions) = active_sessions.lock() {
        if sessions.get(session_id).map(|process| process.instance_id) == Some(instance_id) {
            sessions.remove(session_id);
        }
    }
}

pub struct ResumeReservation {
    reservations: Arc<Mutex<HashSet<String>>>,
    session_id: String,
}

impl Drop for ResumeReservation {
    fn drop(&mut self) {
        if let Ok(mut reservations) = self.reservations.lock() {
            reservations.remove(&self.session_id);
        }
    }
}

pub fn reserve_resume(
    reservations: &Arc<Mutex<HashSet<String>>>,
    session_id: &str,
) -> Option<ResumeReservation> {
    let mut locked = reservations.lock().ok()?;
    if !locked.insert(session_id.to_string()) {
        return None;
    }
    drop(locked);

    Some(ResumeReservation {
        reservations: reservations.clone(),
        session_id: session_id.to_string(),
    })
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

    // 3. Build command
    let mut cmd = CommandBuilder::new(command);
    cmd.args(args);
    cmd.cwd(std::path::Path::new(cwd));

    // Inherit parent environment variables (important for PATH, HOME, etc.)
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }

    // Set standard terminal variables for maximum shell capability
    cmd.env("TERM".to_string(), "xterm-256color".to_string());
    cmd.env("TERM_PROGRAM".to_string(), "Apple_Terminal".to_string());

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
    use std::collections::HashSet;
    use std::io::Read;

    #[test]
    fn test_spawn_pty_process() {
        let proc = spawn_pty_process("echo", vec!["hello-pty".to_string()], ".", 24, 80, Vec::new()).unwrap();
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
        let proc = spawn_pty_process("echo", vec!["done".to_string()], ".", 24, 80, Vec::new()).unwrap();
        let instance_id = proc.instance_id;
        sessions.lock().unwrap().insert("finished".to_string(), proc);

        remove_active_session(&sessions, "finished", uuid::Uuid::new_v4());
        assert!(sessions.lock().unwrap().contains_key("finished"));

        remove_active_session(&sessions, "finished", instance_id);

        assert!(!sessions.lock().unwrap().contains_key("finished"));
    }

    #[test]
    fn test_resume_reservation_is_exclusive_and_released_on_drop() {
        let reservations = Arc::new(Mutex::new(HashSet::new()));

        let first = reserve_resume(&reservations, "session").expect("first reservation");
        assert!(reserve_resume(&reservations, "session").is_none());

        drop(first);
        assert!(reserve_resume(&reservations, "session").is_some());
    }
}
