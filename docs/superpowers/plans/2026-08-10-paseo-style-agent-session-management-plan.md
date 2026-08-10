# Paseo-Style Code Agent Session Management Plan

**Goal:** Give Codex, Claude Code, OpenCode, OMP/Pi, and Agy durable app-owned sessions with provider-native resume, structured timelines, explicit lifecycle state, and a native agent view while keeping the existing PTY terminal as a compatibility fallback.

**Architecture:** Place one deep `AgentSessionManager` module between Tauri commands and provider adapters. TDE owns the stable session ID, lifecycle, canonical timeline, and concurrency; each adapter owns only its provider handle and protocol. Shells remain PTY/tmux sessions and never cross this seam.

**Reference:** Paseo `02c4bc76` (2026-08-09), especially [agent lifecycle](https://github.com/getpaseo/paseo/blob/main/docs/agent-lifecycle.md), `AgentClient`/`AgentSession`, and `ensureAgentLoaded()`. Adopt the identity/lifecycle shape, not Paseo's full daemon, WebSocket, workspace, or mobile stack.

## Required invariants

- A TDE session ID is stable and never doubles as a provider session/thread ID.
- `closed` means resumable with no live runtime; `archived` is a separate soft-delete state.
- At most one create/resume operation and one foreground turn may own a session at a time.
- A prompt is accepted only after the provider confirms the previous turn ended or interruption succeeded.
- Provider history hydrates an empty canonical timeline once; resume never duplicates it.
- Provider process exit during a turn becomes `error` plus a persisted timeline item.
- Unsupported provider features are capability-gated; they do not pretend to succeed.
- Local shells, SSH shells, and agent compatibility terminals keep their existing PTY path.

## Canonical interface

```rust
trait AgentAdapter {
    fn capabilities(&self) -> AgentCapabilities;
    async fn create(&self, config: AgentConfig) -> Result<AgentRuntime>;
    async fn resume(&self, handle: ProviderHandle, config: AgentConfig) -> Result<AgentRuntime>;
}

trait AgentRuntime {
    async fn send(&mut self, prompt: AgentPrompt) -> Result<()>;
    async fn interrupt(&mut self) -> Result<()>;
    async fn respond_permission(&mut self, response: PermissionResponse) -> Result<()>;
    async fn close(&mut self) -> Result<()>;
}
```

`AgentRuntime` emits one provider-neutral stream: `thread_started`, `turn_started`, `timeline`, `permission_requested`, `permission_resolved`, `turn_completed`, `turn_failed`, `turn_canceled`, and `runtime_closed`.

## Phase 1 — Persistence and lifecycle core

**Files:**
- Add migration: `src-tauri/migrations/*_structured_agent_sessions.sql`
- Create: `src-tauri/src/agent_session.rs`
- Modify: `src-tauri/src/main.rs`, `src-tauri/src/process.rs`

- [ ] Extend `sessions` with `session_kind`, `runtime_status`, `provider_handle`, `archived_at`, and `last_error`; retain `remote_session_id` for migration only.
- [ ] Add `agent_timeline_items(session_id, sequence, turn_id, kind, payload, created_at)` with a unique `(session_id, sequence)` constraint.
- [ ] Implement lifecycle transitions `initializing → idle ↔ running`, `running → error`, and any live state → `closed`.
- [ ] Reuse the existing per-session resume lock to implement single-flight `ensure_loaded(session_id)`.
- [ ] On startup, normalize stale `initializing`/`running` records to `closed` with an interruption item.
- [ ] Test transition rejection, concurrent resume deduplication, stable provider-handle persistence, and timeline ordering.
- [ ] Commit: `feat(agent): add durable session lifecycle core`.

## Phase 2 — Provider seam and fake adapter

**Files:**
- Create: `src-tauri/src/agent_provider.rs`
- Create: `src-tauri/src/agent_providers/fake.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Add the two real seams above: `AgentAdapter` and live `AgentRuntime`; keep the interface capability-driven and provider-neutral.
- [ ] Move provider argument/session-ID decisions out of `main.rs`; delete `agent_session_flags` after adapters own them.
- [ ] Add a fake adapter that deterministically emits create, resume, prompt, permission, completion, cancellation, and process-exit events.
- [ ] Expose Tauri commands `create_agent`, `ensure_agent_loaded`, `send_agent_prompt`, `interrupt_agent`, `respond_agent_permission`, `close_agent`, and `archive_agent`.
- [ ] Test all manager behavior only through those interfaces before connecting a real provider.
- [ ] Commit: `refactor(agent): introduce provider session seam`.

## Phase 3 — Codex first vertical slice

**Files:**
- Create: `src-tauri/src/agent_providers/codex.rs`
- Create: `src-tauri/src/agent_protocol.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] Use `codex app-server` JSON-RPC rather than screen-scraping the Codex TUI.
- [ ] Map Codex thread/turn/message/reasoning/tool/permission events into the canonical stream.
- [ ] Store the Codex thread ID as `provider_handle`; implement create, resume, prompt, interrupt, permission response, runtime exit, and close.
- [ ] Import an existing Codex rollout only through an explicit import command; stop guessing the newest workspace session during normal resume.
- [ ] Run contract tests against a fake JSON-RPC child and an opt-in real Codex smoke test.
- [ ] Commit: `feat(agent): manage Codex through app-server`.

## Phase 4 — Native agent view

**Files:**
- Create: `src/components/AgentPane.tsx`, `src/components/AgentTimeline.tsx`, `src/components/AgentComposer.tsx`
- Modify: `src/components/TerminalGrid.tsx`, `src/App.tsx`, `src/store/workspaceStore.ts`

- [ ] Route `session_kind=agent` to `AgentPane`; route shell/SSH/fallback sessions to `TerminalPane`.
- [ ] Render persisted user, assistant, reasoning, tool, error, and permission timeline items.
- [ ] Add a composer with send/stop, permission actions, reconnect state, and explicit archive; keep mounted panes to preserve local UI state.
- [ ] Paginate canonical history by sequence and keep the user's scroll position when older items load.
- [ ] Test reconnect without duplicate messages, failed interruption, permission round trips, and archive versus tab close.
- [ ] Commit: `feat(agent): add structured native session view`.

## Phase 5 — Remaining provider adapters

**Files:**
- Create: `src-tauri/src/agent_providers/{claude,opencode,omp,pi,agy}.rs`

- [ ] Claude Code: use its structured SDK/stream protocol; map native permissions, tool calls, usage, and resume handle.
- [ ] OpenCode: use its server/event protocol and native session ID.
- [ ] OMP and Pi: share transport helpers only where their RPC frames are actually identical; keep event mapping provider-owned.
- [ ] Agy: implement structured output if its installed CLI exposes a stable machine protocol; otherwise declare `structured=false` and retain PTY fallback.
- [ ] Run the same adapter contract suite for every provider plus one opt-in real smoke test per installed CLI.
- [ ] Commit one adapter at a time; do not land a multi-provider untestable batch.

## Phase 6 — Migration, archive, and subagents

- [ ] Migrate current agent rows by preserving TDE IDs and copying valid `remote_session_id` values into typed provider handles.
- [ ] Keep rows with invalid/missing handles as `closed`; require explicit import or start-new instead of silently binding an unrelated native session.
- [ ] Replace hard delete with archive, and add a separate confirmed purge operation.
- [ ] Add parent session ID only after at least one provider supplies trustworthy child-session events; never infer parentage from `cwd`.
- [ ] Remove raw agent transcript replay after every supported provider uses canonical timelines; retain transcript capture for terminal sessions.
- [ ] Verify upgrade from a copied production database, provider process crash, app restart mid-turn, archive/resume, and concurrent prompt rejection.
- [ ] Commit: `feat(agent): migrate and archive managed sessions`.

## Delivery gate

- [ ] `rtk cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] `rtk npm test && rtk npm run build`
- [ ] Real smoke test: create → prompt → restart TDE → resume → prompt for each supported provider.
- [ ] Failure smoke test: kill the provider mid-turn and verify `error`, timeline persistence, and safe resume.
- [ ] No agent path scans for “latest session” during ordinary resume.
- [ ] No shell session crosses the structured agent manager.

## Deliberately deferred

- Multi-device daemon/WebSocket synchronization, worktree orchestration, scheduling, voice, and provider-owned subagent timelines. Add them only after the local lifecycle and provider contract are proven stable.
