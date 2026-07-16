# Persistent Local Shell Resume Design

## Context

TDE currently owns each PTY inside the application process. Closing TDE destroys local zsh, bash, and sh processes. On reopen, `resume_terminated_session` starts a new shell and the frontend displays the agent-oriented message `resuming remote ID: None (fresh shell)`.

TDE already persists PTY output in the `transcripts` table, but the current restore path does not replay it. Orca solves true continuity with a separate PTY daemon; reproducing that subsystem is outside this focused fix.

## Design

Local zsh, bash, and sh sessions will run through the `tmux` installation available on the host. Agent and SSH sessions remain unchanged.

- Each TDE shell session maps to a deterministic tmux session name derived from its local TDE session ID.
- Initial launch uses tmux's create-or-attach behavior, with the requested shell, arguments, working directory, and terminal dimensions passed as direct arguments rather than shell-interpolated text.
- Reopening TDE uses the same tmux name. If the tmux session still exists, TDE attaches to the original shell process, preserving its cwd, environment, jobs, running commands, and tmux history.
- If tmux is unavailable or the named session expired, TDE starts a normal fresh shell and reports that outcome accurately.
- Explicitly deleting a TDE shell session also kills its corresponding tmux session. Closing or restarting TDE does not.

The backend resume command will return a small outcome value so the frontend can distinguish `reattached` from `restarted`. Local shells will never call `get_remote_session_id`, and the misleading remote-agent warning will be removed for them.

## Scrollback

When restoring an inactive local shell, TDE will replay that shell's persisted transcript before attaching or restarting. This replay is restricted to zsh, bash, and sh; agent transcripts remain excluded because replaying alternate-screen TUI output caused the existing display corruption during agent switching.

Incoming PTY output remains queued until transcript replay and initial sizing complete, preserving output order. A reattached shell displays `Shell session reattached`; an expired or non-tmux shell displays `Shell session restarted; saved scrollback restored`.

## Fallback and Compatibility

- Existing shell rows require no migration because the tmux name is derived from the existing session ID.
- Existing sessions created before this change will have no tmux server session. Their first restore therefore uses the fresh-shell fallback while retaining saved scrollback; later restores reattach normally.
- Tmux resolution checks the inherited PATH and standard Homebrew locations used by the current macOS host. Failure to resolve or launch tmux must not prevent opening a shell.
- Direct argv construction prevents shell injection through session IDs, paths, or shell arguments.

## Verification

Regression checks will prove:

- only local zsh, bash, and sh commands use the persistent-shell path;
- deterministic tmux names contain only safe characters;
- create-or-attach arguments preserve the shell executable, cwd, and arguments;
- local shell restoration replays transcript before resume and does not request a remote ID;
- agent restoration still avoids transcript replay;
- deleting a shell requests termination of its tmux session;
- a real tmux integration test starts a shell, detaches the TDE-side client, and confirms state remains in the same tmux session before cleanup;
- frontend and Rust suites pass.

## Acceptance Criteria

- Reopening a live zsh, bash, or sh session reconnects to the same shell process instead of creating a new one.
- Previously displayed shell output is available after restoration.
- Local shells no longer show `resuming remote ID: None (fresh shell)`.
- Expired sessions fall back to a usable fresh shell with an accurate message and saved scrollback.
- Session deletion terminates the persistent tmux session without affecting unrelated tmux sessions.
