# Panel Manual Resizing & Right Panel Auto-Hide Design Spec

## Executive Summary
This design spec defines the architecture for manual panel resizing (dragging split borders between Left Sidebar, Pinned Sessions, File Preview, and Right Inspector) and Right Panel Pin / Auto-Hide functionality.

---

## 1. Feature Specifications

### A. Manual Panel Resizing
- **Left Sidebar Resizing**: User can drag the vertical divider between Left Sidebar and Center Workbench. Min width: `200px`, max width: `600px`, default: `320px`.
- **Pinned Terminal Split Resizing**: When `isSessionPinned` is `true` and a file preview tab is open, user can drag the vertical divider between Terminal Sessions and File Preview. Min percent: `20%`, max percent: `80%`, default: `50%`.
- **Right Inspector Resizing**: User can drag the vertical divider between Center Workbench and Right Inspector panel. Min width: `240px`, max width: `600px`, default: `320px`.

### B. Right Panel Pin & Auto-Hide
- **Pinned Mode (`isRightPanelPinned = true`)**: Panel remains fixed in the layout as a docked column.
- **Auto-Hide Mode (`isRightPanelPinned = false`)**: Panel auto-hides when mouse leaves (`onMouseLeave`) or when deactivated. A thin vertical trigger bar on the right edge allows expanding the panel on hover or click.
- **Header Pin Toggle**: Pin button icon on Right Inspector header allows toggling between Pinned and Auto-Hide modes.

---

## 2. Store State Management (`src/store/workspaceStore.ts`)
- `leftPanelWidth: number` (default `320`)
- `rightPanelWidth: number` (default `320`)
- `pinnedSessionWidthPercent: number` (default `50`)
- `isRightPanelPinned: boolean` (default `true`)
- Actions:
  - `setLeftPanelWidth: (width: number) => void`
  - `setRightPanelWidth: (width: number) => void`
  - `setPinnedSessionWidthPercent: (percent: number) => void`
  - `setRightPanelPinned: (pinned: boolean) => void`
  - `toggleRightPanelPin: () => void`
- Add these properties to `partialize` for persistent layout preferences.

---

## 3. UI Component Architecture (`src/App.tsx`)

### Divider Handles
- Styled `w-1.5 hover:w-1.5 cursor-col-resize bg-surface-2/40 hover:bg-brand/60 transition-colors z-20` handles between panels.
- Attached `onMouseDown` handlers with window `mousemove` and `mouseup` listeners.

### Auto-Hide Right Dock
- A compact vertical bar (`w-9 bg-surface-1 border-l border-surface-2 flex flex-col items-center py-2 space-y-3`) displayed when Right Panel is collapsed/auto-hidden.
- Contains tab icon buttons (`Folder`, `GitBranch`, `Search`, `Sparkles`). Hovering/clicking expands the inspector drawer.

---

## 4. Verification Strategy
- Add unit test `tests/panelResizeAndAutoContainer.test.ts` for store width and pin actions.
- Run `npm run test` & `npm run build`.
- Run `cargo test`.
