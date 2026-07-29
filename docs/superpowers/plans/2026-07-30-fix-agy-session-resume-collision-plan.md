# AGY Session Resume Collision Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure each `agy` code agent session receives and persists a unique conversation ID on initial creation, scans plain text terminal output for IDs, and avoids fallback collision across multiple sessions in the same workspace.

---

### Task 1: Update `spawn_session` and `resume_terminated_session` in `src-tauri/src/main.rs`

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Assign explicit unique conversation ID to brand new `agy` sessions**
  - Implement `agent_new_session_args(command: &str, new_id: &str) -> Option<Vec<String>>` supporting `agy`, `claude`, `opencode`.
  - Pass `--conversation <new_uuid>` to `agy` when creating a brand new session, and set `initial_remote_id = Some(new_uuid)`.
- [ ] **Step 2: Add claim-checking to fallback resolution in `resume_terminated_session`**
  - Query SQLite to check if resolved conversation ID is already claimed by another session in the workspace before updating.
- [ ] **Step 3: Add unit tests for `agent_new_session_args` in `src-tauri/src/main.rs`**
- [ ] **Step 4: Commit changes to `src-tauri/src/main.rs`**

---

### Task 2: Enhance Stdout Scanning in `src-tauri/src/event_bus.rs`

**Files:**
- Modify: `src-tauri/src/event_bus.rs`

- [ ] **Step 1: Add plain text `Conversation ID:` parser to `start_stdout_reader`**
- [ ] **Step 2: Commit changes to `src-tauri/src/event_bus.rs`**

---

### Task 3: Verification Suite

- [ ] **Step 1: Run `cargo test` in `src-tauri`**
- [ ] **Step 2: Run `npm run test` and `npm run build` in root**
- [ ] **Step 3: Commit final verification status**
