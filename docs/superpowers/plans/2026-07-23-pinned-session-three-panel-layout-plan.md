# Pinned Session Three-Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the session pin feature allowing terminal sessions to be pinned to the left side of the workbench concurrently with file preview/editing in a three-panel layout.

**Architecture:**
- **Store (`src/store/workspaceStore.ts`)**: Add `isSessionPinned: boolean`, `setSessionPinned`, `toggleSessionPin`, and update `partialize`.
- **UI (`src/App.tsx`)**: Add Pin/Unpin buttons on `sessions` tab and terminal toolbar, and restructure workbench center layout into a side-by-side split container when `isSessionPinned` is `true` and a file tab is active.
- **Tests (`tests/sessionPin.test.ts`)**: Add unit test for session pin store actions.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Lucide React icons.

## Global Constraints
- Preserve existing terminal grid split functionality (`1x1`, `1x2`, `2x1`, `2x2`).
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Zustand Store State for Session Pinning

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `tests/sessionPin.test.ts`

**Interfaces:**
- `isSessionPinned: boolean`
- `setSessionPinned: (pinned: boolean) => void`
- `toggleSessionPin: () => void`

- [ ] **Step 1: Create unit test file `tests/sessionPin.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkspaceStore } from '../src/store/workspaceStore';

test('toggles session pin state in store', () => {
  const store = useWorkspaceStore.getState();
  assert.equal(store.isSessionPinned, false);

  store.toggleSessionPin();
  assert.equal(useWorkspaceStore.getState().isSessionPinned, true);

  store.setSessionPinned(false);
  assert.equal(useWorkspaceStore.getState().isSessionPinned, false);
});
```

- [ ] **Step 2: Add `isSessionPinned` state and actions in `src/store/workspaceStore.ts`**

In `src/store/workspaceStore.ts`:
Add `isSessionPinned: boolean;`, `setSessionPinned: (pinned: boolean) => void;`, `toggleSessionPin: () => void;` to `WorkspaceState`.
In store creator:
```ts
isSessionPinned: false,
setSessionPinned: (pinned) => set({ isSessionPinned: pinned }),
toggleSessionPin: () => set((state) => ({ isSessionPinned: !state.isSessionPinned })),
```
And add `isSessionPinned: state.isSessionPinned` to `partialize`.

- [ ] **Step 3: Run `npm run test`**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/store/workspaceStore.ts tests/sessionPin.test.ts
git commit -m "feat: add isSessionPinned state and persistence to workspaceStore"
```

---

### Task 2: UI Layout Refactor in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import `Pin` and `PinOff` from `lucide-react` in `src/App.tsx`**

- [ ] **Step 2: Add Pin button to Level 2 `sessions` tab**

In `src/App.tsx`:
Add Pin icon toggle button to the `sessions` tab button in Level 2 header:
```tsx
<button
  onClick={() => setActiveFileTab(null)}
  className={`sticky left-0 z-10 flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-r border-surface-2 transition bg-[#171717] shrink-0 border-b-2 group ${
    activeFileTab === null
      ? 'border-b-brand text-zinc-100'
      : 'border-b-transparent text-zinc-500 hover:text-zinc-350'
  }`}
>
  <SquareTerminal size={13} className={activeFileTab === null ? 'text-brand-light' : 'text-zinc-500'} />
  <span className="font-mono">sessions</span>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      toggleSessionPin();
    }}
    className={`p-1 rounded hover:bg-surface-3 transition cursor-pointer ${
      isSessionPinned
        ? 'text-brand-light bg-brand/10'
        : 'text-zinc-550 opacity-0 group-hover:opacity-100 hover:text-zinc-300'
    }`}
    title={isSessionPinned ? "Unpin Sessions from Left Side" : "Pin Sessions to Left Side"}
  >
    {isSessionPinned ? <Pin size={11} className="rotate-45" /> : <Pin size={11} />}
  </button>
</button>
```

- [ ] **Step 3: Add Pin toggle button in Terminal Toolbar**

In `src/App.tsx` terminal toolbar:
```tsx
<button
  onClick={toggleSessionPin}
  className={`flex items-center space-x-1 px-2 py-0.5 rounded transition cursor-pointer text-[9px] font-mono border ${
    isSessionPinned
      ? 'bg-brand/20 border-brand/50 text-brand-light font-semibold'
      : 'bg-surface-3/50 border-surface-3 text-zinc-400 hover:text-zinc-200'
  }`}
  title={isSessionPinned ? "Unpin Sessions Panel" : "Pin Sessions Panel to Left"}
>
  <Pin size={10} className={isSessionPinned ? 'rotate-45 text-brand-light' : ''} />
  <span>{isSessionPinned ? 'PINNED' : 'PIN TO LEFT'}</span>
</button>
```

- [ ] **Step 4: Refactor center workbench container to render side-by-side split when `isSessionPinned` is active**

In `src/App.tsx`:
```tsx
{/* Tab content area */}
<div className="relative flex-grow min-h-0 overflow-hidden flex">
  {/* Terminal Sessions View */}
  <div
    className={`flex flex-col bg-[#0a0a0a] overflow-hidden transition-all ${
      activeFileTab === null
        ? 'w-full h-full'
        : isSessionPinned
        ? 'w-1/2 h-full border-r border-surface-2 shrink-0'
        : 'hidden'
    }`}
  >
    {/* Clean Terminal Toolbar */}
    ...
    {/* Terminal Grid */}
    ...
  </div>

  {/* Active File Preview / Diff View */}
  {activeFileTab !== null && (
    <div className={`flex-grow h-full min-w-0 bg-[#0a0a0a] overflow-hidden ${isSessionPinned ? 'w-1/2' : 'w-full'}`}>
      {activeFileTab.startsWith('git-diff:') ? (
        <GitDiffCompare tabPath={activeFileTab} />
      ) : (
        <FilePreview />
      )}
    </div>
  )}
</div>
```

- [ ] **Step 5: Run `npm run test` and `npm run build`**

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render terminal sessions pinned to left side in a three-panel layout"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Store state `isSessionPinned` & persistence -> Task 1.
   - UI layout split & pin buttons on tab + terminal toolbar -> Task 2.
2. **No Placeholders**: Fully specified code components included.
