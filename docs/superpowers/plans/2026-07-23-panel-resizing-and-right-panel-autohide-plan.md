# Panel Manual Resizing & Right Panel Auto-Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive mouse drag resizing for layout panels and add Pin / Auto-Hide capabilities to the Right Inspector Panel.

**Architecture:**
- **Store (`src/store/workspaceStore.ts`)**: Add state for `leftPanelWidth`, `rightPanelWidth`, `pinnedSessionWidthPercent`, `isRightPanelPinned`, actions, and update `partialize`.
- **Tests (`tests/panelResizeAndAutoContainer.test.ts`)**: Add unit test for width and right panel pin actions.
- **UI (`src/App.tsx`)**: Implement draggable resize dividers (`onMouseDown`) and integrate Right Panel Pin toggle & auto-hide dock trigger.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Lucide icons.

## Global Constraints
- Preserve layout responsiveness and smooth mouse drag handlers.
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Store State & Unit Tests for Panel Widths & Right Panel Pin

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `tests/panelResizeAndAutoContainer.test.ts`

- [ ] **Step 1: Create `tests/panelResizeAndAutoContainer.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore.ts';

test('manages panel widths and right panel pin state', () => {
  const store = useWorkspaceStore.getState();
  assert.equal(store.leftPanelWidth, 320);
  assert.equal(store.rightPanelWidth, 320);
  assert.equal(store.pinnedSessionWidthPercent, 50);
  assert.equal(store.isRightPanelPinned, true);

  store.setLeftPanelWidth(400);
  assert.equal(useWorkspaceStore.getState().leftPanelWidth, 400);

  store.setRightPanelWidth(350);
  assert.equal(useWorkspaceStore.getState().rightPanelWidth, 350);

  store.setPinnedSessionWidthPercent(60);
  assert.equal(useWorkspaceStore.getState().pinnedSessionWidthPercent, 60);

  store.toggleRightPanelPin();
  assert.equal(useWorkspaceStore.getState().isRightPanelPinned, false);
});
```

- [ ] **Step 2: Update `src/store/workspaceStore.ts`**

Add properties and actions:
- `leftPanelWidth: number`
- `rightPanelWidth: number`
- `pinnedSessionWidthPercent: number`
- `isRightPanelPinned: boolean`
- `setLeftPanelWidth: (w: number) => void`
- `setRightPanelWidth: (w: number) => void`
- `setPinnedSessionWidthPercent: (p: number) => void`
- `setRightPanelPinned: (pinned: boolean) => void`
- `toggleRightPanelPin: () => void`

And include them in `partialize`.

- [ ] **Step 3: Run `npm run test`**

- [ ] **Step 4: Commit**

```bash
git add src/store/workspaceStore.ts tests/panelResizeAndAutoContainer.test.ts
git commit -m "feat: add panel width and right panel pin state to workspaceStore"
```

---

### Task 2: Draggable Resizer Dividers in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Destructure width states and setters in `src/App.tsx`**

- [ ] **Step 2: Add mouse drag handlers in `src/App.tsx`**

Implement `handleLeftResizeStart`, `handleRightResizeStart`, `handleCenterSplitResizeStart`.

- [ ] **Step 3: Insert divider handles in layout in `src/App.tsx`**

1. Between Left Panel and Center Workbench.
2. Between Pinned Session and File Preview in Center Workbench.
3. Between Center Workbench and Right Panel.

- [ ] **Step 4: Run `npm run test` and `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add draggable resizer dividers for left, center split, and right panels"
```

---

### Task 3: Right Panel Pin & Auto-Hide Integration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add Pin button to Right Panel header in `src/App.tsx`**

Add `<button onClick={toggleRightPanelPin} ...><Pin size={13} className={isRightPanelPinned ? "rotate-45 text-brand-light" : "text-zinc-500"} /></button>`.

- [ ] **Step 2: Add auto-hide mouseleave & collapsed vertical dock bar in `src/App.tsx`**

When `isRightPanelPinned` is false, hide inspector on mouse leave, and display compact vertical dock bar on right edge allowing click/hover to expand.

- [ ] **Step 3: Run full verification suite (`npm run test && npm run build && cargo test`)**

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add right panel pin toggle and auto-hide right dock bar"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Manual resizing for all panels -> Task 2.
   - Right panel pin & auto-hide -> Task 3.
2. **No Placeholders**: Explicit code steps included.
