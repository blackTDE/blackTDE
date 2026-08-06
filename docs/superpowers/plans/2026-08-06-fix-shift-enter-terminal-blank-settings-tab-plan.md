# Implementation Plan: Shift+Enter Keybinding, Terminal Blank Screen Fix, and Direct Settings Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Shift+Enter multiline continuation sequence in CLI agent sessions, eliminate blank terminal rendering when switching from Settings or between project windows, and simplify Settings navigation by removing the top bar Settings tab.

**Architecture:**
- Keybinding sequence update in `src/terminalRestore.ts` and `tests/terminalRestore.test.ts`.
- Layout paint delay and canvas refresh in `src/components/TerminalPane.tsx`.
- Settings toggle navigation in `src/App.tsx`.

---

## Task 1: Fix Shift+Enter Multiline Continuation Sequence

**Files:**
- Modify: `src/terminalRestore.ts`
- Modify: `tests/terminalRestore.test.ts`

- [ ] **Step 1: Update modifiedEnterSequence in src/terminalRestore.ts**
  Return `'\x1b\r'` for `Shift+Enter` keydown.

- [ ] **Step 2: Update tests in tests/terminalRestore.test.ts**
  Update assertion for `modifiedEnterSequence` with `'\x1b\r'`.

- [ ] **Step 3: Run tests**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git add src/terminalRestore.ts tests/terminalRestore.test.ts && git commit -m "fix: send escape-return sequence for Shift+Enter multiline input"`

---

## Task 2: Fix Terminal Blank Screen on Visibility Switch

**Files:**
- Modify: `src/components/TerminalPane.tsx`

- [ ] **Step 1: Add layout paint delay & term.refresh in TerminalPane.tsx**
  - Inside `fitAndResize`: add `term.refresh(0, Math.max(0, term.rows - 1))`.
  - In `useEffect([isVisible])`: trigger `fitAndResize` after a 50ms layout stabilization timer.

- [ ] **Step 2: Run frontend build**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run: `git add src/components/TerminalPane.tsx && git commit -m "fix: refresh xterm canvas and delay fit on visibility transition"`

---

## Task 3: Simplify Settings Navigation (Remove Top Bar Settings Tab)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove top bar Settings tab element and isSettingsFatherTabOpen state**
  - Remove `isSettingsFatherTabOpen` state.
  - Update Settings icon button to toggle `activeFatherTabId` between `'settings'` and `activeWorkspace?.id`.
  - Remove `isSettingsFatherTabOpen && (...)` tab element from top bar.

- [ ] **Step 2: Run tests and frontend build**
  Run: `npm test && npm run build`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run: `git add src/App.tsx && git commit -m "refactor: toggle settings directly without creating a top bar tab"`
