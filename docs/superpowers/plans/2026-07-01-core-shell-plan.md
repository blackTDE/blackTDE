# Core Shell & Rust/Tauri Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a fully functional, persistent Tauri desktop workspace displaying a real-time, interactive, PTY-backed terminal in React using xterm.js, with SQLite database session storage.

**Architecture:** A Tauri desktop application using a React + Vite frontend and a Rust backend. The Rust backend spawns interactive terminal sessions inside native pseudo-terminals (PTYs) using `portable-pty`, streams stdout/stderr asynchronously via Tauri event broadcasts to the frontend (which renders it in `xterm.js`), and stores transcripts and session metadata in a local SQLite database using `sqlx`.

**Tech Stack:** Tauri v2, React v18, Vite, TypeScript, SQLite, SQLx, portable-pty, xterm.js, Zustand, TailwindCSS.

## Global Constraints
- Target Platforms: macOS, Windows, Linux
- Use React + Vite for the frontend (no Next.js Node server dependencies)
- SQLite database must run embedded migrations on startup without manual setup
- Interactive processes must run inside a Pseudo-Terminal (PTY) wrapper to support full keyboard and styling interactivity

---

### Task 1: Project Scaffolding & Dependency Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`

- [ ] **Step 1: Write frontend configuration files**
  Create `package.json` with React, Vite, Tailwind, Zustand, and `@xterm/xterm`.
  Create `vite.config.ts`, `index.html`, `tsconfig.json`, `src/index.css` (Tailwind styles), and basic React entrypoints (`src/main.tsx`, `src/App.tsx`).

- [ ] **Step 2: Write backend Rust configuration files**
  Create `src-tauri/Cargo.toml` with `tauri`, `tokio`, `sqlx` (with SQLite), `portable-pty`, `serde`, and `uuid`.
  Create `src-tauri/tauri.conf.json` configuring the frontend build paths, bundle identifier (`com.tde.app`), and allowed features.
  Create a skeleton `src-tauri/src/main.rs`.

- [ ] **Step 3: Run npm install**
  Run: `npm install` (using a mirror registry if the default fails).
  Expected: Node modules are successfully installed.

- [ ] **Step 4: Verify Tauri CLI compilation**
  Run: `npm run tauri build -- --no-bundle` or check if cargo metadata parses correctly with `cargo check` in `src-tauri`.
  Expected: Cargo fetches crates and builds without errors.

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add package.json vite.config.ts index.html tsconfig.json src/ src-tauri/
  git commit -m "feat: scaffold frontend React/Vite and backend Tauri configuration"
  ```

---

### Task 2: SQLite Schema & Database Manager

**Files:**
- Create: `src-tauri/migrations/20260701000000_init.sql`
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `db::initialize_db(app_handle: &tauri::AppHandle) -> Result<sqlx::SqlitePool, Box<dyn std::error::Error>>`

- [ ] **Step 1: Write SQLite migration file**
  Create `src-tauri/migrations/20260701000000_init.sql` containing tables for `workspaces`, `sessions`, and `transcripts` as defined in the spec.

- [ ] **Step 2: Create DB module**
  Create `src-tauri/src/db.rs` to initialize the database file in app data directories, set up connection pool, run embedded migrations, and expose helper operations.

- [ ] **Step 3: Update main.rs to initialize and manage database pool**
  Modify `src-tauri/src/main.rs` to initialize the database in the Tauri setup hook and register the pool in Tauri's state.

- [ ] **Step 4: Run compilation check**
  Run: `cargo check` inside `src-tauri/`.
  Expected: Builds correctly and runs migrations.

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/migrations/ src-tauri/src/db.rs src-tauri/src/main.rs
  git commit -m "feat: set up SQLite schema and auto-migration runner"
  ```

---

### Task 3: PTY Process Runner

**Files:**
- Create: `src-tauri/src/process.rs`

**Interfaces:**
- Produces: `process::ProcessManager` state struct.
- Produces: `process::ActiveProcess` wrapper.
- Produces: `process::spawn_pty_process(session_id: &str, command: &str, args: Vec<String>, cwd: &str, rows: u16, cols: u16) -> Result<ActiveProcess, Box<dyn std::error::Error>>`

- [ ] **Step 1: Implement PTY process runner logic**
  Create `src-tauri/src/process.rs` using `portable-pty`. Implement the process spawning interface, converting the command, configuring dimensions (rows, cols), and obtaining PTY Master.

- [ ] **Step 2: Run compilation check**
  Run: `cargo check` inside `src-tauri/`.
  Expected: Code builds with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git add src-tauri/src/process.rs
  git commit -m "feat: implement portable-pty process runner in Rust"
  ```

---

### Task 4: Event Bus & Tauri IPC Commands

**Files:**
- Create: `src-tauri/src/event_bus.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `event_bus::TdeEvent` struct.
- Produces: Tauri Command `spawn_session`
- Produces: Tauri Command `write_to_session`
- Produces: Tauri Command `resize_session`
- Produces: Tauri Command `terminate_session`

- [ ] **Step 1: Implement stdout streaming read loop and Event Bus**
  Create `src-tauri/src/event_bus.rs`. Create a tokio thread reader that reads bytes from a PTY master, persists stdout chunks in SQLite transcripts, and invokes `app_handle.emit("tde-event")`.

- [ ] **Step 2: Define Tauri Commands**
  Implement the standard Tauri command handlers in `src-tauri/src/main.rs` targeting spawn, write, resize, and terminate processes, interacting with the database and PTY process manager.

- [ ] **Step 3: Compile and verify backend**
  Run: `cargo check` in `src-tauri/`.
  Expected: Successful compilation.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/event_bus.rs src-tauri/src/main.rs
  git commit -m "feat: implement Tauri IPC commands and background event bus"
  ```

---

### Task 5: Zustand Store & xterm.js Panel

**Files:**
- Create: `src/store/workspaceStore.ts`
- Create: `src/components/TerminalPane.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement Zustand Store**
  Create `src/store/workspaceStore.ts` to manage active workspace, list of sessions, and current active session ID.

- [ ] **Step 2: Build TerminalPane Component**
  Create `src/components/TerminalPane.tsx` importing `@xterm/xterm` and `@xterm/addon-fit`. Listen to `tde-event` with `listen` from `@tauri-apps/api/event`, write data to terminal instance, and wire user key inputs to invoke `write_to_session`.

- [ ] **Step 3: Connect UI in App.tsx**
  Update `src/App.tsx` to display a sidebar listing sessions, an "Add Session" button, and the active `TerminalPane`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/store/workspaceStore.ts src/components/TerminalPane.tsx src/App.tsx
  git commit -m "feat: implement xterm.js UI and Zustand state synchronization"
  ```

---

### Task 6: Smoke Testing & Validation

**Files:**
- Modify: `src-tauri/src/main.rs` (if test hooks are needed)

- [ ] **Step 1: Run complete Tauri app build**
  Run: `npm run tauri dev` or `cargo build` in `src-tauri`.
  Expected: Application launches.

- [ ] **Step 2: Verify PTY execution**
  Spawn a shell session and input `echo "Hello TDE"`. Verify it prints correctly on xterm.js.

- [ ] **Step 3: Verify SQLite Persistence**
  Inspect the SQLite database using SQLite CLI or check that the app restores the history when restarted.

- [ ] **Step 4: Commit**
  ```bash
  git commit --allow-empty -m "test: complete manual verification and integration validation"
  ```
