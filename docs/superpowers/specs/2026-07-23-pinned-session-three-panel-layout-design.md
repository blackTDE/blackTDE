# Pinned Session Three-Panel Layout Design Spec

## Executive Summary
This spec outlines the design for pinning the PTY Terminal Sessions panel to the left side of the workspace center area. When pinned, terminal sessions and open file preview/editor windows can be displayed side-by-side concurrently, forming a flexible 3-panel layout.

---

## 1. Requirement & User Intent
- **Goal**: Enable users to pin the terminal sessions view to the left side of the workbench so they can view/edit files and monitor AI coding agent terminal output simultaneously.
- **Visual Structure**:
  - Panel 1 (Left Sidebar): Project Tree / Workspace Navigation
  - Panel 2 (Workbench Left): Pinned Terminal Sessions Grid & Toolbar
  - Panel 3 (Workbench Right): Active File Preview / Editor / Git Diff
  - Panel 4 (Right Sidebar): Inspector (Files, Git, Search, Skills)

---

## 2. Store & State Management (`src/store/workspaceStore.ts`)
- Add state property `isSessionPinned: boolean` (default: `false`).
- Add action `setSessionPinned: (pinned: boolean) => void`.
- Add action `toggleSessionPin: () => void`.
- Add `isSessionPinned` to Zustand `partialize` configuration to persist user preferences.

---

## 3. UI & Interaction Design (`src/App.tsx`)

### A. Level 2 Header (`sessions` tab)
- Display a Pin button icon (`Pin` from `lucide-react`) directly on/next to the `sessions` tab in Level 2 header.
- When `isSessionPinned` is `true`, highlight the pin icon in brand accent color and show a `Pinned` badge indicator.
- Clicking the Pin icon toggles `isSessionPinned`.

### B. Terminal Toolbar Integration
- Add a "Pin to Left" button in the Terminal Toolbar next to the SPLIT buttons.

### C. Workbench Center Layout
- **Case 1: `activeFileTab === null`**:
  - Terminal Sessions Grid fills 100% width of the workbench.
- **Case 2: `activeFileTab !== null` AND `isSessionPinned === true`**:
  - Workbench splits into two side-by-side flex panes:
    - **Left Pane (`w-1/2` or flex-1, `border-r border-surface-2`)**: Terminal toolbar + `TerminalGrid`.
    - **Right Pane (`w-1/2` or flex-1)**: Active `FilePreview` or `GitDiffCompare`.
- **Case 3: `activeFileTab !== null` AND `isSessionPinned === false`**:
  - `FilePreview` or `GitDiffCompare` fills 100% width of the workbench (standard tabbed view).

---

## 4. Verification Strategy
- Add store unit tests in `tests/sessionPin.test.ts` to verify `isSessionPinned` state toggling.
- Verify component build using `npm run build`.
- Verify backend tests using `cargo test`.
