# Streamlined Session Toolbar Design Spec

## Executive Summary
This design spec outlines the UI refactoring for the Terminal Session Panel headline toolbar. The objective is to eliminate redundant labels, collapse layout split controls into a compact dropdown menu, streamline the pin action button, and maximize horizontal room for displaying active session tabs.

---

## 1. User Intent & Problem Statement
- **Current Issue**: The session panel header contains verbose text (`PTY SESSIONS:` label, `📌 PINNED | SPLIT: 1x1 1x2 2x1 2x2` buttons side-by-side). This consumes ~380px of static width, causing session tabs to be cramped and truncated.
- **Goal**:
  - Remove/narrow redundant text ("PTY SESSIONS:").
  - Collapse individual `1x1`, `1x2`, `2x1`, `2x2` split buttons into a single compact dropdown (`LayoutGrid` icon + `{paneLayout.type}` + `ChevronDown`).
  - Streamline the `PIN` toggle button to a compact icon button with tooltip.
  - Reallocate ~290px of freed horizontal space directly to the active session tabs container.

---

## 2. Component Design & Layout Breakdown (`src/App.tsx`)

### A. Left Section (Session Tabs Container)
- **Compact Icon**: Replace `PTY SESSIONS:` text with `<SquareTerminal size={14} className="text-brand-light shrink-0" title="Active Terminal Sessions" />`.
- **Session Tabs List**: Container set to `flex-1 flex items-center space-x-1.5 overflow-x-auto scrollbar-none min-w-0`.
- **Session Tab Pills**: Styled pills with agent icon, session name, and close button.
- **New Session Trigger**: Compact `[ + ]` button.

### B. Right Controls Section
- **Compact Pin Toggle**: `<button onClick={toggleSessionPin} className="..." title={isSessionPinned ? "Unpin Sessions Panel" : "Pin Sessions Panel to Left"}><Pin size={11} className={isSessionPinned ? "rotate-45 text-brand-light" : ""} /></button>`
- **Split Layout Dropdown**: `<div className="relative">` containing a button `<LayoutGrid size={11} /> <span>{paneLayout.type}</span> <ChevronDown size={10} />` which toggles a floating menu for selecting `1x1`, `1x2`, `2x1`, `2x2`.

---

## 3. Verification Strategy
- Verify React build using `npm run build`.
- Run unit test suite `npm run test`.
- Run backend tests `cargo test`.
