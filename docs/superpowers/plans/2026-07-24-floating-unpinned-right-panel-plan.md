# Floating Unpinned Right Panel Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the unpinned Right Inspector Panel to float over the base workspace layout as an absolute drawer overlay, so expanding it on hover/click does not resize or reflow the base workbench layout.

**Architecture:**
- **UI (`src/App.tsx`)**:
  - Add `relative` positioning to the main workspace container (`<div className="flex flex-1 min-h-0 w-full overflow-hidden relative">`).
  - Update Right Panel container classes to use `absolute right-0 top-0 bottom-0 z-30 shadow-2xl` when `!isRightPanelPinned`.
  - Add floating resizer handle on the left edge of the unpinned floating drawer.

---

### Task 1: Update Right Panel Container & Resizer in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Ensure main workspace container has `relative` positioning**

- [ ] **Step 2: Update Right Panel container JSX to float when unpinned**

Apply `absolute right-0 top-0 bottom-0 z-30 shadow-2xl` when `!isRightPanelPinned`, and `shrink-0 z-10` when `isRightPanelPinned`.

- [ ] **Step 3: Add left-edge floating resizer handle when unpinned**

Add `<div onMouseDown={handleRightResizeStart} className="absolute left-0 top-0 bottom-0 w-1.5 ...">` inside the unpinned floating panel.

- [ ] **Step 4: Run `npm run test` and `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: float unpinned right panel overlay without altering base workbench layout size"
```
