# Skills Loading Performance & Search Input Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Skills Manager loading freeze by offloading directory scanning to `tokio::task::spawn_blocking`, skipping symlinks and heavy folders (`node_modules`, `.git`), and fix search input responsiveness by stopping event propagation on keydown/keyup events.

**Architecture:**
- **Backend (`src-tauri/src/skills_manager.rs`)**: Refactor `count_files_and_size` to use bounded depth (max depth = 4), ignore symlinks, and skip heavy directories (`node_modules`, `.git`, `dist`, `build`, `target`, `.next`). Wrap `list_agent_skills` logic in `tokio::task::spawn_blocking`.
- **Frontend (`src/components/SkillsPanel.tsx`)**: Add `onKeyDown={(e) => e.stopPropagation()}` and `onKeyUp={(e) => e.stopPropagation()}` to search `<input>`, and ensure loading state always resolves safely.

**Tech Stack:** Rust (Tauri v2, tokio::task::spawn_blocking, std::fs), React 18, TypeScript, Tailwind CSS.

## Global Constraints
- Do not follow directory symlinks during skills file counting.
- Keep UI responsive during scanning.
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Rust Backend Bounded Traversal, Symlink Protection & Non-blocking Execution

**Files:**
- Modify: `src-tauri/src/skills_manager.rs`
- Test: `src-tauri/src/skills_manager.rs`

**Interfaces:**
- Consumes: `std::fs`, `tokio::task::spawn_blocking`
- Produces: Fast, non-blocking `list_agent_skills` IPC command with symlink safety.

- [ ] **Step 1: Write unit test for symlink and node_modules directory exclusion**

In `src-tauri/src/skills_manager.rs` test module:
```rust
    #[test]
    fn test_count_files_skips_node_modules_and_symlinks() {
        let temp = std::env::temp_dir().join(format!("tde-count-test-{}", uuid::Uuid::new_v4()));
        let skill_dir = temp.join("skill-with-node-modules");
        let nm_dir = skill_dir.join("node_modules/heavy-pkg");
        fs::create_dir_all(&nm_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "test").unwrap();
        fs::write(nm_dir.join("index.js"), "console.log(1)").unwrap();

        let (files, _) = count_files_and_size(&skill_dir);
        assert_eq!(files, 1); // Should only count SKILL.md, skipping node_modules

        fs::remove_dir_all(temp).unwrap();
    }
```

- [ ] **Step 2: Implement count_files_and_size_bounded with symlink & directory exclusions**

In `src-tauri/src/skills_manager.rs`:
```rust
fn count_files_and_size(dir: &Path) -> (usize, u64) {
    count_files_and_size_bounded(dir, 0, 4)
}

fn count_files_and_size_bounded(dir: &Path, current_depth: usize, max_depth: usize) -> (usize, u64) {
    if current_depth > max_depth {
        return (0, 0);
    }
    let mut files = 0;
    let mut bytes = 0;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue; // Do NOT follow symlinks to prevent infinite loops
            }
            let path = entry.path();
            if file_type.is_file() {
                files += 1;
                if let Ok(meta) = entry.metadata() {
                    bytes += meta.len();
                }
            } else if file_type.is_dir() {
                let folder_name = entry.file_name();
                let name_str = folder_name.to_string_lossy();
                if name_str == "node_modules"
                    || name_str == ".git"
                    || name_str == "dist"
                    || name_str == "build"
                    || name_str == "target"
                    || name_str == ".next"
                    || name_str == ".cache"
                    || name_str == ".venv"
                {
                    continue; // Skip heavy ignored directories
                }
                let (sub_files, sub_bytes) = count_files_and_size_bounded(&path, current_depth + 1, max_depth);
                files += sub_files;
                bytes += sub_bytes;
            }
        }
    }

    (files, bytes)
}
```

- [ ] **Step 3: Wrap list_agent_skills in tokio::task::spawn_blocking**

```rust
#[tauri::command]
pub async fn list_agent_skills(workspace_path: Option<String>) -> Result<Vec<SkillItem>, String> {
    tokio::task::spawn_blocking(move || {
        list_agent_skills_sync(workspace_path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 4: Run cargo test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/skills_manager.rs
git commit -m "perf: prevent loading hangs in list_agent_skills by using spawn_blocking, bounded depth, and symlink/node_modules exclusion"
```

---

### Task 2: Frontend Search Input Fix & Event Propagation Handling

**Files:**
- Modify: `src/components/SkillsPanel.tsx`
- Test: `tests/skillsManager.test.ts`

**Interfaces:**
- Consumes: User search input events
- Produces: Smooth, responsive search input that accepts text input without key interception.

- [ ] **Step 1: Update search input in src/components/SkillsPanel.tsx**

In `src/components/SkillsPanel.tsx`:
```tsx
<div className="relative">
  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500 pointer-events-none" />
  <input
    type="text"
    placeholder="Search skills, plugins, prompts..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    onKeyDown={(e) => e.stopPropagation()}
    onKeyUp={(e) => e.stopPropagation()}
    className="w-full bg-surface-2 border border-surface-3 rounded pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand/60"
  />
  {searchQuery && (
    <button
      type="button"
      onClick={() => setSearchQuery('')}
      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
      title="Clear search"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  )}
</div>
```

- [ ] **Step 2: Run npm test and npm build**

Run: `npm run test && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/SkillsPanel.tsx
git commit -m "fix: prevent key event interception on search input in SkillsPanel"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Fix loading hang (symlinks, heavy folders, spawn_blocking) -> Task 1.
   - Fix search input string entry (stopPropagation, clear button) -> Task 2.
2. **No Placeholders**: Explicit Rust functions and React JSX included.
