# Workspace Explorer & Embedded File/Git Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project file explorer tree, a visual Git management panel (status, diffs, stage, commit), and an embedded code editor using Monaco Editor to browse and edit workspace files.

**Architecture:** Extend the Tauri backend with file system traversal and Git process invocation commands. Integrate `@monaco-editor/react` in the frontend. Display a vertical split cockpit layout with the Terminal on the left and Editor/Git on the right.

**Tech Stack:** Tauri v2, React v18, Monaco Editor, Lucide React, Git CLI.

## Global Constraints
- Target Platforms: macOS, Windows, Linux
- Use `@monaco-editor/react` for the embedded editor
- Execute native git process via `std::process::Command` in Rust
- Follow strict unidirectional flow for store updates

---

### Task 1: Backend File Manager Commands

**Files:**
- Create: `src-tauri/src/file_manager.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `file_manager::list_directory(path: String) -> Result<Vec<FileEntry>, String>`
- Produces: `file_manager::read_file_content(path: String) -> Result<String, String>`
- Produces: `file_manager::write_file_content(path: String, content: String) -> Result<(), String>`

- [ ] **Step 1: Write file_manager.rs**
  Create `src-tauri/src/file_manager.rs` with structs `FileEntry` and the list/read/write commands. Exclude binary files or `node_modules` / `.git` folders from listings.

- [ ] **Step 2: Declare file manager commands in main.rs**
  Modify `src-tauri/src/main.rs` to import `file_manager` and add the three commands to `tauri::generate_handler!`.

- [ ] **Step 3: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Successful compilation.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/file_manager.rs src-tauri/src/main.rs
  git commit -m "feat: implement backend file manager commands"
  ```

---

### Task 2: Backend Git Runner Commands

**Files:**
- Create: `src-tauri/src/git_runner.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `git_runner::get_git_status(cwd: String) -> Result<Vec<GitFileStatus>, String>`
- Produces: `git_runner::get_git_diff(cwd: String, file_path: String) -> Result<String, String>`
- Produces: `git_runner::git_stage_file(cwd: String, file_path: String) -> Result<(), String>`
- Produces: `git_runner::git_unstage_file(cwd: String, file_path: String) -> Result<(), String>`
- Produces: `git_runner::git_commit_changes(cwd: String, message: String) -> Result<(), String>`

- [ ] **Step 1: Write git_runner.rs**
  Create `src-tauri/src/git_runner.rs` executing native git CLI via `std::process::Command`. Parse porcelain status and handle staging and committing.

- [ ] **Step 2: Declare git commands in main.rs**
  Modify `src-tauri/src/main.rs` to import `git_runner` and add the five commands to `tauri::generate_handler!`.

- [ ] **Step 3: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Successful compilation.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/git_runner.rs src-tauri/src/main.rs
  git commit -m "feat: implement backend git process runner commands"
  ```

---

### Task 3: Store Extensions & Monaco Installation

**Files:**
- Modify: `package.json`
- Modify: `src/store/workspaceStore.ts`

- [ ] **Step 1: Install Monaco Editor package**
  Run: `npm install @monaco-editor/react --registry=https://registry.npmmirror.com`
  Expected: Monaco dependency successfully installed.

- [ ] **Step 2: Extend Zustand store**
  Add state and setters for `activeFilePath`, `activeFileContent`, `gitFiles`, and `activeRightPanel` (either `'editor'` or `'git'`).

- [ ] **Step 3: Commit**
  ```bash
  git add package.json src/store/workspaceStore.ts
  git commit -m "feat: install Monaco Editor and extend Zustand store state"
  ```

---

### Task 4: UI Components (FileTree, EditorPane, GitPanel)

**Files:**
- Create: `src/components/FileTree.tsx`
- Create: `src/components/EditorPane.tsx`
- Create: `src/components/GitPanel.tsx`

- [ ] **Step 1: Build FileTree component**
  Create `src/components/FileTree.tsx` that calls `list_directory` recursively or dynamically upon folder clicking. Clicking a file sets it as the active file in the store.

- [ ] **Step 2: Build EditorPane component**
  Create `src/components/EditorPane.tsx` using `@monaco-editor/react` to display the active file's code. Add a Save button that calls `write_file_content`.

- [ ] **Step 3: Build GitPanel component**
  Create `src/components/GitPanel.tsx` which loads the files from `get_git_status`, allows staging/unstaging, displays diff output from `get_git_diff`, and allows typing a commit message.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/FileTree.tsx src/components/EditorPane.tsx src/components/GitPanel.tsx
  git commit -m "feat: create React panels for FileTree, Editor, and Git status"
  ```

---

### Task 5: App Integration & Verification

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update Cockpit Layout in App.tsx**
  Modify `src/App.tsx` to include Sidebar tabs (Sessions / File Tree), split the main panel vertically (Terminal on the left, Editor/Git on the right), and add a bottom Status Bar displaying Git branch and active workspace path.

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Build succeeds.

- [ ] **Step 3: Commit**
  ```bash
  git add src/App.tsx
  git commit -m "feat: integrate Workspace Explorer and Git panels in App.tsx"
  ```
