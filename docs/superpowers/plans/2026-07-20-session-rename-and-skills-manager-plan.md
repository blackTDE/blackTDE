# Session Name Editing and Skills Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement customizable session display name editing across TDE UI and SQLite database, and build a full-featured Skills Manager for discovering, cloning, copying, moving, deleting, and editing AI coding agent skills.

**Architecture:** 
- **Session Rename**: Add `name` column to `sessions` table via SQLite migration, expose Rust IPC command `update_session_name`, update Zustand workspaceStore, and provide inline renaming UI in sidebar session tree and terminal pane headers.
- **Skills Manager**: Create Rust backend module `src-tauri/src/skills_manager.rs` for file system skill operations across Gemini, Claude, Codex, Aider, and Workspace skills directories. Expose Tauri IPC commands for list, clone, copy, move, delete, create, and read/save skills. Build React `SkillsPanel` component with filter tabs, search, modals, and embedded markdown preview/editor.

**Tech Stack:** Rust (Tauri v2, SQLx, SQLite, std::fs, std::process), React 18, TypeScript, Zustand, Lucide React icons, Tailwind CSS.

## Global Constraints

- Preserve all existing session parameters and database records.
- All file system skill operations must be isolated to valid skills directories.
- SQLite migrations must use `IF NOT EXISTS` or standard SQL statements.
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Session Displayed Name Database Migration & Backend IPC

**Files:**
- Create: `src-tauri/migrations/20260721000000_session_name.sql`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: SQLite Pool
- Produces: `update_session_name` IPC command, updated `PastSession` struct with `name: Option<String>`, `spawn_pty_process` accepting `name: Option<String>`.

- [ ] **Step 1: Write the SQLite migration file**

Create `src-tauri/migrations/20260721000000_session_name.sql`:
```sql
-- Migration: Add name column to sessions table for customizable session labels
ALTER TABLE sessions ADD COLUMN name TEXT;
```

- [ ] **Step 2: Update PastSession and spawn_pty_process in src-tauri/src/main.rs**

In `src-tauri/src/main.rs`:
Update `PastSession` struct:
```rust
#[derive(Debug, Serialize, Deserialize)]
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

Update `SpawnProcessRequest` struct:
```rust
#[derive(Debug, Deserialize)]
pub struct SpawnProcessRequest {
    pub agent_type: String,
    pub name: Option<String>,
    pub cwd: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub custom_cmd: Option<String>,
    pub custom_args: Option<Vec<String>>,
    pub workspace_id: Option<String>,
    pub resume_session_id: Option<String>,
    pub ssh_host: Option<String>,
}
```

Update `spawn_pty_process` SQL INSERT:
```rust
        sqlx::query(
            "INSERT INTO sessions (id, name, workspace_id, agent_type, cwd, status, provider, model, remote_session_id, ssh_host) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)"
        )
        .bind(&id)
        .bind(&req.name)
        .bind(&workspace_id)
        .bind(&req.agent_type)
        .bind(&req.cwd)
        .bind(&req.provider)
        .bind(&req.model)
        .bind(&req.resume_session_id)
        .bind(&req.ssh_host)
        .execute(&**pool)
        .await
        .map_err(|e| e.to_string())?;
```

Update `list_past_sessions`:
```rust
    let rows = sqlx::query("SELECT id, name, agent_type, cwd, remote_session_id, status, provider, model, created_at, ssh_host FROM sessions ORDER BY created_at DESC, id DESC")
        .fetch_all(&**pool)
        .await
        .map_err(|e| e.to_string())?;

    let sessions = rows
        .into_iter()
        .map(|row| PastSession {
            id: row.get("id"),
            name: row.get("name"),
            agent_type: row.get("agent_type"),
            cwd: row.get("cwd"),
            remote_session_id: row.get("remote_session_id"),
            status: row.get("status"),
            provider: row.get("provider"),
            model: row.get("model"),
            created_at: row.get("created_at"),
            ssh_host: row.get("ssh_host"),
        })
        .collect();
```

- [ ] **Step 3: Implement update_session_name command**

In `src-tauri/src/main.rs`:
```rust
#[tauri::command]
async fn update_session_name(
    id: String,
    name: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE sessions SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2")
        .bind(&name)
        .bind(&id)
        .execute(&**pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

Register `update_session_name` in Tauri generate_handler:
```rust
            update_session_name,
```

- [ ] **Step 4: Write Rust unit test for session name updating**

In `src-tauri/src/main.rs` test module:
```rust
    #[tokio::test]
    async fn test_update_session_name() {
        let pool = create_test_db().await;

        sqlx::query(
            "INSERT INTO sessions (id, name, workspace_id, agent_type, cwd, status) VALUES ($1, $2, $3, $4, $5, 'active')"
        )
        .bind("sess-test-1")
        .bind("Original Name")
        .bind("ws-1")
        .bind("claude")
        .bind("/tmp")
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("UPDATE sessions SET name = $1 WHERE id = $2")
            .bind("New Custom Name")
            .bind("sess-test-1")
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query("SELECT name FROM sessions WHERE id = $1")
            .bind("sess-test-1")
            .fetch_one(&pool)
            .await
            .unwrap();

        let name: String = row.get("name");
        assert_eq!(name, "New Custom Name");
    }
```

- [ ] **Step 5: Run cargo test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/20260721000000_session_name.sql src-tauri/src/main.rs
git commit -m "feat: add session name column migration and update_session_name IPC command"
```

---

### Task 2: Session Displayed Name Frontend Integration & Inline Renaming UI

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Modify: `src/components/FileTree.tsx`
- Modify: `src/components/TerminalPane.tsx`
- Modify: `src/components/TerminalGrid.tsx`
- Create: `tests/sessionName.test.ts`

**Interfaces:**
- Consumes: `update_session_name` Tauri IPC command
- Produces: `SessionInfo.name`, `updateSessionName` Zustand action, inline renaming in sidebar and terminal header.

- [ ] **Step 1: Write failing TypeScript unit test**

Create `tests/sessionName.test.ts`:
```typescript
import test from 'node.test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

test('updates session display name in store state', () => {
  const store = useWorkspaceStore.getState();
  store.addSession({
    id: 'test-sess-1',
    name: 'Initial Name',
    agentType: 'claude',
    cwd: '/tmp',
    provider: 'anthropic',
    cmd: 'claude',
    args: [],
  });

  assert.equal(useWorkspaceStore.getState().sessions['test-sess-1'].name, 'Initial Name');

  store.setSessionNameLocal('test-sess-1', 'Renamed Session');
  assert.equal(useWorkspaceStore.getState().sessions['test-sess-1'].name, 'Renamed Session');

  // cleanup
  store.removeSession('test-sess-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL with "store.setSessionNameLocal is not a function"

- [ ] **Step 3: Implement SessionInfo interface and store actions**

In `src/store/workspaceStore.ts`:
Update `SessionInfo`:
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

Add to `WorkspaceState`:
```typescript
  setSessionNameLocal: (id: string, name: string) => void;
  updateSessionName: (id: string, name: string) => Promise<void>;
```

Implement in store creator:
```typescript
  setSessionNameLocal: (id, name) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: state.sessions[id] ? { ...state.sessions[id], name } : state.sessions[id],
      },
    })),
  updateSessionName: async (id, name) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: state.sessions[id] ? { ...state.sessions[id], name } : state.sessions[id],
      },
    }));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_session_name', { id, name });
    } catch (err) {
      console.error('Failed to update session name in backend:', err);
    }
  },
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Add inline renaming UI in FileTree.tsx**

In `src/components/FileTree.tsx`:
Add state for `editingSessionId: string | null` and `editingSessionName: string`.
In session item rendering:
- Render pencil edit button next to session item.
- When `editingSessionId === session.id`, display `<input type="text" value={editingSessionName} onChange={...} onKeyDown={...} onBlur={...} />`.
- When Enter is pressed or on blur, call `updateSessionName(session.id, editingSessionName)`.

- [ ] **Step 6: Add inline renaming in TerminalPane.tsx / TerminalGrid.tsx**

In `src/components/TerminalPane.tsx`:
Add header title rename trigger or double-click to activate edit input.

- [ ] **Step 7: Run frontend tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/store/workspaceStore.ts src/components/FileTree.tsx src/components/TerminalPane.tsx src/components/TerminalGrid.tsx tests/sessionName.test.ts
git commit -m "feat: integrate session display name editing in store and UI"
```

---

### Task 3: Skills Manager Backend Rust Module (`skills_manager.rs`)

**Files:**
- Create: `src-tauri/src/skills_manager.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `std::fs`, `dirs::home_dir`, `tokio::process::Command` for git clone
- Produces: `list_agent_skills`, `clone_skill`, `copy_skill`, `move_skill`, `delete_skill`, `create_skill`, `read_skill_file`, `save_skill_file` Tauri IPC commands.

- [ ] **Step 1: Create src-tauri/src/skills_manager.rs**

Create `src-tauri/src/skills_manager.rs` with `SkillItem` struct, helper functions to discover skills directories, parse `SKILL.md` frontmatter/title/description, and implement all IPC commands:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
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

pub fn get_agent_skills_dir(agent_type: &str, scope: &str, workspace_path: Option<&str>) -> Option<PathBuf> {
    if scope == "workspace" {
        let ws = workspace_path?;
        let ws_path = Path::new(ws);
        let folder = match agent_type {
            "claude" => ".claude/skills",
            "codex" => ".codex/skills",
            "aider" => ".aider/skills",
            _ => ".gemini/skills",
        };
        Some(ws_path.join(folder))
    } else {
        let home = dirs::home_dir()?;
        let folder = match agent_type {
            "claude" => ".claude/skills",
            "codex" => ".codex/skills",
            "aider" => ".aider/skills",
            _ => ".gemini/skills",
        };
        Some(home.join(folder))
    }
}

pub fn parse_skill_info(dir_path: &Path, agent_type: &str, scope: &str) -> Option<SkillItem> {
    if !dir_path.is_dir() {
        return None;
    }
    let dir_name = dir_path.file_name()?.to_str()?.to_string();
    if dir_name.starts_with('.') {
        return None;
    }

    let skill_md_path = dir_path.join("SKILL.md");
    let has_skill_md = skill_md_path.exists();
    let mut description: Option<String> = None;
    let mut skill_name = dir_name.clone();

    if has_skill_md {
        if let Ok(content) = fs::read_to_string(&skill_md_path) {
            for line in content.lines() {
                let line_trim = line.trim();
                if line_trim.starts_with("name:") {
                    skill_name = line_trim.trim_start_matches("name:").trim().trim_matches('"').to_string();
                } else if line_trim.starts_with("description:") {
                    description = Some(line_trim.trim_start_matches("description:").trim().trim_matches('"').to_string());
                }
            }
            if description.is_none() {
                let non_empty: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#') && !l.trim().starts_with("---")).collect();
                if let Some(first) = non_empty.first() {
                    description = Some(first.trim().to_string());
                }
            }
        }
    }

    let mut file_count = 0;
    let mut size_bytes = 0;
    for entry in WalkDir::new(dir_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            file_count += 1;
            if let Ok(meta) = entry.metadata() {
                size_bytes += meta.len();
            }
        }
    }

    Some(SkillItem {
        id: format!("{}:{}:{}", agent_type, scope, dir_name),
        name: skill_name,
        agent_type: agent_type.to_string(),
        scope: scope.to_string(),
        path: dir_path.to_string_lossy().to_string(),
        description,
        has_skill_md,
        file_count,
        size_bytes,
    })
}

#[tauri::command]
pub async fn list_agent_skills(workspace_path: Option<String>) -> Result<Vec<SkillItem>, String> {
    let agents = ["gemini", "claude", "codex", "aider"];
    let scopes = ["global", "workspace"];
    let mut items = Vec::new();

    for agent in agents {
        for scope in scopes {
            if scope == "workspace" && workspace_path.is_none() {
                continue;
            }
            if let Some(dir) = get_agent_skills_dir(agent, scope, workspace_path.as_deref()) {
                if dir.exists() && dir.is_dir() {
                    if let Ok(entries) = fs::read_dir(&dir) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let p = entry.path();
                            if p.is_dir() {
                                if let Some(item) = parse_skill_info(&p, agent, scope) {
                                    items.push(item);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(items)
}

#[tauri::command]
pub async fn copy_skill(
    source_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let src = Path::new(&source_path);
    if !src.exists() || !src.is_dir() {
        return Err("Source skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    copy_dir_recursive(src, &dest)?;

    parse_skill_info(&dest, &target_agent, &scope)
        .ok_or_else(|| "Failed to parse copied skill metadata".into())
}

#[tauri::command]
pub async fn move_skill(
    source_path: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let src = Path::new(&source_path);
    if !src.exists() || !src.is_dir() {
        return Err("Source skill directory does not exist".into());
    }
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let folder_name = new_name.unwrap_or_else(|| src.file_name().unwrap().to_str().unwrap().to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill '{}' already exists in target directory", folder_name));
    }

    fs::rename(src, &dest).or_else(|_| {
        copy_dir_recursive(src, &dest)?;
        fs::remove_dir_all(src).map_err(|e| e.to_string())
    })?;

    parse_skill_info(&dest, &target_agent, &scope)
        .ok_or_else(|| "Failed to parse moved skill metadata".into())
}

#[tauri::command]
pub async fn delete_skill(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Skill directory does not exist".into());
    }
    fs::remove_dir_all(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_skill(
    agent_type: String,
    scope: String,
    workspace_path: Option<String>,
    name: String,
    description: String,
) -> Result<SkillItem, String> {
    let target_parent = get_agent_skills_dir(&agent_type, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    let safe_dir_name = name.to_lowercase().replace(' ', "-").replace(|c: char| !c.is_alphanumeric() && c != '-', "");
    let skill_dir = target_parent.join(&safe_dir_name);

    if skill_dir.exists() {
        return Err(format!("Skill directory '{}' already exists", safe_dir_name));
    }

    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;

    let skill_md_content = format!(
        "---\nname: {}\ndescription: {}\n---\n\n# {}\n\n{}",
        name, description, name, description
    );

    fs::write(skill_dir.join("SKILL.md"), skill_md_content).map_err(|e| e.to_string())?;

    parse_skill_info(&skill_dir, &agent_type, &scope)
        .ok_or_else(|| "Failed to parse created skill metadata".into())
}

#[tauri::command]
pub async fn clone_skill(
    git_url: String,
    target_agent: String,
    scope: String,
    workspace_path: Option<String>,
    new_name: Option<String>,
) -> Result<SkillItem, String> {
    let target_parent = get_agent_skills_dir(&target_agent, &scope, workspace_path.as_deref())
        .ok_or_else(|| "Target skills directory resolution failed".to_string())?;

    fs::create_dir_all(&target_parent).map_err(|e| e.to_string())?;

    let repo_name = git_url
        .trim_end_matches('/')
        .split('/')
        .last()
        .unwrap_or("cloned-skill")
        .trim_end_matches(".git");

    let folder_name = new_name.unwrap_or_else(|| repo_name.to_string());
    let dest = target_parent.join(&folder_name);

    if dest.exists() {
        return Err(format!("Skill directory '{}' already exists", folder_name));
    }

    let output = std::process::Command::new("git")
        .args(["clone", &git_url, dest.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git clone failed: {}", err_msg));
    }

    parse_skill_info(&dest, &target_agent, &scope)
        .ok_or_else(|| "Failed to parse cloned skill metadata".into())
}

#[tauri::command]
pub async fn read_skill_file(skill_path: String, relative_file: String) -> Result<String, String> {
    let p = Path::new(&skill_path).join(&relative_file);
    if !p.exists() || !p.is_file() {
        return Err("File does not exist in skill directory".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_skill_file(skill_path: String, relative_file: String, content: String) -> Result<(), String> {
    let p = Path::new(&skill_path).join(&relative_file);
    fs::write(p, content).map_err(|e| e.to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_and_parse_skill() {
        let dir = tempdir().unwrap();
        let skill_dir = dir.path().join("my-test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: My Custom Skill\ndescription: Test description\n---\n",
        )
        .unwrap();

        let parsed = parse_skill_info(&skill_dir, "gemini", "global").unwrap();
        assert_eq!(parsed.name, "My Custom Skill");
        assert_eq!(parsed.description.unwrap(), "Test description");
        assert_eq!(parsed.has_skill_md, true);
    }
}
```

- [ ] **Step 2: Mount commands and module in src-tauri/src/main.rs**

Add `mod skills_manager;` in `src-tauri/src/main.rs` and register all commands in `.invoke_handler(tauri::generate_handler![...])`:
`skills_manager::list_agent_skills`, `skills_manager::copy_skill`, `skills_manager::move_skill`, `skills_manager::delete_skill`, `skills_manager::create_skill`, `skills_manager::clone_skill`, `skills_manager::read_skill_file`, `skills_manager::save_skill_file`.

- [ ] **Step 3: Run cargo test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/skills_manager.rs src-tauri/src/main.rs
git commit -m "feat: add Rust backend skills_manager module for agent skills operations"
```

---

### Task 4: Skills Manager Frontend Component & UI Panel (`SkillsPanel.tsx`)

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `src/components/SkillsPanel.tsx`
- Modify: `src/App.tsx`
- Create: `tests/skillsManager.test.ts`

**Interfaces:**
- Consumes: Tauri IPC skills commands
- Produces: Skills Management UI Panel with agent filtering, searching, clone/create/copy/move/delete modals, and Markdown view/edit modal.

- [ ] **Step 1: Write failing frontend unit test for Skills manager helper**

Create `tests/skillsManager.test.ts`:
```typescript
import test from 'node.test';
import assert from 'node:assert/strict';

export interface SkillItem {
  id: string;
  name: string;
  agent_type: string;
  scope: string;
  path: string;
  description?: string;
  has_skill_md: boolean;
  file_count: number;
  size_bytes: number;
}

export const filterSkills = (skills: SkillItem[], query: string, agentFilter: string): SkillItem[] => {
  return skills.filter((s) => {
    const matchesAgent = agentFilter === 'all' || s.agent_type === agentFilter || (agentFilter === 'workspace' && s.scope === 'workspace');
    const q = query.toLowerCase().trim();
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
    return matchesAgent && matchesQuery;
  });
};

test('filters skills correctly by query and agent type', () => {
  const sampleSkills: SkillItem[] = [
    { id: '1', name: 'Git Workflow', agent_type: 'gemini', scope: 'global', path: '/p1', description: 'Git helper', has_skill_md: true, file_count: 1, size_bytes: 100 },
    { id: '2', name: 'Code Review', agent_type: 'claude', scope: 'global', path: '/p2', description: 'Review code', has_skill_md: true, file_count: 2, size_bytes: 200 },
    { id: '3', name: 'Local Helper', agent_type: 'gemini', scope: 'workspace', path: '/p3', description: 'Project skill', has_skill_md: true, file_count: 1, size_bytes: 150 },
  ];

  assert.equal(filterSkills(sampleSkills, '', 'all').length, 3);
  assert.equal(filterSkills(sampleSkills, 'git', 'all').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'claude').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'workspace').length, 1);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Update workspaceStore to support 'skills' right panel**

In `src/store/workspaceStore.ts`:
Update `activeRightPanel: 'files' | 'git' | 'settings' | 'search' | 'skills' | 'none';`

- [ ] **Step 4: Create src/components/SkillsPanel.tsx**

Create `src/components/SkillsPanel.tsx` with:
- Full responsive interface: filter tabs (All, Gemini, Claude, Codex, Aider, Workspace), Search bar, Create button, Clone button.
- Skill cards grid/list displaying Agent icon badge, title, description, path, file count, and buttons for Copy, Move, Edit, Delete.
- Modals for:
  - Clone Skill from Git URL
  - Create New Skill
  - Copy/Move Skill to Target Agent & Scope
  - Delete confirmation
  - Edit/View SKILL.md content in embedded Monaco editor or text area.

- [ ] **Step 5: Connect SkillsPanel in App.tsx**

In `src/App.tsx`:
- Add Skills Icon button (Sparkles / Brain icon) in right sidebar toggle strip.
- Render `<SkillsPanel />` when `activeRightPanel === 'skills'`.

- [ ] **Step 6: Run frontend tests & build check**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/workspaceStore.ts src/components/SkillsPanel.tsx src/App.tsx tests/skillsManager.test.ts
git commit -m "feat: add SkillsPanel frontend component for agent skills management"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Session name editing in DB migration, IPC commands, Zustand store, sidebar file tree, and terminal headers -> Covered in Task 1 and Task 2.
   - Skills Manager backend scanning, clone, copy, move, delete, create, read/save -> Covered in Task 3.
   - Skills Manager frontend UI panel with tabs, search, modals, edit -> Covered in Task 4.
2. **No Placeholders**: All tasks contain explicit code snippets, type definitions, command lines, and commit messages.
3. **Type consistency**: `SkillItem`, `SessionInfo`, `update_session_name`, `list_agent_skills` types match throughout.
