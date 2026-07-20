# Plugin Skills Discovery and Uniform Skills Vault Design Spec

## Context

TDE's Skills Manager needs two critical enhancements requested by users:

1. **Plugin Skills Discovery**: Coding agents like Claude Code, Codex CLI, and Gemini/Antigravity install skills via plugins into plugin subdirectories (e.g. `~/.gemini/config/plugins/*/skills/*`, `~/.claude/plugins/*/skills/*`, `~/.codex/plugins/*/skills/*`). These skills were previously not detected in the skills list.
2. **Uniform Skills Vault (`~/.tde/skills_vault`)**:
   - Instead of permanently deleting a skill when the user clicks Delete, TDE moves (`mv`) the skill directory from the agent's skills folder into a central Uniform Skills Vault (`~/.tde/skills_vault/`).
   - The Skills Manager UI will feature a dedicated **Vault** tab/filter showing all archived skills in `~/.tde/skills_vault`.
   - From the Vault, users can view skill details, install/restore any vaulted skill to any coding agent (Gemini, Claude, Codex, Aider, or active workspace), or perform a permanent delete from disk.

---

## Architecture & Implementation Plan

### Part 1: Plugin Skills Scanning in Rust (`src-tauri/src/skills_manager.rs`)

1. **Vault Directory Resolution**:
   - Vault Path: `~/.tde/skills_vault`
   - Automatic directory creation when initialized or when moving skills.

2. **Expanded Agent Skills Discovery Paths**:
   - **Gemini / Antigravity**:
     - Global Skills: `~/.gemini/skills/*`
     - Builtin Skills: `~/.gemini/antigravity-cli/builtin/skills/*`
     - Plugin Skills: `~/.gemini/config/plugins/*/skills/*`
     - Workspace Skills: `<workspace>/.gemini/skills/*`
   - **Claude Code**:
     - Global Skills: `~/.claude/skills/*`
     - Plugin Skills: `~/.claude/plugins/*/skills/*`, `~/.claude/plugins/*` (if directory contains `SKILL.md`), `~/.config/claude/plugins/*/skills/*`
     - Workspace Skills: `<workspace>/.claude/skills/*`
   - **Codex CLI**:
     - Global Skills: `~/.codex/skills/*`
     - Plugin Skills: `~/.codex/plugins/*/skills/*`, `~/.config/codex/plugins/*/skills/*`
     - Workspace Skills: `<workspace>/.codex/skills/*`
   - **Aider**:
     - Global Skills: `~/.aider/skills/*`
     - Workspace Skills: `<workspace>/.aider/skills/*`
   - **Vault**:
     - Vault Skills: `~/.tde/skills_vault/*`

3. **`SkillItem` Struct Field Extensions**:
   ```rust
   #[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
   pub struct SkillItem {
       pub id: String,
       pub name: String,
       pub agent_type: String, // "gemini", "claude", "codex", "aider", "vault", "custom"
       pub scope: String,      // "global", "workspace", "plugin", "vault"
       pub path: String,       // Absolute directory path
       pub plugin_name: Option<String>, // Name of plugin if scope == "plugin"
       pub description: Option<String>,
       pub has_skill_md: bool,
       pub file_count: usize,
       pub size_bytes: u64,
   }
   ```

4. **Updated `delete_skill` IPC Command**:
   ```rust
   #[tauri::command]
   pub async fn delete_skill(
       path: String,
       permanent: bool,
   ) -> Result<(), String>
   ```
   - If `permanent == false`: Moves (`mv`) skill directory to `~/.tde/skills_vault/<folder_name>`. If a folder with the same name exists in vault, appends timestamp suffix `_<timestamp>`.
   - If `permanent == true`: Permanently removes directory from disk using `fs::remove_dir_all`.

5. **New `install_from_vault` IPC Command**:
   ```rust
   #[tauri::command]
   pub async fn install_from_vault(
       vault_path: String,
       target_agent: String,
       scope: String,
       workspace_path: Option<String>,
       new_name: Option<String>,
       move_from_vault: bool, // true = move, false = copy/keep in vault
   ) -> Result<SkillItem, String>
   ```

---

### Part 2: Frontend UI Updates (`src/components/SkillsPanel.tsx`)

1. **Filter Tabs**:
   Add `Vault` tab to filter pills: `[All, Gemini, Claude, Codex, Aider, Workspace, Plugins, Vault]`.
2. **Skill Card Badges**:
   - Display `Plugin: <name>` badge for plugin-based skills.
   - Display `Vault` badge for archived skills.
3. **Card Actions for Plugin Skills**:
   - Plugin skills are read-only in their source directory; users can Copy or Save to Vault.
4. **Card Actions for Vaulted Skills**:
   - ⚡ **Install to Agent**: Opens modal selecting target agent & target scope.
   - 👁️ **View/Edit**: View SKILL.md.
   - 🗑️ **Permanently Delete**: Delete permanently from disk.
5. **Delete Modal Update**:
   - Deleting an active agent skill presents option: **Move to Vault (Soft Delete)** [Default] vs **Delete Permanently**.

---

## Verification Strategy

### Automated Tests
1. **Rust Tests (`src-tauri/src/skills_manager.rs`)**:
   - Test scanning plugin directories for Gemini, Claude, and Codex plugins.
   - Test moving skill to vault on soft delete.
   - Test installing from vault to target agent skills directory.
2. **TypeScript Tests (`tests/skillsManager.test.ts`)**:
   - Test filtering by `plugin` and `vault` scope tabs.

### End-to-End Build & Run
- `npm run test`
- `npm run build`
- `cargo test`
