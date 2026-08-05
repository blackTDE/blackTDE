# Implementation Plan: System App PATH Resolution, Terminal Glyph Rendering, and Pi / Oh My Pi Agent Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix system app GUI PATH resolution on macOS, fix terminal powerline glyph rendering, and add native support for `pi` and `omp` (Oh My Pi) code agents.

**Architecture:**
- Backend PATH enrichment and locale environment setup in `src-tauri/src/process.rs` and `src-tauri/src/main.rs`.
- xterm.js customGlyphs configuration in `src/components/TerminalPane.tsx`.
- Pi and Oh My Pi agent icon mapping, CLI detection, and session management in `src/agentIcons.ts`, `src/components/AgentIcon.tsx`, `src/App.tsx`, and `src-tauri/src/main.rs`.

**Tech Stack:** Rust, Tauri, TypeScript, React, xterm.js.

---

## Global Constraints
- Commit changes at every step.
- Verify tests after every step.

---

### Task 1: Environment PATH Resolution & UTF-8 Locale Setup in Rust Backend

**Files:**
- Modify: `src-tauri/src/process.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add PATH enrichment and locale setup in process.rs**
  - In `spawn_pty_process`:
    - Ensure `PATH` contains standard user binary paths (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`, `~/.gemini/bin`, `~/.local/bin`, `~/.npm-global/bin`).
    - Resolve relative command names against enriched PATH.
    - Inject `LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8`, and `COLORTERM=truecolor` into PTY command environment.

- [ ] **Step 2: Add resolve_command_path helper in main.rs**
  - Implement `resolve_command_path` in `main.rs` and use it when checking binary existence and spawning sessions.
  - Update `detect_available_clis()` to include `pi`, `omp`, `oh-my-pi` and use enriched PATH search.

- [ ] **Step 3: Run cargo test**
  Run: `cd src-tauri && cargo test`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git add src-tauri/src/process.rs src-tauri/src/main.rs && git commit -m "fix: resolve user PATH and UTF-8 locale in PTY environment"`

---

### Task 2: Fix Terminal Powerline Glyph Rendering in xterm.js

**Files:**
- Modify: `src/components/TerminalPane.tsx`

- [ ] **Step 1: Enable customGlyphs and allowProposedApi in TerminalPane.tsx**
  Add `customGlyphs: true` and `allowProposedApi: true` to xterm initialization options in `src/components/TerminalPane.tsx`.

- [ ] **Step 2: Test frontend build**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run: `git add src/components/TerminalPane.tsx && git commit -m "fix: enable xterm customGlyphs for powerline rendering"`

---

### Task 3: Support `pi` and 'oh my pi' (`omp`) Code Agents

**Files:**
- Modify: `src/agentIcons.ts`
- Modify: `src/components/AgentIcon.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/agentIcons.test.ts`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add icon mapping for pi and omp in agentIcons.ts and AgentIcon.tsx**
  - Add `'pi'` and `'omp'` to `AgentIconKind`.
  - Add `getAgentIconKind` rules for `pi` and `omp`/`oh-my-pi`.
  - Render Pi (`π`) and OMP icons in `AgentIcon.tsx`.

- [ ] **Step 2: Update unit test in tests/agentIcons.test.ts**
  Add assertions for `pi` and `omp`/`oh-my-pi`.

- [ ] **Step 3: Update App.tsx resumableAgents and preset lists**
  Add `'pi'`, `'omp'`, `'oh-my-pi'` to `resumableAgents`.

- [ ] **Step 4: Update main.rs agent session arguments**
  Add `pi` and `omp`/`oh-my-pi` handling in `agent_new_session_args`, `agent_resume_args`, and `privileged_agent_args`.

- [ ] **Step 5: Run tests and frontend build**
  Run: `npm test && npm run build`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add src/agentIcons.ts src/components/AgentIcon.tsx src/App.tsx tests/agentIcons.test.ts src-tauri/src/main.rs && git commit -m "feat: add support for pi and oh my pi code agents"`
