# Implementation Plan: Top-Bar Project Tab Tag Closing & Session Save/Resume Auto-Recovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project tab tag closing with hover `'x'` button to the top tab bar without deleting projects from the left pane, and strengthen session save/resume logic with robust command resolution and auto-healing for missing remote session IDs.

**Architecture:**
- Top project tab management in `src/store/workspaceStore.ts` and `src/App.tsx`.
- Robust command classification (`extract_agent_kind`) and session auto-healing in `src-tauri/src/main.rs`.

---

## Task 1: Top-Bar Project Tab Tag Closing Feature

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add openWorkspaceTabIds state & actions to workspaceStore.ts**
  - Add `openWorkspaceTabIds: string[]` to `WorkspaceState`.
  - Add `closeWorkspaceTab(id: string)` and `openWorkspaceTab(id: string)` actions.

- [ ] **Step 2: Update top bar Level 1 tabs rendering & hover close button in App.tsx**
  - Render Level 1 project tab tags filtered by `openWorkspaceTabIds`.
  - Add a hover-triggered `'x'` close button (`<X size={10} />`) to each project tab tag.
  - When closing an active project tab tag, switch `activeFatherTabId` to an adjacent open workspace tab.

- [ ] **Step 3: Ensure left panel project selection opens top bar tab in App.tsx**
  - When a project is selected in the left panel or added, call `openWorkspaceTab(id)`.

- [ ] **Step 4: Run tests and frontend build**
  Run: `npm test && npm run build`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/store/workspaceStore.ts src/App.tsx && git commit -m "feat: support closing project tab tags from top bar with hover close button"`

---

## Task 2: Robust Code Agent Identification & Auto-Healing Session Resume

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Implement extract_agent_kind helper in main.rs**
  Match command path, wrapper scripts, and arguments to extract agent types (`claude`, `agy`, `opencode`, `pi`, `omp`, `codex`, `gemini`, `aider`).

- [ ] **Step 2: Update spawn_session and resume_terminated_session to use extract_agent_kind**
  Use `extract_agent_kind` in `spawn_session`, `resume_terminated_session`, and argument builders.

- [ ] **Step 3: Add auto-healing for missing remote_session_id in resume_terminated_session**
  If `remote_session_id` is missing/empty during auto-resume, auto-generate a fresh UUID, save to SQLite `sessions.remote_session_id`, and launch with new session arguments.

- [ ] **Step 4: Run cargo test & npm test**
  Run: `cd src-tauri && cargo test && cd .. && npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src-tauri/src/main.rs && git commit -m "fix: robust agent classification and auto-healing remote session ID resume"`
