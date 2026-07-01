# Provider & Adapter Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a secure local credentials vault storing API keys in SQLite, and support environment variable injection when spawning coding agent processes (`claude`, `aider`, etc.) inside pseudo-terminals.

**Architecture:** Extend SQLite database with `provider_keys` table. Implement Tauri commands to query/save keys. Modify PTY process spawner to inject runtime environments. Create a Provider Vault UI in the frontend.

**Tech Stack:** Tauri v2, React v18, SQLite, portable-pty, Zustand.

## Global Constraints
- Target Platforms: macOS, Windows, Linux
- Pre-inject provider-specific API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) automatically when spawning agent binaries
- Mask API keys when rendering configured providers list

---

### Task 1: Database Migration & Provider Vault Commands

**Files:**
- Create: `src-tauri/migrations/20260702000000_provider_keys.sql`
- Create: `src-tauri/src/provider.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces: `provider::save_provider_key(pool: State<SqlitePool>, provider: String, apiKey: String) -> Result<(), String>`
- Produces: `provider::get_provider_keys(pool: State<SqlitePool>) -> Result<Vec<ProviderKeyEntry>, String>`

- [ ] **Step 1: Write SQL migration file**
  Create `src-tauri/migrations/20260702000000_provider_keys.sql` defining `provider_keys` table.

- [ ] **Step 2: Create provider.rs module**
  Create `src-tauri/src/provider.rs` with structs `ProviderKeyEntry` and tauri commands to save and list keys.

- [ ] **Step 3: Update main.rs to declare provider module**
  Modify `src-tauri/src/main.rs` to declare `mod provider;` and register its commands in Tauri handler.

- [ ] **Step 4: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Successful compilation.

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/migrations/20260702000000_provider_keys.sql src-tauri/src/provider.rs src-tauri/src/main.rs
  git commit -m "feat: implement database vault and provider commands"
  ```

---

### Task 2: PTY Environment Variable Injection

**Files:**
- Modify: `src-tauri/src/process.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `process::spawn_pty_process` signature changes to accept `envs: Vec<(String, String)>`.

- [ ] **Step 1: Update spawn_pty_process in process.rs**
  Modify `src-tauri/src/process.rs` to take `envs: Vec<(String, String)>` parameter and inject each pair into `CommandBuilder` using `.env(key, val)`.

- [ ] **Step 2: Update spawn_session command in main.rs**
  Modify `spawn_session` in `src-tauri/src/main.rs` to query the SQLite `provider_keys` table for the matching provider key. If key is found, determine corresponding env var name:
  - `anthropic` -> `ANTHROPIC_API_KEY`
  - `openai` -> `OPENAI_API_KEY`
  - `gemini` -> `GEMINI_API_KEY`
  Pass the variable to `spawn_pty_process` envs list.

- [ ] **Step 3: Verify compilation**
  Run: `cargo check` in `src-tauri/`.
  Expected: Builds correctly.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/process.rs src-tauri/src/main.rs
  git commit -m "feat: support env variable injection in PTY spawner"
  ```

---

### Task 3: Store Extensions & ProviderVault UI Component

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `src/components/ProviderVault.tsx`

- [ ] **Step 1: Extend store**
  Add state and setters for `providerStatus: Record<string, boolean>` to track which providers have keys configured.

- [ ] **Step 2: Build ProviderVault React component**
  Create `src/components/ProviderVault.tsx` with forms to select a provider, input an API key, call `save_provider_key` command, and list configured keys.

- [ ] **Step 3: Commit**
  ```bash
  git add src/store/workspaceStore.ts src/components/ProviderVault.tsx
  git commit -m "feat: create ProviderVault React UI panel"
  ```

---

### Task 4: UI Assembly & Launcher Configuration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update Right panel selectors and Spawn Form in App.tsx**
  Modify `src/App.tsx`:
  - Upgrading the Split Right Panel options: **Editor**, **Git**, and **Vault**.
  - Modify Spawn Form to let users select agent type (e.g. `bash`, `claude`, `aider`, `gemini`) and provider (e.g. `none`, `anthropic`, `openai`, `gemini`).
  - Trigger `spawn_session` with correct arguments based on dropdown inputs.

- [ ] **Step 2: Verify compilation and build**
  Run: `npm run build`
  Expected: Complete production build compiles cleanly.

- [ ] **Step 3: Commit**
  ```bash
  git add src/App.tsx
  git commit -m "feat: integrate Vault panel and agent launcher in App.tsx"
  ```
