# Design Specification: Shift+Enter Keybinding, Terminal Blank Screen Fix, and Direct Settings Navigation

## 1. Shift+Enter Multiline Continuation Fix

### Issue Analysis
When pressing `Shift+Enter` inside an interactive CLI agent session (e.g. Claude Code, agy, pi, omp), the terminal submitted the prompt instead of inserting a newline.
In Node.js readline / Ink / PTY raw mode, single LF (`\n` / `0x0A`) and CR (`\r` / `0x0D`) are both parsed as input submit. Standard terminal emulators send `\x1b\r` (Escape + Return) for `Shift+Enter`, which sets `key.meta = true` in terminal parsers, instructing CLI frameworks (Ink, prompt_toolkit, readline) to insert a newline instead of submitting.

### Solution
- Update `modifiedEnterSequence` in `src/terminalRestore.ts` to return `'\x1b\r'` on `Shift+Enter` keydown.
- Update unit tests in `tests/terminalRestore.test.ts` to assert `'\x1b\r'`.

---

## 2. Terminal Blank Screen Fix on Window / Tab Switching

### Issue Analysis
When switching to the Settings page and back to a project window (or switching project tabs), the terminal pane DOM was unmounted/hidden (`display: none`). Upon switching back, xterm.js fit calculations ran before the DOM layout paint finished, leaving the canvas buffer unrendered (blank screen) until `Ctrl+L` (`\x0c`) forced a full redraw.

### Solution
- In `src/components/TerminalPane.tsx`:
  - When `isVisible` transitions to `true`, schedule `fitAndResize` using a short timeout (`50ms`) to allow DOM bounds to calculate.
  - Call `term.refresh(0, Math.max(0, term.rows - 1))` inside `fitAndResize` to force an immediate xterm canvas redraw.

---

## 3. Direct Settings Navigation (Remove Top Bar Settings Tab)

### Issue Analysis
Clicking the Settings icon previously opened an additional tab `[ ⚙️ Settings X ]` in the top workspace tab bar.

### Solution
- In `src/App.tsx`:
  - Remove `isSettingsFatherTabOpen` state and the conditional `[ ⚙️ Settings X ]` tab element from the top tab bar.
  - Clicking the left Settings icon button toggles `activeFatherTabId` between `'settings'` and the current `activeWorkspace.id`.
  - When Settings is active, the Settings icon is highlighted; clicking any project tab or the Settings icon again returns directly to the workspace view.
