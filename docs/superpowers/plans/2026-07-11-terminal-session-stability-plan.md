# Terminal Session Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the middle workbench gray-black and full-bleed while guaranteeing one local window per remote conversation and stable terminal redraws after session switches.

**Architecture:** Normalize loaded session records before they reach Zustand, enforce pane uniqueness in the shared store action, and branch resume requests to the existing local record instead of spawning a new row. Restore xterm from live PTY state rather than stale transcript control sequences, then flatten the existing center-panel wrappers with neutral design tokens.

**Tech Stack:** React 18, Zustand, TypeScript, xterm.js, Tauri 2, Node 23 built-in test runner, Rust

## Global Constraints

- Replace blue brand accents with graphite `#525252` and light gray `#a1a1a1`.
- Preserve red errors, amber warnings, and green success states.
- Add no dependency and no database migration.
- Keep legacy duplicate database rows; hide them through canonical session loading.
- Limit cleanup to code touched by the requested fixes.

---

### Task 1: Canonical sessions and unique pane assignment

**Files:**
- Create: `src/sessionUtils.ts`
- Create: `tests/sessionUtils.test.ts`
- Create: `tests/workspaceStore.test.ts`
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/components/TerminalGrid.tsx`
- Modify: `src/store/workspaceStore.ts`

**Interfaces:**
- Produces: `dedupeSessions<T extends SessionRecord>(sessions: T[]): T[]`.
- Produces: `getVisiblePaneCount(type: PaneLayout['type']): number`.
- Strengthens: `setPaneSessionId(index, sessionId)` so one session ID appears in at most one pane.

- [x] **Step 1: Add failing regression tests**

Create `tests/sessionUtils.test.ts` with Node's `node:test` and `node:assert/strict`. Test that two Claude rows with the same `cwd`, `agent_type`, and `remote_session_id` collapse to one; an active row wins over a newer terminated row; unrelated shells without remote IDs remain distinct.

Create `tests/workspaceStore.test.ts`, reset `useWorkspaceStore` to a four-slot `1x2` layout, assign `session-a` to pane 0 and then pane 1, and assert the final panes equal `[null, 'session-a', null, null]`. Also assert assigning index 4 leaves the array unchanged.

Add this script to `package.json`:

```json
"test": "node --test --experimental-strip-types tests/*.test.ts"
```

- [x] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because `src/sessionUtils.ts` and the pane invariant do not exist yet.

- [x] **Step 3: Implement canonical session loading**

Create `src/sessionUtils.ts` with:

```ts
export interface SessionRecord {
  id: string;
  agent_type: string;
  cwd: string;
  remote_session_id?: string | null;
  status?: string;
}

export const dedupeSessions = <T extends SessionRecord>(sessions: T[]): T[] => {
  const canonical = new Map<string, T>();

  for (const session of sessions) {
    const remoteId = session.remote_session_id?.trim();
    const key = remoteId
      ? `${session.cwd}\u0000${session.agent_type}\u0000${remoteId}`
      : `local\u0000${session.id}`;
    const existing = canonical.get(key);

    if (!existing || (existing.status !== 'active' && session.status === 'active')) {
      canonical.set(key, session);
    }
  }

  return [...canonical.values()];
};
```

In `loadPastSessions`, call `dedupeSessions(list)` once and use that canonical list for both `pastSessions` and the Zustand session map.

Change the resume selector value from `s.remote_session_id` to `s.id`. In `handleCreateSession`, if a recorded local ID is selected, close the modal and call `handleSelectSession` for that existing row without invoking `spawn_session`. New sessions continue through the existing spawn path with `resumeSessionId: null`.

- [x] **Step 4: Enforce pane uniqueness in the shared store**

Export `getVisiblePaneCount` from `src/store/workspaceStore.ts` and remove the duplicate implementations from `App.tsx` and `TerminalGrid.tsx`.

Change `setPaneSessionId` to return unchanged state for indexes outside `0..3`; otherwise map every matching session ID in existing panes to `null` before assigning the target index. Keep the existing per-workspace persistence update.

- [x] **Step 5: Run regression tests and build**

Run: `npm test`

Expected: 2 test files pass with no failures.

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

- [x] **Step 6: Commit canonical session behavior**

```bash
git add package.json src/sessionUtils.ts tests src/App.tsx src/components/TerminalGrid.tsx src/store/workspaceStore.ts
git commit -m "Prevent duplicate resumed sessions"
```

### Task 2: Restore terminals from live PTY state

**Files:**
- Create: `src/terminalRestore.ts`
- Create: `tests/terminalRestore.test.ts`
- Modify: `src/components/TerminalPane.tsx`

**Interfaces:**
- Consumes: `list_active_session_ids`, `resize_session`, `write_to_session`, `resume_terminated_session`, and `get_session_history` Tauri commands.
- Invariant: active session remounts send `[12]` to the PTY and never replay transcript bytes.

- [x] **Step 1: Reorder terminal initialization around the event listener**

Keep `isReady = false` and `incomingQueue`. Register `listen('tde-event', ...)` before starting restoration. Queue matching stdout while not ready; write it directly afterward.

Extract one local `fitAndResize()` function that calls `fitAddon.fit()` and invokes `resize_session` only when rows and columns exceed 2. Reuse it in the resize observer, delayed initial fit, and restore flow.

- [x] **Step 2: Implement active-session redraw**

After the listener is registered, invoke `list_active_session_ids`.

For an active session:

```ts
fitAndResize();
isReady = true;
flushIncoming();
await invoke('write_to_session', { id: sessionId, data: [12] });
```

Do not invoke `get_session_history` on this path.

For a terminated session, reset xterm, display one reconnect message, invoke `resume_terminated_session`, fit and resize, mark ready, flush queued output, then send `[12]` for the resumed application to redraw.

If active-session lookup fails, invoke `get_session_history`, write it once, mark ready, and flush queued output without calling resume. Keep the existing visible resume error message and console logging.

- [x] **Step 3: Verify terminal restoration statically and through build**

Run: `rg -n "get_session_history|data: \[12\]|list_active_session_ids|resume_terminated_session" src/components/TerminalPane.tsx`

Expected: history exists only in the lookup-error fallback; `[12]` exists on active and resumed paths.

Run: `npm test && npm run build`

Expected: regression tests and frontend build pass.

- [x] **Step 4: Commit stable terminal restoration**

```bash
git add src/components/TerminalPane.tsx src/terminalRestore.ts tests/terminalRestore.test.ts
git commit -m "Redraw active terminals after switching"
```

### Task 3: Flatten and neutralize the workbench

**Files:**
- Delete: `src/components/EditorPane.tsx`
- Modify: `tailwind.config.js`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/components/TerminalPane.tsx`
- Modify: `src/components/TerminalGrid.tsx`
- Modify: `src/components/FilePreview.tsx`
- Modify: `src/components/GitDiffCompare.tsx`

**Interfaces:**
- Preserves: current terminal split selector and file/diff routing.
- Produces: a full-width, full-height center content surface with neutral selection states.

- [x] **Step 1: Replace blue tokens and direct blue styles**

Set Tailwind `brand.DEFAULT` to `#525252` and `brand.light` to `#a1a1a1`. Set `--primary` to `#737373`. In xterm, set the cursor to `#e5e5e5` and ANSI blue to `#a1a1a1`. Replace `text-blue-400` document icons with `text-zinc-400`.

- [x] **Step 2: Make the terminal grid full-bleed**

Replace `TerminalGrid`'s four duplicated layout returns with one CSS grid whose columns/rows derive from the selected layout, uses `gap-px bg-surface-2`, and has no outer padding.

Remove active `border-brand`, `shadow-brand`, blue header background, pulse animation, rounded outer cell, and transition. Use neutral `border-surface-2`, `bg-surface-1`, and `bg-zinc-400` states.

Change `TerminalPane`'s root to:

```tsx
<div className="w-full h-full min-h-0 bg-[#0a0a0a] overflow-hidden">
  <div ref={containerRef} className="w-full h-full min-h-0" />
</div>
```

- [x] **Step 3: Make file and diff views full-bleed**

In `App.tsx`, remove the conditional `p-4` from the tab content area. In `FilePreview` and `GitDiffCompare`, remove outer rounded corners, border, shadow, and fixed `min-h-[300px]` body constraints while retaining toolbar separators and `min-h-0` flex behavior.

- [x] **Step 4: Remove dead editor code and scan for blue**

Delete `src/components/EditorPane.tsx`, which has no imports or callers.

Run: `rg -n "#1447e6|#3794ff|text-blue|bg-blue|border-blue|border-brand shadow|shadow-brand" src tailwind.config.js`

Expected: no visual blue tokens or active blue terminal framing remain.

- [x] **Step 5: Verify all builds and tests**

Run: `npm test`

Expected: all Node regression tests pass.

Run: `npm run build`

Expected: frontend build succeeds.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: Rust test suite passes.

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 6: Commit the full-bleed gray workbench**

```bash
git add src tailwind.config.js
git commit -m "Flatten gray terminal workbench"
```
