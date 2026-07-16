# Agent Resume, Provider Icons, Markdown Preview, and macOS Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix privileged Agy launch, Codex UUID resume, provider icons, GFM/Mermaid preview, and install a verified macOS DMG.

**Architecture:** Keep launch and resume policy in the existing Rust command path, extracting only small pure helpers for tests. Reuse Orca's bundled SVG glyphs through one React component, and replace the handwritten Markdown parser with standard renderers. Package only after Rust, frontend, and production-build checks pass.

**Tech Stack:** Rust/Tauri 2, React 18, TypeScript, `react-markdown`, `remark-gfm`, Mermaid, npm, macOS `hdiutil`/`ditto`.

## Global Constraints

- Preserve unrelated dirty-worktree edits and do not stage them.
- Local agent behavior only; do not expand SSH resume semantics.
- Bundle icons locally; make no runtime icon network requests.
- Keep raw HTML disabled in Markdown preview.
- Invalid Mermaid diagrams must retain readable source.

---

### Task 1: Agy Launch and Codex Resume

**Files:**
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/main.rs` (`session_resume_tests`)

**Interfaces:**
- Consumes: existing `spawn_session`, `resume_terminated_session`, `find_latest_file_in_dir`, SQLite `remote_session_id`.
- Produces: `privileged_agent_args(command: &str, privileged: bool) -> Vec<String>` and `resolve_codex_session_id(home: &Path, cwd: &str) -> Option<String>`.

- [ ] **Step 1: Add failing regression tests**

```rust
assert_eq!(privileged_agent_args("agy", true), vec!["--dangerously-skip-permissions"]);
assert!(privileged_agent_args("agy", false).is_empty());
assert_eq!(resolve_codex_session_id(&home, "/repo"), Some("019f6676-0000-7000-8000-000000000001".into()));
```

The Codex fixture must include a matching `session_meta.payload.cwd`, a UUID in `payload.id`, a newer unrelated workspace, and malformed JSONL.

- [ ] **Step 2: Verify the tests fail before implementation**

Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml session_resume_tests -- --nocapture`

Expected: compile failure because both helpers are undefined.

- [ ] **Step 3: Implement the minimum shared policy**

```rust
fn privileged_agent_args(command: &str, privileged: bool) -> Vec<String> {
    (privileged && matches!(command, "claude" | "agy"))
        .then(|| vec!["--dangerously-skip-permissions".into()])
        .unwrap_or_default()
}
```

`resolve_codex_session_id` recursively scans `~/.codex/sessions/**/*.jsonl`, reads the first valid `session_meta` line from each file, filters by exact `payload.cwd`, and returns the `payload.id` from the newest matching file. Use it in both discovery and terminated-session resume, replacing stored rollout stems and repairing existing malformed `rollout-*` IDs before launch.

- [ ] **Step 4: Verify backend regressions**

Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml session_resume_tests -- --nocapture`

Expected: all `session_resume_tests` pass.

### Task 2: Shared Official Provider Icons

**Files:**
- Create: `src/components/AgentIcon.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: provider command/name and Orca SVG paths from `docs/orca/src/renderer/src/components/status-bar/icons.tsx`.
- Produces: `AgentIcon({ name, size, className })` with Claude, Codex/OpenAI, Agy/Antigravity, Gemini, OpenCode, and initials fallback.

- [ ] **Step 1: Add the shared icon component**

```tsx
export function AgentIcon({ name, size = 18, className = '' }: AgentIconProps) {
  const provider = normalizeAgentName(name);
  return <span className={className} style={{ width: size, height: size }}>{providerIcon(provider, size)}</span>;
}
```

Inline the exact local Orca glyphs for Claude, OpenAI, Gemini, and OpenCode; use the official Antigravity mark as a bundled inline SVG. Preserve the current initials behavior for unknown commands.

- [ ] **Step 2: Replace duplicated badges**

Replace both `getAgentIconClass`/`getInitials` implementations and all three badge call sites in `App.tsx` and `SettingsPanel.tsx` with `AgentIcon`.

- [ ] **Step 3: Verify TypeScript rendering**

Run: `rtk npm run build`

Expected: TypeScript and Vite complete successfully.

### Task 3: GFM and Mermaid Preview

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/MermaidBlock.tsx`
- Modify: `src/components/FilePreview.tsx`
- Create: `tests/markdownPreview.test.ts`

**Interfaces:**
- Consumes: Markdown source text.
- Produces: GFM HTML through `ReactMarkdown`, Mermaid SVG through `MermaidBlock`, and source-code fallback on Mermaid errors.

- [ ] **Step 1: Install standard renderers**

Run: `rtk npm install react-markdown remark-gfm mermaid`

Expected: direct dependencies are added to `package.json` and lockfile.

- [ ] **Step 2: Add a failing GFM regression test**

```ts
const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, '| A | B |\n|---|---|\n| 1 | 2 |'));
assert.match(html, /<table>/);
assert.match(html, /<td>1<\/td>/);
```

Run: `rtk npm test -- tests/markdownPreview.test.ts`

Expected: failure before the dependencies/helper are wired.

- [ ] **Step 3: Replace the handwritten parser**

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{ code: ({ className, children }) => className === 'language-mermaid'
    ? <MermaidBlock source={String(children).replace(/\n$/, '')} />
    : <code className={className}>{children}</code> }}
>
  {textContent}
</ReactMarkdown>
```

`MermaidBlock` initializes Mermaid with `securityLevel: 'strict'`, renders to a unique element ID in an effect, and catches render failures by displaying `<pre><code>{source}</code></pre>`.

- [ ] **Step 4: Verify Markdown and production frontend**

Run: `rtk npm test && rtk npm run build`

Expected: all Node tests pass and Vite produces `dist/`.

### Task 4: Full Verification, DMG, and Installation

**Files:**
- Verify: `src-tauri/tauri.conf.json`
- Produce: `src-tauri/target/release/bundle/dmg/*.dmg`
- Install: `/Applications/TDE.app`

**Interfaces:**
- Consumes: passing source tree and Tauri bundle configuration.
- Produces: verified DMG and installed TDE application.

- [ ] **Step 1: Run all automated checks**

Run: `rtk npm test && rtk npm run build && rtk cargo test --manifest-path src-tauri/Cargo.toml`

Expected: every command exits zero.

- [ ] **Step 2: Build the release DMG**

Run: `rtk npm run tauri -- build --bundles dmg`

Expected: Tauri reports a `.dmg` under `src-tauri/target/release/bundle/dmg/`.

- [ ] **Step 3: Verify and install**

Run `rtk hdiutil verify <dmg>`, mount with `rtk hdiutil attach <dmg> -nobrowse`, quit an existing TDE instance, and copy with:

```bash
rtk ditto "/Volumes/TDE/TDE.app" "/Applications/TDE.app"
```

Detach the mounted volume and verify `/Applications/TDE.app/Contents/MacOS/TDE` exists and the installed bundle version matches the build.

- [ ] **Step 4: Audit every acceptance criterion**

Inspect the final source, test output, DMG verification output, and installed bundle. Do not mark the goal complete unless each design acceptance criterion has direct evidence.
