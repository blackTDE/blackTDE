# Right-Aligned File Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align opened file preview tabs in Level 2 header bar directly over the right file preview window when the terminal session panel is pinned to the left (`isSessionPinned = true`).

**Architecture:**
- **UI (`src/App.tsx`)**: Update Level 2 header tab container styling so that when `isSessionPinned && activeFileTab !== null`, the sessions tab section width matches `pinnedSessionWidthPercent%`, placing file tabs directly above the right file preview window.

---

### Task 1: Update Level 2 Header Tabs Layout in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Set dynamic width on sessions tab wrapper when pinned**

Set `style={{ width: isSessionPinned && activeFileTab !== null ? `${pinnedSessionWidthPercent}%` : 'auto' }}` on the `sessions` tab wrapper.

- [ ] **Step 2: Ensure file tabs container is `flex-1 min-w-0`**

- [ ] **Step 3: Run `npm run test` and `npm run build`**

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: align opened file tabs directly over the right file preview window when pinned"
```
