# Right Panel Auto-Hide & Hover Auto-Show Design Spec

## Executive Summary
This spec details the enhancement to the Right Inspector Panel's auto-hide functionality. When the panel is collapsed or unpinned (`isRightPanelPinned = false`), moving the mouse anywhere over the side collapse bar automatically triggers the panel to reveal (`auto showup`), and moving the mouse off the expanded panel automatically collapses it (`auto-hide`).

---

## 1. User Intent & Problem Statement
- **Request**: "right tabs panel add auto-hide feature, if mouse move on the side collapse bar it can auto showup"
- **Behavior Requirements**:
  1. Hovering over the side collapse dock bar (`onMouseEnter`) when unpinned automatically expands the right panel (`isRightPaneExpanded = true`).
  2. Leaving the expanded right panel (`onMouseLeave`) when unpinned automatically hides the panel (`isRightPaneExpanded = false`).
  3. When pinned (`isRightPanelPinned = true`), auto-hide is disabled and panel remains open.

---

## 2. Component Design (`src/App.tsx`)

### Collapse Bar Container (`!isRightPaneExpanded`)
- Attach `onMouseEnter` event to the collapse bar root container `<div className="w-10 bg-surface-1 ...">`.
- When hovered:
  - If `!isRightPanelPinned`: set `isRightPaneExpanded = true`.
  - If `activeRightPanel === 'none'`, fallback to default `'files'`.

### Expanded Right Panel (`isRightPaneExpanded`)
- `onMouseLeave` on the expanded container `<div className="shrink-0 border-l ...">`:
  - If `!isRightPanelPinned`: set `isRightPaneExpanded = false`.

---

## 3. Verification Strategy
- Run unit test suite: `npm run test`.
- Run production build: `npm run build`.
- Run backend test suite: `cargo test`.
