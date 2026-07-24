# Remove Duplicate Session Nav Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the duplicate Level 2 `sessions` tab header when `isSessionPinned = true`, so only the dedicated Terminal Sessions toolbar below is rendered.

**Architecture:**
- **UI (`src/App.tsx`)**: Wrap the Level 2 `sessions` tab header in `{!isSessionPinned && (...)}`.

---

### Task 1: Update Level 2 Header JSX in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/sessionPin.test.ts`

- [ ] **Step 1: Wrap Level 2 `sessions` tab in `{!isSessionPinned && (...)}`**

Hide the top Level 2 `sessions` tab when `isSessionPinned` is true.

- [ ] **Step 2: Run `npm run test` and `npm run build`**

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx tests/sessionPin.test.ts
git commit -m "feat: remove duplicate top session nav bar when terminal sessions panel is pinned"
```
