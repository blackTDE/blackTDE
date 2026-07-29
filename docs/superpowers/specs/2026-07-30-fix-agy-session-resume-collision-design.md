# Fix AGY Session Resume Collision Bug Design Spec

## Executive Summary
This spec addresses a bug where restarting TDE caused multiple `agy` code agent sessions in the same workspace to collapse into the first session's conversation ID, preventing independent session resumption.

---

## 1. Root Cause Analysis
1. **Initial Creation Deficit**: When spawning a new `agy` session (`resume_session_id` is `None`), TDE did not pass `--conversation <new_uuid>` to `agy` CLI nor store a generated UUID in `sessions.remote_session_id` in SQLite.
2. **Plain Text Stdout Miss**: `event_bus.rs` only scanned terminal stdout for JSON-formatted keys (`"\"conversation_id\""`), failing to extract plain text `Conversation ID: <uuid>` emitted by AGY CLI.
3. **Unsafe Fallback Collision**: When auto-resuming terminated sessions on startup, TDE resolved missing `remote_session_id` values using `~/.gemini/antigravity-cli/cache/last_conversations.json`. Because `last_conversations.json` contains a single last-used conversation per directory, all NULL `agy` sessions in the same workspace were assigned the same conversation ID and collapsed by frontend deduplication (`dedupeSessions`).

---

## 2. Technical Design

### A. Unique Initial Conversation ID Generation (`spawn_session`)
In `src-tauri/src/main.rs`:
- When spawning a new `agy` (or `opencode` / `claude`) session without an explicit `resume_session_id`:
  - Generate a fresh UUID: `let new_uuid = uuid::Uuid::new_v4().to_string()`.
  - Pass `--conversation <new_uuid>` to `agy` CLI arguments.
  - Record `remote_session_id = Some(new_uuid)` in SQLite database `sessions` table upon creation.

### B. Plain Text Stdout Conversation ID Extraction (`event_bus.rs`)
In `src-tauri/src/event_bus.rs`:
- Expand stdout reader scanning to detect plain text patterns:
  - `Conversation ID: <uuid>`, `conversation_id: <uuid>`, `conversationId: <uuid>`, `Conversation ID: [<uuid>]`, `brain/<uuid>`.
- Update `sessions.remote_session_id` in SQLite whenever a valid conversation ID is detected for the active session.

### C. Claim-Checked Fallback Resolution (`resume_terminated_session`)
In `src-tauri/src/main.rs`:
- When attempting fallback resolution from `last_conversations.json`, verify that the candidate conversation ID is not already claimed by another session in the SQLite database (`SELECT id FROM sessions WHERE remote_session_id = $1 AND id != $2`).
- Prevent multiple sessions from sharing the same `remote_session_id`.

---

## 3. Verification Strategy
- Add Rust unit test verifying AGY argument construction for new vs resumed sessions.
- Run `cargo test` in `src-tauri`.
- Run `npm run test` and `npm run build` in root.
