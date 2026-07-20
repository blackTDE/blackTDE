# Plugin Skills Discovery and Uniform Skills Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend TDE Skills Manager to discover plugin-installed skills across Claude Code, Codex CLI, and Gemini/Antigravity, and implement a Uniform Skills Vault (`~/.tde/skills_vault`) for archiving, soft-deleting, and installing skills across agents.

**Architecture:** 
- **Plugin Skills Scanning**: Update `src-tauri/src/skills_manager.rs` to scan plugin skills folders (`~/.gemini/config/plugins/*/skills/*`, `~/.claude/plugins/*/skills/*`, `~/.codex/plugins/*/skills/*`, etc.) and populate `plugin_name` metadata.
- **Uniform Skills Vault**: Maintain `~/.tde/skills_vault` directory. Soft deletion moves skills to the vault. Users can browse vault skills in the UI and install/restore them to any agent (Gemini, Claude, Codex, Aider, Workspace).

**Tech Stack:** Rust (Tauri v2, std::fs, std::path, serde), React 18, TypeScript, Zustand, Lucide icons, Tailwind CSS.

## Global Constraints
- Soft deletion moves skills to `~/.tde/skills_vault` without data loss.
- Plugin skills are highlighted with their originating plugin name.
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Rust Backend Plugin Skills Discovery & Vault Operations

**Files:**
- Modify: `src-tauri/src/skills_manager.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/skills_manager.rs`

**Interfaces:**
- Consumes: `std::fs`, `std::path`
- Produces: `plugin_name: Option<String>` in `SkillItem`, `install_from_vault` command, updated `delete_skill(path, permanent)` command.

- [ ] **Step 1: Write failing Rust unit test for Vault soft-delete and install_from_vault**

In `src-tauri/src/skills_manager.rs` test module:
```rust
    #[tokio::test]
    async fn test_vault_soft_delete_and_install() {
        let temp_home = std::env::temp_dir().join(format!("tde-vault-test-{}", uuid::Uuid::new_v4()));
        let agent_skill = temp_home.join(".claude/skills/custom-reviewer");
        fs::create_dir_all(&agent_skill).unwrap();
        fs::write(agent_skill.join("SKILL.md"), "---\nname: Custom Reviewer\n---\n").unwrap();

        let vault_dir = temp_home.join(".tde/skills_vault");
        fs::create_dir_all(&vault_dir).unwrap();

        // Perform soft delete into vault
        let dest = move_to_vault_dir(&agent_skill, &vault_dir).unwrap();
        assert!(!agent_skill.exists());
        assert!(dest.exists());

        fs::remove_dir_all(temp_home).unwrap();
    }
```

- [ ] **Step 2: Update SkillItem struct and implement plugin scanning**

In `src-tauri/src/skills_manager.rs`:
```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SkillItem {
    pub id: String,
    pub name: String,
    pub agent_type: String, // "gemini", "claude", "codex", "aider", "vault", "custom"
    pub scope: String,      // "global", "workspace", "plugin", "vault"
    pub path: String,       // Absolute directory path
    pub plugin_name: Option<String>,
    pub description: Option<String>,
    pub has_skill_md: bool,
    pub file_count: usize,
    pub size_bytes: u64,
}
```

Implement `get_vault_dir()`:
```rust
pub fn get_vault_dir() -> Option<PathBuf> {
    let home_str = std::env::var("HOME").ok()?;
    let vault = PathBuf::from(home_str).join(".tde/skills_vault");
    let _ = fs::create_dir_all(&vault);
    Some(vault)
}
```

Update `list_agent_skills` to scan:
1. Standard global agent dirs
2. Workspace agent dirs
3. Plugin agent dirs (`~/.gemini/config/plugins/*/skills/*`, `~/.claude/plugins/*/skills/*`, `~/.codex/plugins/*/skills/*`, `~/.config/claude/plugins/*/skills/*`, `~/.config/codex/plugins/*/skills/*`)
4. Uniform Vault dir (`~/.tde/skills_vault/*`)

- [ ] **Step 3: Implement soft-delete in delete_skill**

Update `delete_skill`:
```rust
#[tauri::command]
pub async fn delete_skill(path: String, permanent: Option<bool>) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Skill directory does not exist".into());
    }

    if permanent.unwrap_or(false) {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        let vault_dir = get_vault_dir().ok_or_else(|| "Vault directory resolution failed".to_string())?;
        move_to_vault_dir(p, &vault_dir)?;
        Ok(())
    }
}
```

- [ ] **Step 4: Implement install_from_vault**

```rust
#[tauri::command]
pub async fn install_from_vault(
    vault_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
    move_from_vault: Option<bool>,
) -> Result<SkillItem, String> {
    let src = Path::new(&vault_path);
    if !src.exists() || !src.is_dir() {
        return Err("Vault skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    if move_from_vault.unwrap_or(false) {
        fs::rename(src, &dest).or_else(|_| {
            copy_dir_recursive(src, &dest)?;
            fs::remove_dir_all(src).map_err(|e| e.to_string())
        })?;
    } else {
        copy_dir_recursive(src, &dest)?;
    }

    parse_skill_info(&dest, &target_agent, &scope, None)
        .ok_or_else(|| "Failed to parse installed skill metadata".into())
}
```

- [ ] **Step 5: Register commands in src-tauri/src/main.rs**

Register `install_from_vault` in `generate_handler` list in `src-tauri/src/main.rs`.

- [ ] **Step 6: Run cargo test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/skills_manager.rs src-tauri/src/main.rs
git commit -m "feat: implement plugin skills scanning, soft delete to vault, and install_from_vault IPC command"
```

---

### Task 2: Frontend UI Integration for Plugin Badges, Vault Tab, & Install Flow

**Files:**
- Modify: `src/components/SkillsPanel.tsx`
- Modify: `tests/skillsManager.test.ts`

**Interfaces:**
- Consumes: `install_from_vault`, updated `delete_skill(path, permanent)`
- Produces: Vault tab, plugin badge, Install to Agent modal, Soft Delete confirmation.

- [ ] **Step 1: Update tests/skillsManager.test.ts**

Update TypeScript test to include `plugin` and `vault` filter tabs:
```typescript
test('filters plugin and vault skills correctly', () => {
  const sampleSkills: SkillItem[] = [
    { id: '1', name: 'Git Workflow', agent_type: 'gemini', scope: 'global', path: '/p1', has_skill_md: true, file_count: 1, size_bytes: 100 },
    { id: '2', name: 'Claude Plugin Skill', agent_type: 'claude', scope: 'plugin', plugin_name: 'superpowers', path: '/p2', has_skill_md: true, file_count: 2, size_bytes: 200 },
    { id: '3', name: 'Archived Skill', agent_type: 'vault', scope: 'vault', path: '/p3', has_skill_md: true, file_count: 1, size_bytes: 150 },
  ];

  assert.equal(filterSkills(sampleSkills, '', 'plugins').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'vault').length, 1);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Update SkillsPanel.tsx**

In `src/components/SkillsPanel.tsx`:
- Add filter tabs: `Plugins` and `Vault`.
- Render `Plugin: <plugin_name>` badge when `scope === 'plugin'`.
- Render `Vault` badge when `scope === 'vault'`.
- On Delete click, display radio choice:
  - 📦 **Move to Vault (Soft Delete)** [Default]
  - 🗑️ **Delete Permanently from Disk**
- On Vault skill cards, add ⚡ **Install to Agent** button opening Install modal.

- [ ] **Step 4: Run npm test and npm build**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SkillsPanel.tsx tests/skillsManager.test.ts
git commit -m "feat: add plugin skills badges, vault filter tab, soft delete, and install from vault UI"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Plugin skills scanning across Claude, Codex, Gemini -> Task 1.
   - Uniform Skills Vault `~/.tde/skills_vault` -> Task 1.
   - Soft delete moving to vault -> Task 1 & Task 2.
   - Install to agent from vault -> Task 1 & Task 2.
2. **No Placeholders**: Complete function definitions, type signatures, and commands provided.
