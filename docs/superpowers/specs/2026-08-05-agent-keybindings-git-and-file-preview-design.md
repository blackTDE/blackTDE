# Design Specification: Code Agent Keybindings, Git Branch Switcher & Commit Expansion, File Preview Control & Tab Dragging

## 1. Code Agent Shift+Enter Keybinding Fix

### Issue Analysis
Currently, in `src/terminalRestore.ts`, `modifiedEnterSequence` maps `Shift+Enter` to `\x1b[13;2u` (CSI u Kitty keyboard protocol). Standard CLI agent frameworks (such as Ink for Claude Code, readline, etc.) running inside PTY sessions do not parse CSI u sequences out of the box and fall back to handling the enter key sequence (`\r`), which submits the current prompt instead of inserting a newline.

### Solution
- Update `modifiedEnterSequence` in `src/terminalRestore.ts` to return `'\n'` (Line Feed, `\x0a`) when `Shift+Enter` keydown is triggered.
- `\n` is the standard character sequence produced by terminal emulators (like iTerm2, VS Code integrated terminal) for Shift+Enter, causing interactive CLI agents and shell prompts to insert a newline into the multi-line input buffer without executing/submitting.
- Update `tests/terminalRestore.test.ts` to verify `'\n'` is returned for `Shift+Enter`.

---

## 2. Git Panel Improvements

### 2A. Branch Switcher Dropdown
- **Backend (`src-tauri/src/git_runner.rs` & `src-tauri/src/main.rs`)**:
  - Add `get_git_branches(cwd: String) -> Result<Vec<String>, String>`: runs `git branch --format="%(refname:short)"` to list all repository branches.
  - Add `git_checkout_branch(cwd: String, branch: String) -> Result<String, String>`: runs `git checkout <branch>`.
  - Register both commands in `main.rs`.
- **Frontend (`src/components/GitPanel.tsx`)**:
  - Replace static branch text with a styled `<select>` dropdown next to the branch icon.
  - Load available branches on status refresh and display current branch selected.
  - On select change, trigger `git_checkout_branch` via `runGitOperation` and reload git status.

### 2B. Commit Message Expansion
- **Frontend (`src/components/GitPanel.tsx`)**:
  - Add state `expandedMessageHashes: Set<string>` (or per-commit state) to track which commit messages are expanded.
  - Add an expand icon button (e.g. `Maximize2` / `ChevronDown` or `AlignLeft`) alongside each commit message.
  - When expanded, render the complete multi-line commit message without `line-clamp-1` truncation.

---

## 3. File Preview Window & File Tree Improvements

### 3A. Hide/Close Preview Window
- **Frontend (`App.tsx` & `workspaceStore.ts`)**:
  - Add a "Hide Preview Window" button (e.g. `<EyeOff size={13} />` or `<Minimize2 size={13} />`) in the top tab bar / preview header.
  - Clicking this button sets `activeFileTab = null` while preserving all entries in `openFiles`.
  - Keep the open file tabs bar visible even when `activeFileTab === null` (showing tabs in an inactive state), so the user can re-open any file preview by clicking its tab or clicking a file in `FileTree`.

### 3B. Drag to Reorder File Tabs
- **Frontend (`App.tsx` & `workspaceStore.ts`)**:
  - Add `reorderOpenFiles(fromIndex: number, toIndex: number)` action in `workspaceStore.ts` to update `openFiles` and `openFilesByProject`.
  - Add HTML5 drag-and-drop handlers (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) on open file tab buttons in `App.tsx`.

### 3C. File Tree Mouse Hover Tooltip
- **Frontend (`src/components/FileTree.tsx`)**:
  - Change the `title` attribute on file item rows from `Modified ${formatModified(modifiedAt)}` to `name` (or `path`), displaying the full file name instead of the modified timestamp when hovering over a file in the right file pane.

---

## Verification Plan
1. Run `npm test` to verify `terminalRestore.test.ts` passes with updated `Shift+Enter` sequence (`\n`).
2. Test Git branch switcher dropdown and commit message expansion in the right Git tab.
3. Test hiding file preview window, dragging open file tabs to reorder, and hovering over file items in `FileTree`.
