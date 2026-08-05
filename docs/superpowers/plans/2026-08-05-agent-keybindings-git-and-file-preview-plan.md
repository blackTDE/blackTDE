# Implementation Plan: Code Agent Keybindings, Git Branch Switcher & Commit Expansion, File Preview Controls

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Shift+Enter in terminal sessions to send `\n` for multiline input, add Git branch quick-switching and commit message expansion, and add file preview window hide/close, tab drag reordering, and file tree hover full name display.

**Architecture:**
- Frontend & backend changes across `terminalRestore.ts`, `git_runner.rs`, `main.rs`, `GitPanel.tsx`, `App.tsx`, `workspaceStore.ts`, and `FileTree.tsx`.

**Tech Stack:** TypeScript, React, Tailwind CSS, Rust, Tauri IPC.

---

## Global Constraints
- Remember to commit changes at every step.
- Verify tests after keybinding changes.

---

### Task 1: Fix Shift+Enter Keybinding Sequence

**Files:**
- Modify: `src/terminalRestore.ts:11-12`
- Test: `tests/terminalRestore.test.ts:5-9`

- [ ] **Step 1: Write failing test in tests/terminalRestore.test.ts**
  Update `tests/terminalRestore.test.ts` to expect `'\n'` for Shift+Enter instead of `'\x1b[13;2u'`.

- [ ] **Step 2: Run tests to verify failure**
  Run: `npm test`
  Expected: Test failure showing expected `\n` vs actual `\x1b[13;2u`.

- [ ] **Step 3: Update modifiedEnterSequence in src/terminalRestore.ts**
  Change `'\x1b[13;2u'` to `'\n'`.

- [ ] **Step 4: Run tests to verify pass**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/terminalRestore.ts tests/terminalRestore.test.ts && git commit -m "fix: change Shift+Enter key sequence to newline control character"`

---

### Task 2: Add Git Branch Switching and Commit Message Expansion

**Files:**
- Modify: `src-tauri/src/git_runner.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/components/GitPanel.tsx`

- [ ] **Step 1: Implement get_git_branches and git_checkout_branch in git_runner.rs**
  Add Rust functions `get_git_branches` and `git_checkout_branch`. Add unit test in `git_runner.rs`.

- [ ] **Step 2: Register Tauri commands in main.rs**
  Add `git_runner::get_git_branches` and `git_runner::git_checkout_branch` to `tauri::generate_handler!`.

- [ ] **Step 3: Update GitPanel.tsx for Branch Dropdown & Commit Expansion**
  - Add `branches` state, fetch branches on refresh, render `<select>` dropdown in top header bar of Git panel, and invoke `git_checkout_branch` on change.
  - Add `expandedMsgHashes` state (or `expandedMessages` set) and expand icon button (`ChevronDown`/`ChevronUp` or toggle icon) to toggle between `line-clamp-1` and full multi-line text view for commit messages.

- [ ] **Step 4: Build and test Rust code**
  Run: `cd src-tauri && cargo test`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src-tauri/src/git_runner.rs src-tauri/src/main.rs src/components/GitPanel.tsx && git commit -m "feat: add git branch quick switcher dropdown and commit info expansion"`

---

### Task 3: File Preview Window Controls, Tab Dragging, & File Hover Full Name

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/FileTree.tsx`

- [ ] **Step 1: Add reorderOpenFiles action in workspaceStore.ts**
  Add `reorderOpenFiles: (fromIndex: number, toIndex: number) => void` to Zustand store.

- [ ] **Step 2: Add Hide Preview Window button and Drag & Drop tab reordering in App.tsx**
  - Make open file tabs bar visible when `openFiles.length > 0` even if `activeFileTab === null`.
  - Add `<button onClick={() => setActiveFileTab(null)} title="Hide file preview window">` button with an icon on the right side of tab bar / preview pane.
  - Add HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) to file tab buttons calling `reorderOpenFiles`.

- [ ] **Step 3: Update FileTree.tsx hover tooltip to show full file name**
  Change file item `title={`Modified ${formatModified(modifiedAt)}`}` to `title={name}` in `src/components/FileTree.tsx`.

- [ ] **Step 4: Verify frontend compilation and tests**
  Run: `npm run build && npm test`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/store/workspaceStore.ts src/App.tsx src/components/FileTree.tsx && git commit -m "feat: support hiding preview window, drag tab reordering, and file full name hover tooltips"`
