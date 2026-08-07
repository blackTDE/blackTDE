# Design Specification: Top-Bar Project Tab Tag Closing & Code Agent Session Save/Resume Audit

## 1. Top-Bar Project Tab Tag Closing Feature

### Intent
Allow users to close/remove project tab tags from the Level 1 top tab bar without deleting the project from the local database or the left project list pane.

### Architecture & Requirements
- **State Management (`src/store/workspaceStore.ts`)**:
  - Add `openWorkspaceTabIds: string[]` to `WorkspaceState` (persisted in Zustand).
  - Add actions:
    - `closeWorkspaceTab: (id: string) => void`
    - `openWorkspaceTab: (id: string) => void`
    - `setOpenWorkspaceTabIds: (ids: string[]) => void`
  - When workspaces are fetched/loaded, initialize `openWorkspaceTabIds` with all workspace IDs if `openWorkspaceTabIds` is empty.
- **Top Tab Bar UI (`src/App.tsx`)**:
  - Filter Level 1 project tab tags to render only workspaces whose `id` exists in `openWorkspaceTabIds`.
  - Add a hover-triggered `'x'` close button (`<X size={10} />`) to each project tab tag in the Level 1 header.
  - When clicking `'x'`:
    - Call `closeWorkspaceTab(ws.id)`.
    - If `activeFatherTabId === ws.id`, switch active workspace to an adjacent open project tab (or empty state if none remain).
- **Left Panel Project List (`src/App.tsx` & `src/components/FileTree.tsx`)**:
  - Clicking any workspace in the left panel project list triggers `openWorkspaceTab(ws.id)` and sets `activeFatherTabId = ws.id`, ensuring its tab tag appears in the top tab bar.

---

## 2. Code Agent Session Save & Resume Logic Audit & Auto-Recovery

### Audit Summary of TDE Session Lifecycle
1. **Creation**:
   - `spawn_session` creates a local PTY session ID (`session_<random>`).
   - If starting fresh, generates a unique UUID (`new_uuid`) and sets `--conversation <uuid>` (`agy`), `--session-id <uuid>` (`claude`), or `--session <uuid>` (`opencode`/`pi`/`omp`).
   - Inserts session into SQLite `sessions` table.
2. **Persistence**:
   - Streamed PTY output is recorded to `transcripts` table in SQLite.
   - PTY stdout scanner updates `remote_session_id` in SQLite if an explicit conversation ID is printed by the CLI.
3. **Resumption**:
   - `resume_terminated_session` queries SQLite for session details and passes `--resume <remote_id>`, `--conversation <remote_id>`, or `--session <remote_id>` when re-launching the CLI.

### Identified Root Causes of Lost / Empty Sessions
1. **Command Line Matching Failure (`clean_cmd` Mismatch)**:
   - When commands were executed with absolute paths (`/usr/local/bin/claude`), flags (`claude --dangerously-skip-permissions`), or runner wrappers (`npx agy`), string matching failed to classify the agent type, leaving `initial_remote_id` as `NULL`.
2. **Hard Error on Missing `remote_session_id`**:
   - In `resume_terminated_session`, if `remote_session_id` was `NULL` or empty, `resume_args_for_session` returned an error, failing the resume operation instead of recovering.
3. **Deduplication Overwrites (`dedupeSessions`)**:
   - `dedupeSessions` grouped sessions by `${cwd}\0${agent_type}\0${remoteId}`. Duplicate NULL entries collapsed onto the first row.

### Auto-Recovery Fixes
- **Robust Agent Identification (`extract_agent_kind`)**:
  - Parse the executable name and command line to identify `claude`, `agy`, `opencode`, `pi`, `omp`, `oh-my-pi`, `codex`, `gemini`, `aider` regardless of leading path or trailing flags.
- **Auto-Healing Resume (`resume_terminated_session`)**:
  - If a resumable session has `remote_session_id = NULL` or empty string upon auto-resume, auto-generate a fresh UUID, save it to SQLite `sessions.remote_session_id`, and launch with new session arguments (`--conversation <uuid>` / `--session <uuid>`), guaranteeing 100% session launch success without losing sessions.
