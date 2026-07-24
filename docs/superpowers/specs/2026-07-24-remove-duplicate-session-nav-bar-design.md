# Remove Duplicate Session Nav Bar Design Spec

## Executive Summary
This design spec outlines the removal of the duplicate Level 2 `sessions` tab bar when the Terminal Sessions panel is pinned (`isSessionPinned = true`). This eliminates redundant stacked headers and reclaims vertical screen space.

---

## 1. User Intent & Problem Statement
- **Problem**: When the session panel is pinned to the left, two stacked session toolbars are rendered above each other:
  1. Top Level 2 header bar: `[ >_ sessions 📌 ]`
  2. Lower Terminal Sessions toolbar: `[ >_ ] [ agy (tr9q) x ] [ + ] [ 📌 ] [ 🗂️ 1x1 ▾ ]`
  This creates visual duplication and wastes vertical screen real estate.
- **Goal**:
  - When `isSessionPinned = true`: Hide the duplicate Level 2 `sessions` tab header. The Level 2 header displays only the opened file tabs (`jp-home.yaml`, etc.), while the pinned Terminal Sessions pane uses its dedicated toolbar below.
  - When `isSessionPinned = false`: Render the Level 2 `sessions` tab (`[ >_ sessions 📌 ]`) so users can switch between terminal full view and file tabs or pin the panel back.

---

## 2. Technical Design (`src/App.tsx`)

### Level 2 Header JSX
```tsx
{/* Level 2: Child Tabs (sessions and open files) */}
<div className="shrink-0 flex items-center border-b border-surface-2 bg-[#171717] select-none min-w-0">
  {/* Sessions Tab - Rendered on Level 2 only when NOT pinned */}
  {!isSessionPinned && (
    <div
      className={`flex items-center justify-between border-r border-surface-2 bg-[#171717] shrink-0 border-b-2 transition group ${
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
        className="mr-2 p-1 rounded hover:bg-surface-3 transition cursor-pointer text-zinc-550 opacity-60 group-hover:opacity-100 hover:text-zinc-200"
        title="Pin Terminal Sessions to Left Side"
      >
        <Pin size={11} />
      </button>
    </div>
  )}

  {/* Opened File Tabs */}
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

## 3. Verification Strategy
- Run unit test suite: `npm run test`.
- Run production build: `npm run build`.
- Run backend tests: `cargo test`.
