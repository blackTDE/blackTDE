use std::path::{Path, PathBuf};
use std::process::Command;

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
    vec!["attach-session".into(), "-t".into(), name.into()]
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
    prepare_shell_with(&tmux, id, command, args, cwd)
}

fn prepare_shell_with(
    tmux: &Path,
    id: &str,
    command: &str,
    args: &[String],
    cwd: &str,
) -> Option<PersistentShell> {
    let name = tmux_session_name(id);
    let reattached = Command::new(tmux)
        .args(["has-session", "-t", &name])
        .status()
        .ok()?
        .success();

    if !reattached
        && !Command::new(tmux)
            .args(create_args(&name, cwd, command, args))
            .status()
            .ok()?
            .success()
    {
        return None;
    }

    Some(PersistentShell {
        command: tmux.to_string_lossy().into_owned(),
        args: attach_args(&name),
        reattached,
    })
}

pub fn kill_shell_session(id: &str) {
    let Some(tmux) = find_tmux() else {
        return;
    };
    let _ = Command::new(tmux)
        .args(["kill-session", "-t", &tmux_session_name(id)])
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
        assert_eq!(tmux_session_name("session/a b"), "tde-session_a_b");
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
            vec!["attach-session", "-t", "tde-one"]
        );
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
}
