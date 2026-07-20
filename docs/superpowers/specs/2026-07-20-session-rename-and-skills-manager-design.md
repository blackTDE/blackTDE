# Session Name Editing and Skills Management Design Spec

## Context

TDE (Terminal Development Environment) is a visual, multi-agent workspace desktop application. User feedback requires two key enhancements:

1. **Session Name Editing**: Users need the ability to edit the displayed names of active and past sessions so they can organize multiple agent shells by task (e.g. "Refactoring Backend", "Fixing CI", "Database Migration") instead of relying on default titles like "Claude Code" or "Shell".
2. **Skills Manager**: Users need a centralized feature to manage AI coding agent skills across supported agents (Antigravity/Gemini CLI, Claude Code, Codex CLI, Aider, and local project workspace). The skills manager should support discovering, cloning from Git, copying, moving, deleting, and editing skills directories across agent skills locations.

---

## Part 1: Session Displayed Name Editing

### Database Schema Migration
A new migration `src-tauri/migrations/20260721000000_session_name.sql` adds a `name` column to the `sessions` table:

```sql
-- Add name column to sessions table for customizable session labels
ALTER TABLE sessions ADD COLUMN name TEXT;
```

### Rust Backend IPC Commands (`src-tauri/src/main.rs`)
1. **Update `spawn_pty_process`**:
   Accepts an optional `name: Option<String>` parameter in `SpawnProcessRequest`. If omitted, defaults to null in database and falls back to default agent/shell title in UI.
2. **New IPC Command `update_session_name`**:
   ```rust
   #[tauri::command]
   async fn update_session_name(
       id: String,
       name: String,
       pool: State<'_, SqlitePool>,
   ) -> Result<(), String>
   ```
   Executes `UPDATE sessions SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`.
3. **Update `list_past_sessions`**:
   Returns the `name` column in `PastSession` struct:
   ```rust
   pub struct PastSession {
       pub id: String,
       pub name: Option<String>,
       pub agent_type: String,
       pub cwd: String,
       pub remote_session_id: Option<String>,
       pub status: String,
       pub provider: Option<String>,
       pub model: Option<String>,
       pub created_at: String,
       pub ssh_host: Option<String>,
   }
   ```

### Frontend State Management (`src/store/workspaceStore.ts`)
1. **Update `SessionInfo`**:
   ```typescript
   export interface SessionInfo {
     id: string;
     name?: string;
     agentType: string;
     cwd: string;
     provider: string;
     cmd: string;
     args: string[];
     ssh_host?: string;
   }
   ```
2. **Store Actions**:
   - `updateSessionName: (id: string, name: string) => Promise<void>`:
     Updates Zustand state locally and invokes Tauri `update_session_name`.

### UI Integration
1. **Sidebar Project-Session Tree (`src/components/FileTree.tsx`)**:
   - Displays `session.name || formatAgentTitle(...)`.
   - Hovering over a session row shows an Edit / Pencil button. Double-clicking or clicking the pencil activates inline editing mode with an `<input>` field.
   - Pressing Enter or clicking outside saves the new name. Pressing ESC cancels.
2. **Terminal Header & Grid (`src/components/TerminalPane.tsx`, `src/components/TerminalGrid.tsx`)**:
   - Displays custom session name in the header pill/title bar.
   - Interactive double-click or inline edit button on title allows renaming directly from the terminal pane.

---

## Part 2: Skills Manager Feature

### Concept & Supported Agents
AI coding agents store reusable instructions, workflows, and prompts as "skills" inside designated folders containing a `SKILL.md` file.

Supported Agent Skill Directories:
* **Gemini / Antigravity**:
  * Global: `~/.gemini/skills`
  * Workspace: `<workspace_path>/.gemini/skills`
* **Claude Code**:
  * Global: `~/.claude/skills`
  * Workspace: `<workspace_path>/.claude/skills`
* **Codex CLI**:
  * Global: `~/.codex/skills` (or `~/.config/codex/skills`)
  * Workspace: `<workspace_path>/.codex/skills`
* **Aider**:
  * Global: `~/.aider/skills`
  * Workspace: `<workspace_path>/.aider/skills`
* **Custom Agent**:
  * Any user-specified skills directory path.

### Backend Module (`src-tauri/src/skills_manager.rs`)
A dedicated Rust module handles all skill file and directory manipulations safely:

1. **Struct Definitions**:
   ```rust
   #[derive(Debug, Serialize, Deserialize, Clone)]
   pub struct SkillItem {
       pub id: String,
       pub name: String,
       pub agent_type: String, // "gemini", "claude", "codex", "aider", "custom"
       pub scope: String,      // "global", "workspace"
       pub path: String,       // Absolute directory path
       pub description: Option<String>,
       pub has_skill_md: bool,
       pub file_count: usize,
       pub size_bytes: u64,
   }
   ```

2. **IPC Commands**:
   * `list_agent_skills(workspace_path: Option<String>) -> Result<Vec<SkillItem>, String>`
     Scans all global agent skill directories and the active workspace skill directories. Parses `SKILL.md` frontmatter/content to extract title/description.
   * `clone_skill(git_url: String, target_agent: String, scope: String, workspace_path: Option<String>, new_name: Option<String>) -> Result<SkillItem, String>`
     Clones a remote git repository into the specified agent skills directory.
   * `copy_skill(source_path: String, target_agent: String, scope: String, workspace_path: Option<String>, new_name: Option<String>) -> Result<SkillItem, String>`
     Recursively copies a skill directory to the target agent skills directory.
   * `move_skill(source_path: String, target_agent: String, scope: String, workspace_path: Option<String>, new_name: Option<String>) -> Result<SkillItem, String>`
     Moves a skill directory to the target agent skills directory.
   * `delete_skill(path: String) -> Result<(), String>`
     Validates that `path` is within an authorized agent skills directory before performing recursive deletion.
   * `create_skill(agent_type: String, scope: String, workspace_path: Option<String>, name: String, description: String) -> Result<SkillItem, String>`
     Creates directory and initializes a template `SKILL.md`.
   * `read_skill_file(skill_path: String, relative_file: String) -> Result<String, String>`
     Reads file content (such as `SKILL.md`) inside a skill directory.
   * `save_skill_file(skill_path: String, relative_file: String, content: String) -> Result<(), String>`
     Saves updated file content.

### Frontend UI Component (`src/components/SkillsPanel.tsx`)
1. **Access**:
   - Added `'skills'` tab to `activeRightPanel` in `workspaceStore.ts`.
   - Right toolbar icon (Brain / Sparkles icon) opens Skills Panel in sidebar.
   - Also accessible as an overlay modal via top action button.
2. **Features & Layout**:
   - Filter Tabs: `All`, `Gemini`, `Claude`, `Codex`, `Aider`, `Workspace`.
   - Search bar filtering skills by name or description.
   - Action Bar:
     - 📥 **Clone Skill**: Git URL modal dialog.
     - ➕ **Create Skill**: Modal dialog specifying name, agent, scope, and description.
   - Skill Cards list:
     - Title, agent badge, scope tag (`Global` vs `Workspace`).
     - Description preview parsed from `SKILL.md`.
     - Action Buttons:
       - 📋 **Copy to...**: Modal to pick target agent and scope.
       - 📦 **Move to...**: Modal to pick target agent and scope.
       - 👁️ **Edit SKILL.md**: Opens embedded Monaco editor or content viewer.
       - 🗑️ **Delete**: Confirmation modal.

---

## Verification Strategy

### Automated Tests
1. **Rust Tests (`src-tauri/src/skills_manager.rs`)**:
   - Test scanning skill directories and parsing `SKILL.md`.
   - Test copying, moving, and deleting skills between temporary directories.
   - Test updating session names in SQLite database.
2. **TypeScript Tests (`tests/skillsManager.test.ts`, `tests/sessionName.test.ts`)**:
   - Test session name state updates in Zustand store.
   - Test filtering and agent directory resolution helpers.

### Manual Verification & Desktop Build
- Launch app (`npm run dev` / `cargo test`).
- Test renaming sessions in sidebar and terminal header.
- Test listing, creating, cloning, copying, moving, and deleting skills in Skills Panel.
