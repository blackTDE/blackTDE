# TDE Browser Integration Guide for ego-browser

This document explains how **Antigravity CLI** and **TDE (Terminal Development Environment)** collaborate to drive and display `ego-browser`:

1. **Right Inspector Panel (`Browser` Tab)**: Serves as the **Web Tabs Manager** (listing open pages per project, task spaces, URL launcher, and agent/user handoff controls).
2. **Center Panel (`WebPreview`)**: Displays the **full-resolution, interactive web page content** alongside file previews and git diffs, split-screenable with the terminal grid, and strictly isolated per project workspace.

---

## Architecture Overview

```
+---------------------------------------------------------------------------------------------------+
|                                      TDE Desktop (Tauri v2)                                       |
|                                                                                                   |
|  +---------------------------------------+   +-----------------------+   +---------------------+  |
|  |         Center Left: Terminal         |   | Center Right: Preview |   |   Right Inspector   |  |
|  |                                       |   |                       |   |                     |  |
|  |  Level 2 Tabs: [Shell] [sess-1]       |   | [app.ts] [🌐 Localhost]|   | [Files][Git][Browser|  |
|  |                                       |   |                       |   |                     |  |
|  |  $ ego-browser nodejs <<'EOF'         |   | +-------------------+ |   | +-----------------+ |  |
|  |    const task = await ...             |   | | [Address Bar]     | |   | | Web Tabs (3)    | |  |
|  |    await openOrReuseTab(...)          |---|-> | [Full Resolution| |   | | + Open URL...   | |  |
|  |    await click('@12')                 |   | |  Live Web Page    | |   | | • Localhost:3000| |  |
|  |  EOF                                  |   | |  Viewport]        | |   | | • GitHub Repo   | |  |
|  |                                       |   | +-------------------+ |   | +-----------------+ |  |
|  +-------------------+-------------------+   +-----------------------+   +----------+----------+  |
|                      |                                                              ^             |
|                      v                                                              |             |
|           ego-browser CLI Process                                                   |             |
|                      +-----------------------+--------------------------------------+             |
|                                              v                                                    |
|                               ego-lite Engine (Chromium + CDP)                                    |
+---------------------------------------------------------------------------------------------------+
```

---

## 1. Coordinated Life Cycle

### Step 1: Starting a Browser Task
When an Antigravity CLI agent starts a browser automation goal, it names a task space:
```js
const task = await useOrCreateTaskSpace('inspect-auth-flow');
```
TDE detects the active task space and automatically raises the **Browser** tab in the Right Inspector Panel.

### Step 2: Live Viewport & Observation
- As the agent executes navigation, clicks, and scrolls, TDE's right panel mirrors the state in real-time.
- The agent calls `snapshotText()` to receive clean semantic nodes with `@N` references.
- The user can watch every action without leaving their IDE layout.

### Step 3: Human Takeover (Handoff)
If the page requires human authentication, CAPTCHA, or two-factor SMS approval:
1. Agent calls:
   ```js
   await handOffTaskSpace(task.id);
   cliLog('Handed off control to user for 2FA confirmation in TDE Right Panel.');
   ```
2. The Right Panel's badge switches to `[User Controlling]`.
3. The user completes the CAPTCHA or login directly inside the TDE Right Panel.
4. The user clicks "Hand to Agent" (or writes "continue" in the terminal).
5. The agent resumes with:
   ```js
   await takeOverTaskSpace(task.id);
   ```

### Step 4: Finishing & Preservation
- If the user wanted information extracted into code/files, the agent cleans up:
  ```js
  await completeTaskSpace(task.id, { keep: false });
  ```
- If the user wanted the resulting web page kept open for inspection:
  ```js
  await completeTaskSpace(task.id, { keep: true });
  ```
  The page stays docked in TDE's right panel for the user to explore.
