# Streamlined Session Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the session panel headline toolbar by removing redundant labels ("PTY SESSIONS:"), collapsing split layout buttons into a dropdown menu (`LayoutGrid` icon + `{paneLayout.type}`), making the PIN button compact, and maximizing horizontal space for active session tabs.

**Architecture:**
- **UI (`src/App.tsx`)**: Import `LayoutGrid` and `Check` from `lucide-react`. Manage dropdown state `showSplitMenu`. Refactor the toolbar JSX.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons.

## Global Constraints
- Preserve full functionality of spawning, closing, switching sessions, pinning, and changing split layout.
- Remember to commit changes at every step (`git commit`).

---

### Task 1: Add Lucide Icons & State for Split Dropdown

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update Lucide imports in `src/App.tsx`**

Add `LayoutGrid` and `Check` to `lucide-react` imports.

- [ ] **Step 2: Add `showSplitMenu` state in `App()` component**

```tsx
const [showSplitMenu, setShowSplitMenu] = useState(false);
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add LayoutGrid and Check icons and split menu state in App.tsx"
```

---

### Task 2: Refactor Session Panel Headline Toolbar in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace "PTY SESSIONS:" label with compact SquareTerminal icon**

Remove `<span className="text-[10px] text-zinc-450 font-mono uppercase tracking-wider font-semibold mr-1.5 shrink-0">PTY Sessions:</span>`. Keep `<SquareTerminal size={14} className="text-brand-light shrink-0" title="Active Terminal Sessions" />`.

- [ ] **Step 2: Wrap session tabs in a flex-1 min-w-0 container**

Ensure `<div className="flex-1 flex items-center space-x-1.5 overflow-x-auto scrollbar-none min-w-0">` holds active session tabs and the spawn button.

- [ ] **Step 3: Replace wide split buttons and text with compact Pin button + Split Dropdown**

```tsx
<div className="flex items-center space-x-1.5 shrink-0 ml-2">
  {/* Compact Pin Toggle Button */}
  <button
    onClick={toggleSessionPin}
    className={`p-1 rounded border transition cursor-pointer text-xs ${
      isSessionPinned
        ? 'bg-brand/20 border-brand/50 text-brand-light font-semibold'
        : 'bg-surface-2 border-surface-3 text-zinc-400 hover:text-zinc-200'
    }`}
    title={isSessionPinned ? "Unpin Sessions Panel" : "Pin Sessions Panel to Left Side"}
  >
    <Pin size={11} className={isSessionPinned ? 'rotate-45 text-brand-light' : ''} />
  </button>

  {/* Compact Split Dropdown */}
  <div className="relative">
    <button
      onClick={() => setShowSplitMenu(!showSplitMenu)}
      className="flex items-center space-x-1 px-2 py-1 rounded border border-surface-3 bg-surface-2/80 text-zinc-300 hover:text-white text-[10px] font-mono cursor-pointer transition"
      title="Change Terminal Split Layout"
    >
      <LayoutGrid size={11} className="text-brand-light" />
      <span>{paneLayout.type}</span>
      <ChevronDown size={10} className="text-zinc-500" />
    </button>
    {showSplitMenu && (
      <div
        className="absolute right-0 top-full mt-1 bg-surface-1 border border-surface-3 rounded-md shadow-xl py-1 z-30 w-28 text-[10px] font-mono"
        onClick={() => setShowSplitMenu(false)}
      >
        {[
          { type: '1x1', label: '1x1 Single' },
          { type: '1x2', label: '1x2 Dual H' },
          { type: '2x1', label: '2x1 Dual V' },
          { type: '2x2', label: '2x2 Grid' },
        ].map((item) => (
          <button
            key={item.type}
            onClick={() => {
              setPaneLayoutType(item.type as any);
              setShowSplitMenu(false);
            }}
            className={`w-full text-left px-2.5 py-1 hover:bg-surface-2 transition flex items-center justify-between cursor-pointer ${
              paneLayout.type === item.type ? 'text-brand-light font-bold bg-brand/10' : 'text-zinc-300'
            }`}
          >
            <span>{item.label}</span>
            {paneLayout.type === item.type && <Check size={10} />}
          </button>
        ))}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 4: Run `npm run test` and `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: streamline session panel toolbar and collapse split controls into compact dropdown"
```

---

## Plan Self-Review

1. **Spec coverage**:
   - Remove redundant text -> Task 2.
   - Collapse child split buttons -> Task 2.
   - Maximize room for session tabs -> Task 2.
2. **No Placeholders**: Explicit JSX provided.
