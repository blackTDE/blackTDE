use std::path::{Path, PathBuf};
use std::process::Command;

const TMUX_SOCKET: &str = "black-tde";

pub struct PersistentShell {
    pub command: String,
    pub args: Vec<String>,
    pub reattached: bool,
}

pub fn is_local_shell(command: &str, ssh_host: Option<&str>) -> bool {
    ssh_host.filter(|host| !host.trim().is_empty()).is_none()
        && matches!(
            command.rsplit(['/', '\\']).next().unwrap_or(command),
            "zsh" | "bash" | "sh"
        )
}

pub fn tmux_session_name(id: &str) -> String {
    let safe_id: String = id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    format!("tde-{safe_id}")
}

pub fn login_shell_args(command: &str, args: &[String]) -> Vec<String> {
    let mut args = args.to_vec();
    if is_local_shell(command, None) && !args.iter().any(|arg| arg == "-l" || arg == "--login") {
        args.insert(0, "-l".into());
    }
    args
}

pub fn tmux_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut result = vec!["-L".into(), TMUX_SOCKET.into()];
    result.extend(args.into_iter().map(|arg| arg.as_ref().to_string()));
    result
}

pub fn create_args(name: &str, cwd: &str, shell: &str, shell_args: &[String]) -> Vec<String> {
    let mut args = vec![
        "new-session".into(),
        "-d".into(),
        "-s".into(),
        name.into(),
        "-c".into(),
        cwd.into(),
        shell.into(),
    ];
    args.extend(shell_args.iter().cloned());
    args
}

pub fn attach_args(name: &str) -> Vec<String> {
    tmux_args(["attach-session", "-t", name])
}

pub fn split_args(name: &str, direction: &str) -> Result<Vec<String>, String> {
    let flag = match direction {
        "right" => "-h",
        "down" => "-v",
        _ => return Err("Split direction must be 'right' or 'down'".into()),
    };
    Ok(tmux_args([
        "split-window",
        flag,
        "-t",
        name,
        "-c",
        "#{pane_current_path}",
    ]))
}

pub fn find_tmux() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path) {
            let candidate = directory.join("tmux");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    ["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"]
        .into_iter()
        .map(PathBuf::from)
        .find(|candidate| candidate.is_file())
}

pub fn prepare_shell(
    id: &str,
    command: &str,
    args: &[String],
    cwd: &str,
) -> Option<PersistentShell> {
    let tmux = find_tmux()?;
    prepare_shell_with(&tmux, id, command, &login_shell_args(command, args), cwd)
}

fn has_session(tmux: &Path, name: &str, dedicated: bool, path: &str) -> bool {
    let mut command = Command::new(tmux);
    if dedicated {
        command.args(tmux_args(["has-session", "-t", name]));
    } else {
        command.args(["has-session", "-t", name]);
    }
    command
        .env("PATH", path)
        .status()
        .is_ok_and(|status| status.success())
}

fn refresh_path(tmux: &Path, path: &str, session: Option<&str>) {
    let target = session.unwrap_or("-g");
    let mut args = vec!["set-environment", target, "PATH", path];
    if session.is_some() {
        args.insert(1, "-t");
    }
    let _ = Command::new(tmux)
        .args(tmux_args(args))
        .env("PATH", path)
        .status();
}

fn configure_server(tmux: &Path, path: &str) {
    refresh_path(tmux, path, None);
    for (option, value) in [("mouse", "on"), ("history-limit", "50000")] {
        let _ = Command::new(tmux)
            .args(tmux_args(["set-option", "-g", option, value]))
            .env("PATH", path)
            .status();
    }
}

fn prepare_shell_with(
    tmux: &Path,
    id: &str,
    command: &str,
    args: &[String],
    cwd: &str,
) -> Option<PersistentShell> {
    let name = tmux_session_name(id);
    let path = crate::process::build_enriched_path();

    if has_session(tmux, &name, true, &path) {
        configure_server(tmux, &path);
        refresh_path(tmux, &path, Some(&name));
        return Some(PersistentShell {
            command: tmux.to_string_lossy().into_owned(),
            args: attach_args(&name),
            reattached: true,
        });
    }

    // Reattach shells created before TDE moved to its isolated tmux server.
    if has_session(tmux, &name, false, &path) {
        return Some(PersistentShell {
            command: tmux.to_string_lossy().into_owned(),
            args: vec!["attach-session".into(), "-t".into(), name],
            reattached: true,
        });
    }

    let mut create_command = tmux_args([
        "set-option",
        "-g",
        "mouse",
        "on",
        ";",
        "set-option",
        "-g",
        "history-limit",
        "50000",
        ";",
    ]);
    create_command.extend(create_args(&name, cwd, command, args));
    if !Command::new(tmux)
        .args(create_command)
        .env("PATH", &path)
        .status()
        .ok()?
        .success()
    {
        return None;
    }
    configure_server(tmux, &path);

    Some(PersistentShell {
        command: tmux.to_string_lossy().into_owned(),
        args: attach_args(&name),
        reattached: false,
    })
}

pub fn split_shell_session(id: &str, direction: &str) -> Result<(), String> {
    let tmux = find_tmux().ok_or("tmux is not installed")?;
    let name = tmux_session_name(id);
    let path = crate::process::build_enriched_path();
    let args = if has_session(&tmux, &name, true, &path) {
        refresh_path(&tmux, &path, Some(&name));
        split_args(&name, direction)?
    } else if has_session(&tmux, &name, false, &path) {
        let mut args = split_args(&name, direction)?;
        args.drain(0..2);
        args
    } else {
        return Err("Shell session is not running".into());
    };

    let status = Command::new(tmux)
        .args(args)
        .env("PATH", path)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("tmux failed to split the shell session".into())
    }
}

pub fn kill_shell_session(id: &str) {
    let Some(tmux) = find_tmux() else {
        return;
    };
    let name = tmux_session_name(id);
    let _ = Command::new(&tmux)
        .args(tmux_args(["kill-session", "-t", &name]))
        .status();
    let _ = Command::new(tmux)
        .args(["kill-session", "-t", &name])
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_only_local_supported_shells() {
        assert!(is_local_shell("/bin/zsh", None));
        assert!(is_local_shell("bash", None));
        assert!(is_local_shell("sh", Some(" ")));
        assert!(!is_local_shell("claude", None));
        assert!(!is_local_shell("zsh", Some("host")));
    }

    #[test]
    fn builds_safe_names_and_direct_argv() {
        assert_eq!(login_shell_args("/bin/zsh", &[]), vec!["-l"]);
        assert_eq!(login_shell_args("/bin/zsh", &["-l".into()]), vec!["-l"]);
        assert_eq!(login_shell_args("claude", &[]), Vec::<String>::new());
        assert_eq!(tmux_session_name("session/a b"), "tde-session_a_b");
        assert_eq!(
            tmux_args(["has-session", "-t", "tde-one"]),
            vec!["-L", "black-tde", "has-session", "-t", "tde-one"]
        );
        assert_eq!(
            create_args("tde-one", "/repo path", "/bin/zsh", &["-l".into()]),
            vec![
                "new-session",
                "-d",
                "-s",
                "tde-one",
                "-c",
                "/repo path",
                "/bin/zsh",
                "-l"
            ]
        );
        assert_eq!(
            attach_args("tde-one"),
            vec!["-L", "black-tde", "attach-session", "-t", "tde-one"]
        );
        assert_eq!(
            split_args("tde-one", "right").unwrap(),
            vec![
                "-L",
                "black-tde",
                "split-window",
                "-h",
                "-t",
                "tde-one",
                "-c",
                "#{pane_current_path}"
            ]
        );
        assert!(split_args("tde-one", "diagonal").is_err());
    }

    #[test]
    fn tmux_server_survives_after_creator_exits() {
        let Some(tmux) = find_tmux() else {
            return;
        };
        let socket = format!("tde-test-{}", uuid::Uuid::new_v4());
        let session = "survival";
        let command = create_args(
            session,
            "/tmp",
            "/bin/sh",
            &["-c".into(), "trap : HUP; while :; do sleep 1; done".into()],
        );
        let status = Command::new(&tmux)
            .args(["-L", &socket])
            .args(command)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(Command::new(&tmux)
            .args(["-L", &socket, "has-session", "-t", session])
            .status()
            .unwrap()
            .success());
        let _ = Command::new(tmux)
            .args(["-L", &socket, "kill-server"])
            .status();
    }

    #[test]
    fn production_adapter_creates_then_reattaches_the_same_shell() {
        if find_tmux().is_none() {
            return;
        }
        let id = format!("test-{}", uuid::Uuid::new_v4());

        let created = prepare_shell(&id, "/bin/sh", &[], "/tmp").unwrap();
        assert!(!created.reattached);
        assert_eq!(created.args, attach_args(&tmux_session_name(&id)));
        let mouse = Command::new(find_tmux().unwrap())
            .args(tmux_args(["show-options", "-gv", "mouse"]))
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&mouse.stdout).trim(), "on");
        let history_limit = Command::new(find_tmux().unwrap())
            .args(tmux_args(["show-options", "-gv", "history-limit"]))
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&history_limit.stdout).trim(),
            "50000"
        );

        let resumed = prepare_shell(&id, "/bin/sh", &[], "/tmp").unwrap();
        assert!(resumed.reattached);

        split_shell_session(&id, "right").unwrap();
        let panes = Command::new(find_tmux().unwrap())
            .args(tmux_args([
                "list-panes",
                "-t",
                &tmux_session_name(&id),
                "-F",
                "#{pane_id}",
            ]))
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&panes.stdout).lines().count(), 2);
        kill_shell_session(&id);
    }
}
