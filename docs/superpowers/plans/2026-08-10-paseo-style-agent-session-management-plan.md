# Paseo-Style Desktop Agent Sessions — Implementation Plan

**Plan updated:** 2026-08-13  
**Branch:** `tde-paseo-style`, based on `main` commit `37107c564cea0bf41bddc9b7ddae9483b0388003`  
**Paseo reference:** `getpaseo/paseo` commit `9a7301d9a0963ea753bf0ce20b0ee61e0341d710` (2026-08-12)

## Goal

Replace Black TDE's PTY-only coding-agent sessions with Paseo-style app-owned sessions: a stable TDE identity, provider-native resume handle, explicit lifecycle, canonical structured timeline, permissions, send/stop composer, archive/history, and safe reload.

Only these coding agents are supported:

1. Claude Code
2. Codex
3. OpenCode
4. Pi
5. Oh My Pi (`omp`; `oh-my-pi` is an alias)

Local shells and SSH remain on the current PTY/tmux path. Agy, Gemini CLI, Aider, Goose, Copilot, Cline, Devin, Auggie, Grok, and arbitrary agent aliases do not get structured adapters or new-session UI entries.

## What the review found

Black TDE currently routes every shell and coding agent through `spawn_session` in `src-tauri/src/main.rs`, renders all of them in xterm through `src/components/TerminalPane.tsx`, persists raw PTY chunks in `transcripts`, and tries to recover provider IDs by scanning output or choosing the newest file under provider state directories. `delete_session` hard-deletes the record. The React store knows no lifecycle beyond whether a local PTY happens to exist.

Paseo's useful desktop boundary is smaller than its full system:

- `AgentManager` owns the stable local ID, lifecycle, one foreground turn, canonical timeline, and archive state.
- `AgentClient` creates/resumes a provider session; `AgentSession` sends, interrupts, handles permissions, reports its durable handle, and closes its runtime.
- `ensureAgentLoaded()` single-flights resume and never binds a closed agent to the “latest” provider session.
- The desktop UI uses workspace tabs, a structured agent stream, composer, status/attention indicators, permission actions, and history/unarchive.
- `closed` means resumable with no live process; `archivedAt` is a separate soft-delete state.

References:

- [DeepWiki overview](https://deepwiki.com/getpaseo/paseo)
- [Paseo agent lifecycle](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/docs/agent-lifecycle.md)
- [Paseo agent contracts](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/packages/server/src/server/agent/agent-sdk-types.ts)
- [Paseo load/resume gate](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/packages/server/src/server/agent/agent-loading.ts)
- [Paseo desktop agent panel](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/packages/app/src/panels/agent-panel.tsx)
- [Paseo structured stream](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/packages/app/src/agent-stream/view.tsx)
- [Paseo composer](https://github.com/getpaseo/paseo/blob/9a7301d9a0963ea753bf0ce20b0ee61e0341d710/packages/app/src/composer/index.tsx)

## Deliberately not adopted

Do not add Paseo's daemon/WebSocket split, Electron shell, mobile clients, relay, multi-host sync, worktree orchestration, schedules, voice, browser automation, chat rooms, MCP agent orchestration, or subagent lifecycle. Black TDE is a single-machine Tauri app; Tauri commands and events are already the correct process boundary.

## Provider contract

| Provider | Structured transport | Durable handle | Archive behavior |
| --- | --- | --- | --- |
| Claude Code | Long-lived Claude structured stream/control protocol used by the Agent SDK; never scrape the TUI | Claude session UUID plus `cwd` metadata | Local archive closes runtime; native transcript remains |
| Codex | `codex app-server` JSON-RPC over stdio | Codex thread ID | Call `thread/archive` / `thread/unarchive` |
| OpenCode | One managed `opencode serve --port <port>` process; HTTP commands plus event stream | OpenCode session ID plus `cwd` | Update OpenCode's native archived timestamp |
| Pi | `pi --mode rpc` JSONL over stdio; resume with `--session <session-file>` | Pi session ID and native session-file path | Local archive closes runtime; native file remains |
| Oh My Pi | `omp --mode rpc-ui` JSONL over stdio; resume with `--session <session-file>` | OMP session ID and native session-file path | Local archive closes runtime; native file remains |

Each adapter must provide create, resume, prompt, event mapping, permission response when the provider supports it, interrupt acknowledgement, history hydration, process-exit handling, persistence description, and idempotent close. Provider-specific model/mode controls are exposed only when proven by that adapter.

## Required invariants

- The TDE session ID never doubles as a provider session/thread ID.
- Only the provider may produce a durable handle; TDE never invents one.
- No ordinary resume scans for or selects the newest provider session.
- At most one create/resume and one foreground turn own a session at a time.
- A second prompt is rejected while the lifecycle is `running`.
- Stop changes state only after the provider acknowledges interruption or emits a terminal turn event.
- Provider history hydrates an empty canonical timeline once; reload never duplicates rows.
- Timeline sequence is append-only and unique per TDE session.
- A runtime exit during a turn persists an error item and leaves the agent in `error`; between-turn exit leaves it `closed`.
- `closed` is resumable and unarchived. Archive is soft delete. Purge is separate and confirmed.
- Unsupported features are hidden or disabled; no adapter pretends a request succeeded.
- Shell, SSH, and agent runtime maps are separate. Structured agent output never enters `transcripts` or xterm.

## Phase 1 — Durable model and lifecycle

**Files**

- Add `src-tauri/migrations/20260813000000_structured_agent_sessions.sql`
- Add `src-tauri/src/agent/mod.rs`
- Add `src-tauri/src/agent/types.rs`
- Add `src-tauri/src/agent/storage.rs`
- Modify `src-tauri/src/main.rs`

**Work**

- [ ] Add `session_kind` (`terminal`, `agent`, `legacy_agent`), `runtime_status` (`initializing`, `idle`, `running`, `error`, `closed`), `provider_handle` JSON, `active_turn_id`, `archived_at`, and `last_error` to `sessions`.
- [ ] Add `agent_timeline_items(session_id, sequence, turn_id, kind, payload, created_at)` with primary key `(session_id, sequence)` and a foreign key to `sessions`.
- [ ] Keep `remote_session_id` and `transcripts` only for legacy migration/terminal history; new structured agents never write either field.
- [ ] Migrate exact `claude`, `codex`, `opencode`, `pi`, `omp`, and `oh-my-pi` rows to `session_kind='agent'`, but leave `provider_handle` empty until explicit validation/import. Mark known removed agent types as `legacy_agent`; do not delete their records or transcripts.
- [ ] Implement validated lifecycle transitions and normalize stale `initializing`/`running` rows to `closed` at startup, appending one interruption/error timeline row when a turn was active.
- [ ] Add storage methods for session snapshots, append-only timeline rows, backward pagination (200 rows), archive/unarchive, and confirmed purge.

**Check**

- [ ] Rust tests cover invalid transitions, monotonic sequence allocation, archive versus close, startup normalization, and migration of all five aliases plus an unsupported legacy row.
- [ ] Commit: `feat(agent): add durable agent lifecycle and timeline storage`.

## Phase 2 — One manager seam, no daemon

**Files**

- Add `src-tauri/src/agent/manager.rs`
- Add `src-tauri/src/agent/provider.rs`
- Add `src-tauri/src/agent/commands.rs`
- Modify `src-tauri/src/process.rs`
- Modify `src-tauri/src/main.rs`

**Work**

- [ ] Define one provider-neutral adapter/runtime contract for capabilities, create, resume, prompt, interrupt, permission response, history, persistence handle, and close.
- [ ] Add `AgentSessionManager` with its own live-runtime map. Reuse the existing per-session async lock pattern for single-flight `ensure_loaded(session_id)`; do not share `ProcessManager.active_sessions`.
- [ ] Normalize provider events to `thread_started`, `turn_started`, `timeline`, `permission_requested`, `permission_resolved`, `turn_completed`, `turn_failed`, `turn_canceled`, and `runtime_closed`.
- [ ] Persist each normalized event before emitting `agent-event` through Tauri. Emit directory/status snapshots separately so the sidebar does not need the whole timeline.
- [ ] Add Tauri commands: `create_agent_session`, `ensure_agent_loaded`, `get_agent_timeline`, `send_agent_prompt`, `interrupt_agent_turn`, `respond_agent_permission`, `close_agent_runtime`, `archive_agent_session`, `unarchive_agent_session`, and `purge_agent_session`.
- [ ] Persist the user message only after the provider accepts `startTurn`; reject send unless state is `idle` or successfully loaded from `closed`.
- [ ] On partial create/resume failure, close every spawned process before returning the error.
- [ ] Put a test-only fake adapter inside manager tests; do not ship a fake provider.

**Check**

- [ ] Rust tests cover concurrent load deduplication, concurrent prompt rejection, failed interrupt staying `running`, permission round-trip, runtime crash, close/reload, and no duplicate history hydration.
- [ ] Commit: `feat(agent): add app-owned session manager and Tauri API`.

## Phase 3 — Codex vertical slice

**Files**

- Add `src-tauri/src/agent/json_rpc.rs`
- Add `src-tauri/src/agent/providers/mod.rs`
- Add `src-tauri/src/agent/providers/codex.rs`
- Modify `src-tauri/src/agent/manager.rs`

**Work**

- [ ] Spawn the resolved `codex app-server` executable with piped stdio, perform `initialize`/`initialized`, and dispose it on every failure path.
- [ ] Use `thread/start` for create, `thread/resume` for reload, `turn/start` for prompts, the app-server interrupt method for Stop, and native approval/elicitation responses for permissions.
- [ ] Map assistant text, reasoning, command/file/tool activity, usage, permissions, and turn terminal notifications to the canonical event stream.
- [ ] Persist the returned thread ID as both session ID and native handle; never call `resolve_codex_session_id()` during normal load.
- [ ] Implement `thread/archive` and `thread/unarchive` behind capability/error checks.
- [ ] Treat unexpected app-server exit as a runtime terminal event and fail any active turn exactly once.

**Check**

- [ ] Parser/contract tests use a small fake app-server child and recorded JSON-RPC frames.
- [ ] Opt-in smoke: create → prompt → permission if requested → stop → close → resume → prompt → archive → unarchive.
- [ ] Commit: `feat(agent): manage Codex through app-server`.

## Phase 4 — Paseo-style desktop agent panel

**Files**

- Add `src/agentSession.ts`
- Add `src/components/AgentPane.tsx`
- Add `src/components/AgentTimeline.tsx`
- Add `src/components/AgentComposer.tsx`
- Add `src/components/AgentHistoryDialog.tsx`
- Modify `src/components/TerminalGrid.tsx`
- Modify `src/store/workspaceStore.ts`
- Modify `src/App.tsx`
- Modify `src/agentIcons.ts`

**Work**

- [ ] Extend `SessionInfo` with `sessionKind`, exact five-value `agentProvider`, `runtimeStatus`, `attentionReason`, and `archivedAt`; do not persist timeline content in localStorage.
- [ ] Route `sessionKind='agent'` to `AgentPane` and terminal/SSH rows to the existing `TerminalPane`. Keep the current one/two/four-pane workspace layouts and mounted-pane behavior.
- [ ] Render user, assistant, reasoning, tool, error, system, and permission items from the authoritative sequence-ordered timeline. Load older pages without moving the user's viewport; merge live events by sequence.
- [ ] Add a multiline composer with Send while idle, Stop while running, provider/mode/model summary, reconnect state, and inline permission allow/deny/question actions.
- [ ] Show Paseo-style status/attention dots in the project tree and session tabs for initializing, running, permission, finished, error, idle, and closed.
- [ ] Make tab/pane removal a layout action. Make explicit Archive a soft delete with confirmation when running. Add History for archived agents with Unarchive and confirmed Purge.
- [ ] Keep raw terminal keyboard handling, transcript replay, SFTP, and shell split controls out of `AgentPane`.
- [ ] Replace `pastSessions`/remote-ID resume UI with stable TDE session selection and history; opening a closed agent calls `ensure_agent_loaded`.

**Check**

- [ ] Pure TypeScript tests cover event deduplication, lifecycle-to-control state, permission rendering data, tab removal versus archive, timeline pagination merge, and the exact five-provider selector.
- [ ] Manual UI check: an agent can share the existing workspace grid with a shell, switch tabs without losing state, reload after app restart, and archive/unarchive without deletion.
- [ ] Commit: `feat(agent): add structured Paseo-style desktop session view`.

## Phase 5 — The other four adapters

Land one adapter and its contract/smoke test per commit.

### Claude Code

- [ ] Add `src-tauri/src/agent/providers/claude.rs` and the smallest reusable structured-stream decoder needed by the adapter.
- [ ] Launch Claude's long-lived structured stream/control mode used by the Agent SDK, with piped stdin/stdout and the original `cwd`; never screen-scrape the interactive TUI.
- [ ] Map init/session UUID, partial assistant/reasoning frames, tool calls, usage, results, and permission control requests. Respond to permissions through the control channel.
- [ ] Resume only with the stored Claude UUID and `cwd`. On an explicit “session missing” response, keep the TDE record and surface recovery/import; never silently start a different conversation.
- [ ] Stop waits for the control-protocol interrupt/result acknowledgement. Archive is local-only and closes the runtime.
- [ ] Commit: `feat(agent): add Claude Code structured adapter`.

### OpenCode

- [ ] Add `src-tauri/src/agent/providers/opencode.rs`.
- [ ] Start one ref-counted `opencode serve --port <free-port>` process on loopback, wait for readiness, and use its HTTP session API plus event stream.
- [ ] Create/resume by OpenCode session ID and original directory; map messages, parts, reasoning, tool calls, retry notices, permissions, status, and usage.
- [ ] Do not report cancellation until the session abort request settles and the run reaches its terminal event.
- [ ] Implement native archive/unarchive by updating OpenCode's archived timestamp; shut the shared server down when TDE exits.
- [ ] Commit: `feat(agent): add OpenCode server adapter`.

### Pi and Oh My Pi

- [ ] Add shared `src-tauri/src/agent/jsonl_rpc.rs` for line framing, request IDs, response matching, process-exit fanout, timeout policy, and idempotent close.
- [ ] Add separate `src-tauri/src/agent/providers/pi.rs` and `src-tauri/src/agent/providers/omp.rs`; share transport only, not event mapping or capabilities.
- [ ] Pi launches `pi --mode rpc`; OMP launches `omp --mode rpc-ui`. Resume each with its stored native session-file path, not its display/session UUID alone.
- [ ] Read initial state before registration, map history and live assistant/reasoning/tool/usage events, bridge extension UI requests to canonical permissions, and use the provider abort RPC for Stop.
- [ ] Capability-gate OMP-only approval/subagent/host-tool events. Subagent orchestration stays out of scope; OMP child events may render as ordinary tool activity only.
- [ ] Commit separately: `feat(agent): add Pi RPC adapter`, then `feat(agent): add Oh My Pi RPC adapter`.

## Phase 6 — Cut over and remove false recovery

**Files**

- Modify `src-tauri/src/main.rs`
- Modify `src-tauri/src/event_bus.rs`
- Modify `src-tauri/src/process.rs`
- Modify `src/App.tsx`
- Modify `src/sessionUtils.ts`
- Modify `README.md`

**Work**

- [ ] Restrict the coding-agent selector and CLI detection to Claude Code, Codex, OpenCode, Pi, and OMP/Oh My Pi. Keep shell, SSH, Git, and ordinary utility detection where still used outside agent creation.
- [ ] Route all new sessions for those five through `create_agent_session`; `spawn_session` and `resume_terminated_session` become terminal/SSH-only.
- [ ] Delete `agent_session_flags`, `agent_new_session_args`, provider-specific resume argument guessing, raw output ID detection, “latest session file” scanners, remote-ID deduplication, and generated fake provider UUIDs after legacy import no longer calls them.
- [ ] Add explicit legacy import for a selected old row/provider session. Validate the exact provider handle before attaching it to the stable TDE ID; Pi/OMP import must obtain the native session-file path.
- [ ] Keep unsupported legacy records visible in History with transcript export and purge, but no start/resume action.
- [ ] Ensure `clear_terminated_sessions` and terminal deletion cannot remove structured agent records. Agent archive never deletes timeline rows.
- [ ] Update documentation and screenshots only after the structured panel is the default for all five providers.

**Check**

- [ ] Repository search finds no new-session option or adapter for removed coding agents and no supported-agent path that writes to `transcripts` or scans for “latest” sessions.
- [ ] Upgrade test uses a copied pre-migration database containing shell, each of the five agents, an unsupported agent, missing handles, duplicate remote IDs, and an active row interrupted by restart.
- [ ] Commit: `refactor(agent): complete five-provider structured-session cutover`.

## Delivery gate

- [ ] `rtk cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] `rtk npm test`
- [ ] `rtk npm run build`
- [ ] For each of Claude Code, Codex, OpenCode, Pi, and OMP: create → prompt → app restart → resume → second prompt.
- [ ] For each provider: Stop during a real turn; TDE does not accept a second prompt before cancellation is authoritative.
- [ ] For each provider that requests permission: allow and deny both round-trip and persist visible timeline results.
- [ ] Kill each provider runtime during a turn; one error row is persisted and the same TDE session can be safely resumed.
- [ ] Archive/unarchive all five; Codex and OpenCode mirror native archive state, while Claude/Pi/OMP preserve their native transcript/session files.
- [ ] Open a shell and an agent in the same split layout; PTY resize/input/history behavior is unchanged.
- [ ] Unsupported agent names are absent from creation UI and adapter registry.
- [ ] No ordinary resume selects a provider session by modification time, `cwd` alone, or “latest” heuristics.

## Baseline before implementation

At plan time, `rtk npm test`, `rtk npm run build`, and `rtk cargo test --manifest-path src-tauri/Cargo.toml` pass on `main`. Preserve those checks throughout the cutover.
