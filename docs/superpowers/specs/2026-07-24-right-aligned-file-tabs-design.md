# Right-Aligned File Tabs Design Spec

## Executive Summary
This design spec outlines the UI layout refactoring for Level 2 child tabs (`src/App.tsx`). When the terminal session panel is pinned to the left (`isSessionPinned = true`) and a file preview tab is active, the opened file tabs in the Level 2 header bar align directly over the right file preview window (starting at `pinnedSessionWidthPercent%` or aligned with the right pane). When unpinned (`isSessionPinned = false`), tabs flow sequentially from left to right.

---

## 1. User Intent & Problem Statement
- **Problem**: Previously, when the session panel was pinned to the left (occupying the left 50% of the screen), opened file tabs (`jp-home.yaml`, `clash_party_override.yaml`) sat on the far left directly over the terminal sessions pane, creating a visual mismatch with the file preview window on the right.
- **Goal**: Right-align/position opened file tabs over the right file preview window when `isSessionPinned = true`, creating direct spatial alignment between the tabs and the right file window below.

---

## 2. Technical Design (`src/App.tsx`)

### Level 2 Header Structure (`isSessionPinned = true` vs `isSessionPinned = false`)

```tsx
{/* Level 2: Child Tabs (sessions and open files) */}
<div className="shrink-0 flex items-center border-b border-surface-2 bg-[#171717] select-none min-w-0">
  {/* Left Section: Sessions Tab */}
  <div
    style={{
      width: isSessionPinned && activeFileTab !== null ? `${pinnedSessionWidthPercent}%` : 'auto'
    }}
    className={`flex items-center border-r border-surface-2 bg-[#171717] shrink-0 border-b-2 transition group ${
      activeFileTab === null
        ? 'border-b-brand text-zinc-100'
        : 'border-b-transparent text-zinc-500 hover:text-zinc-350'
    }`}
  >
    <button
      onClick={() => setActiveFileTab(null)}
      className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold"
    >
      <SquareTerminal size={13} className={activeFileTab === null ? 'text-brand-light' : 'text-zinc-500'} />
      <span className="font-mono">sessions</span>
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleSessionPin();
      }}
      className={`mr-2 p-1 rounded hover:bg-surface-3 transition cursor-pointer ${
        isSessionPinned
          ? 'text-brand-light bg-brand/15'
          : 'text-zinc-550 opacity-60 group-hover:opacity-100 hover:text-zinc-200'
      }`}
      title={isSessionPinned ? "Unpin Terminal Sessions from Left Side" : "Pin Terminal Sessions to Left Side"}
    >
      <Pin size={11} className={isSessionPinned ? 'rotate-45 text-brand-light' : ''} />
    </button>
  </div>

  {/* Right Section: Opened File Tabs */}
  <div className="flex-1 flex items-center overflow-x-auto scrollbar-none min-w-0">
    {openFiles.map(f => {
      const isGitDiff = f.path.startsWith('git-diff:');
      const displayName = isGitDiff ? `Diff: ${f.name}` : f.name;
      return (
        <div
          key={f.path}
          className={`flex items-center space-x-1 border-r border-surface-2 border-b-2 transition shrink-0 ${
            activeFileTab === f.path
              ? 'border-brand text-zinc-100 bg-surface/40'
              : 'border-transparent text-zinc-550 hover:text-zinc-350 hover:bg-surface-2/10'
          }`}
        >
          <button
            onClick={() => setActiveFileTab(f.path)}
            className="px-3 py-2 text-xs font-mono font-medium truncate max-w-[160px]"
            title={displayName}
          >
            {displayName}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeFile(f.path);
            }}
            className="pr-2.5 text-zinc-650 hover:text-rose-450 transition cursor-pointer"
          >
            <X size={10} />
          </button>
        </div>
      );
    })}
  </div>
</div>
```

---

## 3. Benefits & Aesthetics
- When `isSessionPinned = true` and `activeFileTab !== null`:
  - `sessions` tab area matches `pinnedSessionWidthPercent%` on the left directly above the PTY sessions panel.
  - File tabs container matches `100 - pinnedSessionWidthPercent%` starting directly over the file preview pane on the right.
- When `isSessionPinned = false`:
  - `sessions` tab shrinks to `auto` and file tabs flow immediately to its right.

---

## 4. Verification Strategy
- Run unit test suite `npm run test`.
- Run production build `npm run build`.
- Run backend tests `cargo test`.
