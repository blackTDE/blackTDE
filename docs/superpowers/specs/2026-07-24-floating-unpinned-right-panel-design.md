# Floating Unpinned Right Panel Design Spec

## Executive Summary
This design spec details the floating overlay architecture for the Right Inspector Panel when in auto expand/collapse mode (`isRightPanelPinned = false`). Expanding the unpinned right panel on hover/click floats it as an overlay without altering or shrinking the base workbench layout size.

---

## 1. User Intent & Problem Statement
- **Request**: "if the right panel is in auto expand/collapse mode, when it expand showup do not adjust the current panel layout size, like the right float on the base layout"
- **Current Issue**: When unpinned, expanding the right panel currently shrinks the Center Workbench grid, causing PTY terminals and file preview windows to reflow.
- **Goal**:
  - In **Auto Expand/Collapse (Unpinned)** mode (`!isRightPanelPinned`): render the expanded panel as an absolute floating drawer (`absolute right-0 top-0 bottom-0 z-30 shadow-2xl`). The base workbench layout retains 100% of its size without layout shifting.
  - In **Pinned** mode (`isRightPanelPinned`): render the panel inline within flex flow (`shrink-0 border-l`), retaining fixed grid layout behavior.

---

## 2. Technical Design (`src/App.tsx`)

### Layout Container Context
- Ensure main flex container has `relative` positioning (`<div className="flex flex-1 min-h-0 w-full overflow-hidden relative">`).

### Right Panel Conditional Styling
```tsx
<div
  style={{ width: `${rightPanelWidth}px` }}
  onMouseLeave={() => {
    if (!isRightPanelPinned) {
      setIsRightPaneExpanded(false);
    }
  }}
  className={`bg-surface-1 flex flex-col overflow-hidden transition-all border-l border-surface-2 ${
    isRightPanelPinned
      ? 'shrink-0 z-10'
      : 'absolute right-0 top-0 bottom-0 z-30 shadow-2xl'
  }`}
>
```

### Resizer Handle
- Pinned Mode: Inline flex resizer divider (`shrink-0`).
- Unpinned Mode: Left edge overlay resizer handle (`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize`).

---

## 3. Verification Strategy
- Run unit test suite: `npm run test`.
- Run Vite production build: `npm run build`.
- Run Rust backend tests: `cargo test`.
