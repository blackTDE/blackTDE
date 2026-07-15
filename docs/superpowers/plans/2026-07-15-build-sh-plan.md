# build.sh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `build.sh` script to compile the Tauri project for multiple architectures (Universal, Apple Silicon, Intel) on macOS, outputting the desktop packages to `build-dist/desktop/` and the static web frontend app to `build-dist/web/`. It also ensures `build-dist/` is ignored in `.gitignore`.

**Architecture:** A shell script `build.sh` that checks/installs compilation targets, runs the standard npm and cargo tauri builds for `aarch64`, `x86_64`, and `universal` targets, creates the `build-dist/` structure, copies build artifacts, and updates `.gitignore`.

**Tech Stack:** Bash shell script, Node.js/npm, Rust/Cargo, Tauri CLI.

## Global Constraints
- Commit changes at every step (User Rule 1).
- Shell script must be runnable on macOS and have `chmod +x` permissions.

---

### Task 1: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Edit .gitignore to ignore build-dist/**

  Add `build-dist/` line at the end of `.gitignore`.

- [ ] **Step 2: Verify git status ignores build-dist/**

  Run: `mkdir -p build-dist/test && touch build-dist/test/dummy && git status`
  Expected: `build-dist/` does not appear as an untracked directory in git status.

- [ ] **Step 3: Clean up dummy directory**

  Run: `rm -rf build-dist/`

- [ ] **Step 4: Commit .gitignore change**

  Run: `git add .gitignore && git commit -m "chore: add build-dist to .gitignore"`

---

### Task 2: Create the build.sh script

**Files:**
- Create: `build.sh`

- [ ] **Step 1: Write the build.sh file**

  Create a `build.sh` file with full checking and build functionality.

- [ ] **Step 2: Make the script executable**

  Run: `chmod +x build.sh`

- [ ] **Step 3: Verify the script syntax**

  Run: `bash -n build.sh`
  Expected: No syntax errors.

- [ ] **Step 4: Commit build.sh creation**

  Run: `git add build.sh && git commit -m "feat: add build.sh compilation script"`

---

### Task 3: Test and Verify Build Execution

**Files:**
- Modify: `build.sh` (if fixes needed)

- [ ] **Step 1: Execute build.sh**

  Run: `./build.sh`
  Expected: Script runs, frontend compiles, Tauri builds architectures (aarch64-apple-darwin, x86_64-apple-darwin, and universal-apple-darwin), and outputs files successfully to `build-dist/`.

- [ ] **Step 2: Check target files**

  Run: `ls -la build-dist/web/ && ls -la build-dist/desktop/`
  Expected: `build-dist/web/` contains `index.html` and assets. `build-dist/desktop/` contains `.app` and `.dmg` installers.

- [ ] **Step 3: Run git status verification**

  Run: `git status`
  Expected: `build-dist/` is not listed in untracked files.
