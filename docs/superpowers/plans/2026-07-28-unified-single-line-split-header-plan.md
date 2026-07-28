# Unified Single-Line Split Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the top Level 2 header bar in `src/App.tsx` into a unified single horizontal line split into two width-aligned parts: Left part for PTY session tabs/controls (width: `pinnedSessionWidthPercent%`), and Right part for opened file tabs. Remove the duplicate secondary toolbar in the Terminal Sessions view below.

**Architecture:**
- **UI (`src/App.tsx`)**: Render PTY session tabs and controls on the left side of the top Level 2 header, with dynamic width matching `pinnedSessionWidthPercent%` when pinned. Remove the secondary `Clean Terminal Toolbar` inside `Terminal Sessions View`.

---

### Task 1: Refactor Header Bar and Remove Secondary Terminal Toolbar in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Move Terminal session tabs & controls into Left Part of Level 2 Header**

Set `style={{ width: isSessionPinned && activeFileTab !== null ? `${pinnedSessionWidthPercent}%` : 'auto' }}` on the Left Part.

- [ ] **Step 2: Place opened file tabs in Right Part of Level 2 Header**

Set `className="flex-1 flex items-center overflow-x-auto scrollbar-none min-w-0"` on the Right Part.

- [ ] **Step 3: Remove secondary toolbar from Terminal Sessions View**

Remove duplicate `<div className="shrink-0 bg-surface-1 border-b ...">` inside the Terminal Sessions container.

- [ ] **Step 4: Run `npm run test` and `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: unify session and file tabs on a single split header row matching pane widths"
```
