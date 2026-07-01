# TDE Sub-Project 3: Workspace Explorer & Embedded File/Git Operations Design

## 1. Overview
This design specification defines the architecture for the file explorer tree, visual Git status monitor, and embedded editor panel in the Terminal Development Environment (TDE). It allows the user to browse project files, view/edit source code with syntax highlighting, inspect Git changes, stage/unstage files, and make commits directly from the TDE Cockpit.

---

## 2. Technical Architecture

The architecture maps file system and Git status queries from the React UI to native Rust command handlers.

```mermaid
graph TD
    subgraph UI Panels (React)
        FT[File Tree Panel]
        EP[Editor Pane]
        GP[Git Panel]
    end

    subgraph Tauri IPC
        FCmd[File Commands]
        GCmd[Git Commands]
    end

    subgraph Rust Backend
        FM[File Manager]
        GR[Git Runner]
    end

    subgraph OS File System
        FS[Disk Storage]
        Git[Git CLI / Repo]
    end

    FT -->|list_dir| FCmd
    EP -->|read/write file| FCmd
    GP -->|status/diff/commit| GCmd

    FCmd --> FM
    GCmd --> GR

    FM -->|read/write| FS
    GR -->|spawn git command| Git
```

---

## 3. Tech Stack & Dependencies

### Rust Backend
* **Standard Library (`std::fs`, `std::process`)**: Native file system traversals and Git CLI process execution.
* **Serde / Serde JSON**: Serializing file trees and git statuses for Tauri serialization.

### React Frontend
* **Monaco Editor** (`@monaco-editor/react`): Lightweight React wrapper for Microsoft's Monaco Editor, providing high-fidelity syntax highlighting, search/replace, code folding, and diff view.
* **Lucide React**: Visual panel icons.

---

## 4. Backend Command Specifications

We will implement the following new Tauri commands in `src-tauri/src/main.rs` (or modularized into `src-tauri/src/file_manager.rs` and `src-tauri/src/git_runner.rs`):

### File Operations (`src-tauri/src/file_manager.rs`)
1. `list_directory(path: String) -> Result<Vec<FileEntry>, String>`
   Lists all children of a directory.
   ```rust
   #[derive(serde::Serialize)]
   pub struct FileEntry {
       pub name: String,
       pub path: String,
       pub is_dir: bool,
   }
   ```
2. `read_file_content(path: String) -> Result<String, String>`
   Reads content of a text file.
3. `write_file_content(path: String, content: String) -> Result<(), String>`
   Writes modified content back to disk.

### Git Operations (`src-tauri/src/git_runner.rs`)
1. `get_git_status(cwd: String) -> Result<Vec<GitFileStatus>, String>`
   Executes `git status --porcelain` in `cwd`.
   ```rust
   #[derive(serde::Serialize)]
   pub struct GitFileStatus {
       pub path: String,
       pub status: String, // "M" (Modified), "A" (Added), "D" (Deleted), "??" (Untracked)
       pub staged: bool,
   }
   ```
2. `get_git_diff(cwd: String, file_path: String) -> Result<String, String>`
   Executes `git diff HEAD -- <file_path>` to return the diff patch.
3. `git_stage_file(cwd: String, file_path: String) -> Result<(), String>`
   Executes `git add <file_path>`.
4. `git_unstage_file(cwd: String, file_path: String) -> Result<(), String>`
   Executes `git restore --staged <file_path>`.
5. `git_commit_changes(cwd: String, message: String) -> Result<(), String>`
   Executes `git commit -m "<message>"`.

---

## 5. Frontend UI Specifications

### Panel Layout
We will extend the TDE Cockpit layout into a multi-panel workspace:
* **Sidebar (Left)**: Swappable tabs between the **Session Manager** and **File Tree**.
* **Cockpit Center**: Split vertically:
  * Left: Active **Terminal Panel** (xterm.js).
  * Right: **Editor Panel** (Monaco Editor) or **Git Panel** (Diff View and Commit interface).
* **Workspace Status Bar (Bottom)**: Active workspace path, current git branch, and active session ID.

### Zustand Store Extensions (`src/store/workspaceStore.ts`)
* `activeFile: { path: string, content: string } | null`
* `isGitPanelOpen: boolean`
* `gitFiles: GitFileStatus[]`

---

## 6. Testing Strategy
1. **File System Command Tests**:
   * Unit test `list_directory` on a mock directory.
   * Unit test reading and writing a temporary file.
2. **Git Integration Tests**:
   * Verify git command outputs in a temporary repository workspace.
