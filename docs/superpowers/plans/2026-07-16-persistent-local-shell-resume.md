# Persistent Local Shell Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reattach reopened zsh, bash, and sh sessions through tmux, restore their saved scrollback, and remove the misleading remote-agent warning.

**Architecture:** Add one Rust module that classifies local shells, derives safe tmux names, creates persistent tmux sessions, attaches PTY clients, and performs explicit cleanup. Keep frontend restore orchestration generic by making transcript replay optional; `TerminalPane` enables it only for local shells and displays the backend resume outcome.

**Tech Stack:** Rust/Tauri 2, portable-pty, tmux, React 18, TypeScript, xterm.js, SQLite transcripts, Node test runner.

## Global Constraints

- Preserve all existing dirty-worktree changes and do not stage overlapping source files.
- Apply persistence only to local zsh, bash, and sh; agent and SSH behavior remains unchanged.
- Construct tmux commands with direct argv; never interpolate shell text.
- Existing rows require no database migration.
- Failure to find or launch tmux falls back to a usable direct shell.
- Transcript replay remains disabled for agents.

---

### Task 1: Persistent tmux Shell Backend

**Files:**
- Create: `src-tauri/src/shell_session.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/shell_session.rs`

**Interfaces:**
- Consumes: local session ID, command, command arguments, cwd, and optional SSH host.
- Produces: `is_local_shell(command: &str, ssh_host: Option<&str>) -> bool`, `tmux_session_name(id: &str) -> String`, `prepare_shell(id, command, args, cwd) -> Option<PersistentShell>`, and `kill_shell_session(id: &str)`.
- `PersistentShell` contains `command: String`, `args: Vec<String>`, and `reattached: bool`.

- [ ] **Step 1: Write failing unit tests for classification and argv**

```rust
assert!(is_local_shell("/bin/zsh", None));
assert!(is_local_shell("bash", None));
assert!(!is_local_shell("claude", None));
assert!(!is_local_shell("zsh", Some("host")));
assert_eq!(tmux_session_name("session/a b"), "tde-session_a_b");
assert_eq!(create_args("tde-one", "/repo path", "/bin/zsh", &["-l".into()]),
    vec!["new-session", "-d", "-s", "tde-one", "-c", "/repo path", "/bin/zsh", "-l"]);
assert_eq!(attach_args("tde-one"), vec!["attach-session", "-t", "tde-one"]);
```

- [ ] **Step 2: Verify the backend tests fail for missing behavior**

Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml shell_session -- --nocapture`

Expected: compile failure because `shell_session` and its functions do not exist.

- [ ] **Step 3: Implement the minimal tmux adapter**

```rust
pub struct PersistentShell {
    pub command: String,
    pub args: Vec<String>,
    pub reattached: bool,
}

pub fn is_local_shell(command: &str, ssh_host: Option<&str>) -> bool {
    ssh_host.filter(|host| !host.trim().is_empty()).is_none()
        && matches!(command.rsplit(['/', '\\']).next().unwrap_or(command), "zsh" | "bash" | "sh")
}
```

Resolve tmux from PATH, `/opt/homebrew/bin/tmux`, and `/usr/local/bin/tmux`. `prepare_shell` checks `tmux has-session -t <name>`, creates a detached session with `new-session -d -s <name> -c <cwd> <shell> <args...>` when absent, then returns `attach-session -t <name>`. Any resolution, probe, or creation failure returns `None` for direct-shell fallback. `kill_shell_session` issues `kill-session -t <name>` best-effort.

- [ ] **Step 4: Wire initial launch, resume outcome, and deletion**

In `spawn_session`, call `prepare_shell` only after agent arguments are finalized and before `spawn_pty_process`. In `resume_terminated_session`, return:

```rust
#[derive(serde::Serialize)]
struct ResumeOutcome { kind: &'static str }
```

Use `reattached` when the named tmux session existed, `restarted` when a new tmux or direct shell was created, and `resumed` for non-shell sessions. In `delete_session`, query `agent_type` and `ssh_host` before deleting the row and call `kill_shell_session` only for a local shell.

- [ ] **Step 5: Add and run a real tmux survival check**

The Rust test uses a unique tmux socket and session, starts `/bin/sh -c 'trap : HUP; while :; do sleep 1; done'` detached using the production argument builder, verifies `has-session`, then kills only that test server. Skip this test only when `find_tmux()` returns `None`.

Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml shell_session -- --nocapture`

Expected: all shell-session unit and integration checks pass.

### Task 2: Shell-Only Scrollback Restore and Accurate Status

**Files:**
- Create: `src/shellRestore.ts`
- Modify: `src/terminalRestore.ts`
- Modify: `src/components/TerminalPane.tsx`
- Modify: `tests/terminalRestore.test.ts`
- Create: `tests/shellRestore.test.ts`

**Interfaces:**
- Consumes: frontend session agent type, SSH host, persisted transcript bytes, and backend `ResumeOutcome.kind`.
- Produces: `isLocalShell(command, sshHost)`, `shellResumeMessage(kind)`, and optional `replayHistory` ordering in `restoreTerminal`.

- [ ] **Step 1: Write failing restore-order and message tests**

```ts
assert.deepEqual(events, ['lookup', 'reset', 'fit', 'history', 'resume', 'fit', 'ready']);
assert.equal(isLocalShell('/bin/zsh'), true);
assert.equal(isLocalShell('zsh', 'user@host'), false);
assert.equal(shellResumeMessage('reattached'), 'Shell session reattached');
assert.equal(shellResumeMessage('restarted'), 'Shell session restarted; saved scrollback restored');
```

The existing inactive-agent test must continue to omit `history`.

- [ ] **Step 2: Verify frontend tests fail for missing behavior**

Run: `rtk npm test`

Expected: failure because `replayHistory`, `isLocalShell`, and `shellResumeMessage` do not exist.

- [ ] **Step 3: Implement optional replay and local-shell branching**

```ts
export interface TerminalRestoreActions {
  replayHistory?: () => Promise<void>;
  // existing members remain unchanged
}

if (!isActive) {
  actions.reset();
  await actions.fitAndResize(false);
  await actions.replayHistory?.();
  await actions.resume();
}
```

`TerminalPane` passes `replayHistory` only when `isLocalShell(session.agentType, session.ssh_host)` is true. It reads `get_session_history`, writes those bytes before resume, invokes `resume_terminated_session`, and prints `shellResumeMessage(outcome.kind)`. Agent sessions retain their provider-ID logic and never replay transcripts.

- [ ] **Step 4: Verify frontend behavior**

Run: `rtk npm test && rtk npm run build`

Expected: all Node tests pass and TypeScript/Vite build successfully.

### Task 3: Completion Audit

**Files:**
- Verify: all files above and the current installed tmux process behavior.

**Interfaces:**
- Consumes: completed backend/frontend implementation.
- Produces: direct evidence for every acceptance criterion.

- [ ] **Step 1: Run all automated checks**

Run: `rtk npm test && rtk npm run build && rtk cargo test --manifest-path src-tauri/Cargo.toml && rtk git diff --check`

Expected: every command exits zero.

- [ ] **Step 2: Run a manual process-continuity probe**

Create a disposable shell session through the production tmux adapter, record its shell PID and cwd, terminate only the PTY attach client, reattach, and confirm the PID and cwd are unchanged. Delete the disposable session and verify its tmux session is gone while unrelated tmux sessions remain.

- [ ] **Step 3: Review without staging user work**

Inspect the focused diff and keep all implementation changes unstaged because `src-tauri/src/main.rs`, `src/components/TerminalPane.tsx`, `src/terminalRestore.ts`, and `tests/terminalRestore.test.ts` contained pre-existing user edits.
