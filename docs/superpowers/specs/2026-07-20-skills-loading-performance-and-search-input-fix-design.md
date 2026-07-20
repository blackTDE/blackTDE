# Skills Loading Performance & Search Input Fix Design Spec

## Problem Statement

Users reported two critical defects on the Skills Manager page:
1. **Loading Hang / Stuck**: The skills panel gets stuck in "loading" state when opening or listing skills.
2. **Search Input Unresponsive**: Users cannot type or input characters into the search bar.

---

## Root Causes

1. **Backend Blocking I/O & Infinite Recursive Symlink Traversal**:
   - `count_files_and_size` used unbounded recursion and followed symlinks without checking `file_type.is_symlink()`. If a plugin contained a symlink or heavy folders (`node_modules`, `.git`, `dist`, `target`), traversal hung or scanned tens of thousands of files synchronously.
   - `list_agent_skills` ran filesystem calls directly on Tokio's async event loop thread instead of offloading to `tokio::task::spawn_blocking`.
2. **Search Input Event Interception**:
   - Global application keydown listeners intercepted keystrokes (like Space, Enter, letters) because the search `<input>` element lacked `onKeyDown={(e) => e.stopPropagation()}` and `onKeyUp={(e) => e.stopPropagation()}`.

---

## Solution Design

### 1. Backend Optimizations (`src-tauri/src/skills_manager.rs`)
- **Offload to `tokio::task::spawn_blocking`**: `list_agent_skills` will execute on Tokio's blocking thread pool so Tauri IPC and webview remain 100% responsive.
- **Symlink Protection**: `count_files_and_size` will skip symlinks (`file_type.is_symlink()`) to prevent cyclic or infinite directory loops.
- **Folder Exclusion**: `count_files_and_size` will skip heavy build and dependency directories (`node_modules`, `.git`, `dist`, `build`, `target`, `.next`, `.cache`, `.venv`).
- **Bounded Recursion Depth**: `count_files_and_size` enforces a maximum recursion depth limit (depth <= 4).

### 2. Frontend Search Input & Loading State Hardening (`src/components/SkillsPanel.tsx`)
- **Stop Event Propagation on Input**: Add `onKeyDown={(e) => e.stopPropagation()}` and `onKeyUp={(e) => e.stopPropagation()}` to the search input field so hotkeys or terminal keyboard listeners never swallow typed text.
- **Safeguard Loading State**: Wrap `fetchSkills` in a `try...catch...finally` block that guarantees `setLoading(false)` is called even if an error occurs.
- **Search Clear Button**: Add a quick clear `(X)` icon inside the search bar for easy resetting.

---

## Verification Strategy

- Run `cargo test` in `src-tauri` to verify backend skills scanning and bounded recursion unit tests.
- Run `npm run test` to verify search filtering tests.
- Run `npm run build` to verify frontend compilation.
