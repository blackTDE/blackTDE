# Advanced Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-pane split terminal grid (up to 4 screens), enable auto-capture and resumption of agent session IDs, and create an advanced Settings panel for local LLM proxies, MCP server configs, and CLI version checkers.

**Architecture:** Create database tables for proxies and MCP servers. Extend the Rust PTY session spawning to pre-inject proxy base URLs and automatically capture session IDs from terminal stdout logs. Develop a modular Settings UI tab and an xterm.js layout split grid.

**Tech Stack:** Tauri v2, React v18, SQLite, xterm.js, Zustand.

## Global Constraints
- Target Platforms: macOS, Windows, Linux
- Support 1x1, 1x2, 2x1, and 2x2 grid cell divisions in the frontend
- Capture session IDs on the fly by parsing stdout JSON streams (e.g. Claude Code) or logs
- Expose CLI version checks via system command execution

---

### Task 1: SQLite Schema & Configuration Commands

**Files:**
- Create: `src-tauri/migrations/20260702100000_advanced_configs.sql`
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `settings::save_local_proxy(pool: State<SqlitePool>, provider: String, url: String, model: String, active: bool) -> Result<(), String>`
- Produces: `settings::get_local_proxies(pool: State<SqlitePool>) -> Result<Vec<LocalProxyEntry>, String>`
- Produces: `settings::save_mcp_server(pool: State<SqlitePool>, name: String, command: String, args: String) -> Result<(), String>`
- Produces: `settings::get_mcp_servers(pool: State<SqlitePool>) -> Result<Vec<McpServerEntry>, String>`
- Produces: `settings::check_cli_version(binary: String) -> Result<String, String>`

- [ ] **Step 1: Write SQL migration file**
  Create `src-tauri/migrations/20260702100000_advanced_configs.sql` defining `local_proxies` and `mcp_servers` tables.

- [ ] **Step 2: Create settings.rs module**
  Create `src-tauri/src/settings.rs` implementing saving/fetching proxy and MCP configurations and executing `Command` to retrieve CLI versions (`aider --version`, etc.).

- [ ] **Step 3: Update main.rs to register settings module**
  Modify `src-tauri/src/main.rs` to import `settings` and declare commands in Tauri builder.

- [ ] **Step 4: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Successful compilation.

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/migrations/20260702100000_advanced_configs.sql src-tauri/src/settings.rs src-tauri/src/main.rs
  git commit -m "feat: implement database tables and settings commands"
  ```

---

### Task 2: PTY Resumption & Local LLM Proxy Injection

**Files:**
- Modify: `src-tauri/src/event_bus.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Parse stdout logs for Session ID capture**
  Modify `start_stdout_reader` in `src-tauri/src/event_bus.rs`. Check if incoming chunks contain Claude Code init JSON (`{"session_id":"..."}`) or log patterns. If captured, run SQL update to store session ID in database.

- [ ] **Step 2: Inject proxy env variables and support session resume in main.rs**
  Modify `spawn_session` in `src-tauri/src/main.rs` to accept `resume_session_id: Option<String>`. If provided and command is `"claude"`, append `vec!["--resume".to_string(), resume_id]` to arguments list.
  Query the active proxy from `local_proxies` in SQLite. If found, inject `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` into process environment vector.

- [ ] **Step 3: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Builds correctly.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/event_bus.rs src-tauri/src/main.rs
  git commit -m "feat: support env-injected local LLM proxies and session recovery"
  ```

---

### Task 3: Store Extensions & Settings tabs Panel

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add Layout properties to Zustand**
  Add `paneLayout` containing layout grid type, active index, and terminal panel array. Expose setters.

- [ ] **Step 2: Build SettingsPanel React UI**
  Create `src/components/SettingsPanel.tsx` displaying tabs: **Vault**, **Proxies**, **MCP**, and **System**. Implement proxy registration forms, MCP server addition list, and display CLI versions.

- [ ] **Step 3: Commit**
  ```bash
  git add src/store/workspaceStore.ts src/components/SettingsPanel.tsx
  git commit -m "feat: extend Zustand layout store and build SettingsPanel UI"
  ```

---

### Task 4: Terminal Splits Grid & App Assembly

**Files:**
- Create: `src/components/TerminalGrid.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build TerminalGrid split panel wrapper**
  Create `src/components/TerminalGrid.tsx` supporting flex layouts matching `1x1`, `1x2` (side by side), `2x1` (top/bottom), and `2x2` (4 cells grid). Clicking a cell sets active pane index. Shows placeholder with "Spawn Terminal" button if slot is empty.

- [ ] **Step 2: Integrate Grid and Settings in App.tsx**
  Modify `src/App.tsx`:
  - Renders `TerminalGrid` in the cockpit center space.
  - Renders layout switcher controls in header or sidebar.
  - Adds "Settings" tab option on Right Panel pointing to `SettingsPanel`.
  - Upgrades sidebar Spawn Form to query past session IDs from DB to allow resuming.

- [ ] **Step 3: Run validation build**
  Run: `npm run build`
  Expected: Complete production build succeeds.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/TerminalGrid.tsx src/App.tsx
  git commit -m "feat: build TerminalGrid splits and assemble advanced cockpit"
  ```
