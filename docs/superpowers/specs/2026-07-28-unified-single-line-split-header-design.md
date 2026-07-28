# Unified Single-Line Split Header Design Spec

## Executive Summary
This design spec outlines the UI refactoring to combine the Terminal Session tabs and Opened File tabs into a single horizontal header bar. The single header bar is split into two parts matching the exact widths of the underlying Terminal Sessions pane (Left) and File Preview pane (Right).

---

## 1. User Intent & Problem Statement
- **Request**: "the session tab row and the opened files tab row should at the same line but split the head tab row into two part align the corresponding pane 's width, start from left to right, do you understand?"
- **Goal**:
  1. Merge the session tab controls and opened file tabs onto **THE EXACT SAME HORIZONTAL LINE** at the top.
  2. Split the header row into two aligned parts:
     - **Left Part (width: `pinnedSessionWidthPercent%`)**: Positioned directly above the left Terminal Sessions pane. Contains `[ >_ ]`, active PTY session tabs (`agy (tr9q)`), `[ + ]`, `[ 📌 ]`, and split layout dropdown (`[ 🗂️ 1x1 ▾ ]`).
     - **Right Part (width: `100 - pinnedSessionWidthPercent%`)**: Positioned directly above the right File Preview pane. Contains opened file tabs (`jp-home.yaml`, etc.), flowing left-to-right.
  3. Remove the secondary duplicate toolbar inside the Terminal Sessions view.

---

## 2. Technical Design (`src/App.tsx`)

### Unified Header Bar Layout
```tsx
<div className="shrink-0 flex items-center border-b border-surface-2 bg-[#171717] select-none min-w-0 h-9">
  {/* Left Part: Session Tabs & Controls (aligned with left PTY pane width) */}
  <div
    style={{
      width: isSessionPinned && activeFileTab !== null ? `${pinnedSessionWidthPercent}%` : 'auto'
    }}
    className={`flex items-center justify-between px-3 py-1 border-r border-surface-2 bg-surface-1 shrink-0 min-w-0 ${
      activeFileTab === null ? 'flex-1' : ''
    }`}
  >
    <div className="flex-1 flex items-center space-x-1.5 overflow-x-auto min-w-0 mr-2 scrollbar-none">
      <span title="Active Terminal Sessions"><SquareTerminal size={14} className="text-brand-light shrink-0" /></span>
      {sessionDeleteError && <span className="text-[9px] text-rose-400 truncate" title={sessionDeleteError}>{sessionDeleteError}</span>}
      {activeProjectSessions.map((session) => ( ... ))}
      {activeWorkspace && ( ... )}
    </div>
    <div className="flex items-center space-x-1.5 shrink-0">
      <button onClick={toggleSessionPin} ...><Pin size={11} /></button>
      <div className="relative">...</div>
    </div>
  </div>

  {/* Right Part: Opened File Tabs (aligned over right file window) */}
  {activeFileTab !== null && (
    <div className="flex-1 flex items-center overflow-x-auto scrollbar-none min-w-0">
      {openFiles.map(f => ( ... ))}
    </div>
  )}
</div>
```

---

## 3. Benefits & Verification Strategy
- **Single-Line Efficiency**: Eliminates secondary toolbar rows, saving vertical space.
- **100% Spatial Alignment**: Left header section matches left terminal pane; right header section matches right file window.
- **Verification**: Run `npm run test`, `npm run build`, `cargo test`.
