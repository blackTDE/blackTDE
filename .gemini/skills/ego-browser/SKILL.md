---
name: ego-browser
description: ego-browser (ego-lite) is a fast, lightweight Chromium browser built for human users and AI agents to work together in parallel. AI agents operate in isolated Task Spaces that share login cookies and state without stealing or closing user tabs. Use this skill whenever interacting with web pages, visiting URLs, filling forms, clicking elements, taking screenshots, scraping web content, testing web applications, or managing web workflows. Fully optimized for Antigravity CLI and integrated into TDE's right panel.
metadata:
  version: "1.3.0"
  date: "2026-09-09"
---

# ego-browser (ego-lite) for Antigravity CLI

`ego-browser` gives Antigravity CLI a fast, Node.js-driven browser runtime with built-in automation helpers — `snapshotText`, `click`, `fillInput`, `js`, `cdp`, and task space management.

When working inside **TDE (Terminal Development Environment)**, `ego-browser` handles web browsing directly in TDE's right inspector panel, giving you and the user a shared visual workspace without switching windows.

For setup or install troubleshooting, read `references/install.md`. For TDE right panel integration details, read `references/tde-integration.md`.

---

## Invocation Pattern

Run all browser commands using your command execution tool (`run_command` / bash) via the `ego-browser nodejs <<'EOF'` heredoc format. **Do not create temporary `.js` files.**

```bash
ego-browser nodejs <<'EOF'
// Always name and reuse a task space for the active user goal
const task = await useOrCreateTaskSpace('inspect-dashboard');
cliLog('Active task space ID: ' + task.id);

await openOrReuseTab('https://example.com', { wait: true, timeout: 20 });

const page = await snapshotText();
cliLog(page);
EOF
```

> [!IMPORTANT]
> - The heredoc script runs in a short-lived Node.js process controlling the selected `ego-browser` task space.
> - Built-in helpers are preloaded into the global scope.
> - Always print results with `cliLog(...)` (or `console.log(...)`) to emit output to the terminal.

---

## Core Concepts

### 1. Task Spaces (Context Isolation + Shared Logins)
- Each task space is an **isolated browsing context** created for your agent task.
- Each task space has its own set of tabs, but **inherits the user's cookies and login state** from ego-lite.
- You can automate authenticated accounts without disturbing the user's personal browser tabs.
- Multi-round persistence: Node.js exits after each heredoc, but the browser and task space stay alive. Start subsequent heredoc rounds with `const task = await useOrCreateTaskSpace('nameOrId')` using the same name or `task.id`.
- Complete the task space when finished: Call `await completeTaskSpace(task.id, { keep: false })` in your final round. Set `{ keep: true }` only when the user explicitly wants to keep the page open in TDE's right panel.

### 2. TDE Right Panel Co-Working & Control Handoff
- Inside **TDE**, the browser session is displayed in the Right Inspector Panel.
- **Agent Control**: You drive the browser programmatically using `click`, `fillInput`, `snapshotText`.
- **User Handoff**: If a CAPTCHA, 2FA prompt, or manual human confirmation appears, do **NOT** attempt to bypass or guess. Call `await handOffTaskSpace(task.id)` and inform the user:
  ```js
  await handOffTaskSpace(task.id);
  cliLog('Handed off control to user for authentication in TDE right panel.');
  ```
- **Regaining Control**: Wait for the user to confirm in chat or click continue, then resume in a fresh heredoc with:
  ```js
  await takeOverTaskSpace(task.id);
  ```

---

## Workflows

### Workflow 1: Semantic Workflow (`snapshotText` + `@N` refs / locators) — Recommended Default
Best for standard websites, forms, buttons, links, tables, and lists.
1. `const task = await useOrCreateTaskSpace('my-task')`
2. `await openOrReuseTab(url, { wait: true })`
3. `const tree = await snapshotText()` — produces an AX semantic tree with `@N` ref IDs and `loc=...` locators.
4. Interact using `@N` references:
   - `await click('@12', { label: 'Click submit button' })`
   - `await fillInput('@14', 'search query')`
   - `await pressKey('Enter')`
5. Verify changes with a fresh `await snapshotText()` or `await pageInfo()`.

### Workflow 2: Visual Workflow (`captureScreenshot` + Viewport Coordinates)
Best for canvas applications, maps, Google Docs/Sheets, Figma, whiteboards, or rich virtualized editors where DOM elements do not reflect user-editable content.
1. `await captureScreenshot('/path/to/screenshot.png')`
2. Inspect screenshot and use coordinates or keyboard:
   - `await click([x, y])`
   - `await doubleClick([x, y])`
   - `await typeText('Hello world')`
3. Verify with a subsequent screenshot.

### Workflow 3: Direct DOM & CDP Evaluation (`js` + `cdp`)
Best for querying internal DOM state, running batch client-side extractions, or calling low-level Chrome DevTools Protocol commands.
- Run multi-step client logic inside a single self-invoking IIFE:
  ```js
  const rows = await js(String.raw`(() => {
    return Array.from(document.querySelectorAll('.item')).map(el => ({
      title: el.querySelector('h2')?.innerText?.trim(),
      link: el.querySelector('a')?.href
    }));
  })()`);
  cliLog(JSON.stringify(rows, null, 2));
  ```
- Direct CDP:
  ```js
  const cookies = await cdp('Network.getCookies');
  ```

---

## Common Helpers Reference

| Category | Helpers |
|---|---|
| **Task Spaces** | `useOrCreateTaskSpace(nameOrId)`, `listTaskSpaces()`, `claimTaskSpace(id)`, `handOffTaskSpace(id)`, `takeOverTaskSpace(id)`, `completeTaskSpace(id, { keep })` |
| **Navigation** | `openOrReuseTab(url, opts)`, `gotoAndWait(url, opts)`, `listTabs()`, `currentTab()`, `switchTab(targetId)`, `closeTab(targetId?)`, `pageInfo()` |
| **Observation** | `snapshotText({ scope })`, `captureScreenshot(path?)`, `drainEvents()` |
| **Mouse / Pointer** | `click(target, opts)`, `doubleClick(target)`, `hover(target)`, `dragMouse([from, to])`, `scrollBy(pixels)`, `scrollToBottomUntil(predicate)` |
| **Keyboard** | `fillInput(target, text)`, `typeText(text)`, `pressKey(key)`, `dispatchKey(type, key)` |
| **Files & Network** | `uploadFile(target, path)`, `serverFetch(url, opts)`, `browserFetch(url, opts)` |
| **CDP & Eval** | `js(codeString)`, `cdp(method, params?)` |
| **Logging & Help** | `cliLog(msg)`, `help(commandName)` |

---

## Rules & Caveats

1. **Wait and timeout units**: All `wait(...)` and `timeout` values in helper options are in **seconds** (e.g., `{ timeout: 15 }`), except parameter names explicitly ending in `Ms`.
2. **Ref validity**: `@N` refs generated by `snapshotText()` are only valid until the next `snapshotText()` call. For persistent selectors across steps, use the `loc=...` locator string or CSS selectors.
3. **Task space cleanup**: When your task is complete, always call `completeTaskSpace(task.id, { keep: false })` in the final heredoc, unless the user requested keeping the page open in TDE's right panel.
4. **Environment check**: If `ego-browser` is not found on PATH, follow `references/install.md` to install `ego lite` on macOS.
