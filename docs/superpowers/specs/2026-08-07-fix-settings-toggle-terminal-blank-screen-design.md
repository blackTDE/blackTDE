# Design Specification: Fix Terminal Session Screen Blanking on Settings Toggle

## Root Cause Analysis
1. **DOM Unmounting in `App.tsx`**:
   Previously, when opening the Settings panel (`activeFatherTabId === 'settings'`), `App.tsx` unmounted the entire Workspace Content component tree (`TerminalGrid`, `TerminalPane`, `FilePreview`). Unmounting `TerminalPane` called `term.dispose()`, destroying the active xterm instances and clearing their rendered canvas buffers.
2. **Missing History Replay for Active Non-Local Sessions in `TerminalPane.tsx` & `terminalRestore.ts`**:
   When switching back to the session panel, `TerminalPane` remounted, creating a new `Terminal` instance with an empty buffer. In `terminalRestore.ts`, if `lookupActive` returned `true` (backend PTY process still running), `replayHistory` was skipped (and `replayHistory` was previously guarded by `localShell ?`). As a result, the newly mounted xterm instance remained a blank black screen until a new PTY stdout event or layout reflow occurred (e.g. opening a file preview).

## Fix Strategy

### 1. Preserve Workspace DOM Tree in `src/App.tsx`
- Do not unmount the Workspace Content tree when Settings Panel is open.
- Toggle visibility using CSS (`hidden` when `activeFatherTabId === 'settings'`).
- This preserves all active xterm canvas instances, scrollback buffers, and running code agent interactive UI state without unmounting/re-creating terminals when toggling Settings.

### 2. Universal History Replay on Terminal Mount in `src/terminalRestore.ts` & `src/components/TerminalPane.tsx`
- In `src/terminalRestore.ts`: When `isActive` is `true`, call `actions.replayHistory?.()` so that if a `Terminal` instance is newly initialized, it populates immediately from SQLite `transcripts` history.
- In `src/components/TerminalPane.tsx`: Provide `replayHistory` for all sessions (both local shells and code agent CLI sessions) to ensure instant rendering upon component mount/remount.
