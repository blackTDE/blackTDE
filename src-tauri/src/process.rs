use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tokio::sync::oneshot;

pub struct ActiveProcess {
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    pub kill_tx: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct ProcessManager {
    pub active_sessions: Arc<Mutex<HashMap<String, ActiveProcess>>>,
}

pub fn spawn_pty_process(
    command: &str,
    args: Vec<String>,
    cwd: &str,
    rows: u16,
    cols: u16,
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

    // 4. Spawn command
    let child = pair.slave.spawn_command(cmd)?;
    let writer = pair.master.take_writer()?;

    Ok(ActiveProcess {
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(child)),
        kill_tx: None,
    })
}
