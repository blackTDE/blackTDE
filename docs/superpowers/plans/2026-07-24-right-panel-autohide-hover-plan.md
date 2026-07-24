# Right Panel Auto-Hide & Hover Auto-Show Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the right inspector panel automatically shows up when the mouse moves over any area of the side collapse bar, and automatically hides when the mouse leaves the panel (when unpinned).

**Architecture:**
- **UI (`src/App.tsx`)**: Attach container-level `onMouseEnter` to the collapsed dock bar `<div>` to trigger `setIsRightPaneExpanded(true)` when `!isRightPanelPinned`.
- **Tests (`tests/panelResizeAndAutoContainer.test.ts`)**: Add test verifying right panel pin toggle and state handling.

---

### Task 1: Add Container Hover Trigger to Collapse Dock Bar in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Attach `onMouseEnter` to collapsed dock bar container**

Add container-level `onMouseEnter` to `<div className="w-10 bg-surface-1 ...">`:
```tsx
onMouseEnter={() => {
  if (!isRightPanelPinned) {
    if (activeRightPanel === 'none') {
      setActiveRightPanel('files');
    }
    setIsRightPaneExpanded(true);
  }
}}
```

- [ ] **Step 2: Update unit test `tests/panelResizeAndAutoContainer.test.ts`**

Add tests for right panel pin toggle state.

- [ ] **Step 3: Test and build**

Run `npm run test` and `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx tests/panelResizeAndAutoContainer.test.ts
git commit -m "feat: add container-level hover auto-show to right panel side collapse bar"
```
