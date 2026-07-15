# Agent Resume, Provider Icons, Markdown Preview, and macOS Delivery Design

## Context

TDE has four related defects and delivery requirements:

1. Privileged Agy sessions do not receive the CLI permission-bypass flag.
2. Resuming a Codex session launches briefly and exits because TDE persists a rollout filename instead of Codex's session UUID.
3. Agent rows use generic initial badges instead of recognizable provider glyphs.
4. Markdown preview does not render GitHub-flavored tables or Mermaid diagrams.

The changes must preserve the existing session model and remain compatible with the current local-agent workflow. Expanding SSH session behavior is outside this change.

## Backend Launch and Resume

Provider-specific launch arguments will remain centralized in the Tauri backend.

- When privileged mode is enabled, Claude and Agy receive `--dangerously-skip-permissions`.
- Existing resume flags remain provider-specific:
  - Claude and Gemini: `--resume <id>`
  - Agy: `--conversation <id>`
  - OpenCode: `--session <id>`
  - Codex: `resume <uuid>`
- Codex session discovery will inspect rollout JSONL files for the `session_meta` record, require a matching workspace `cwd`, and persist `payload.id` as the remote session ID.
- Malformed or unrelated rollout files will be ignored. If no valid matching session exists, TDE starts a new session rather than constructing an invalid resume command.

This fixes the root cause instead of translating malformed rollout filenames at launch time, so persisted state is valid wherever it is consumed.

## Provider Icons

TDE will reuse the inline SVG provider glyphs already vendored in the Orca reference project for the five resumable agents:

- Claude
- Codex/OpenAI
- Agy/Antigravity
- Gemini
- OpenCode

The glyphs will be exposed through one small shared React component and used by both the session lists and agent settings. Icons remain bundled with the application; there are no runtime network requests or remote image dependencies. Unknown/custom commands retain the existing initials fallback.

## Markdown Preview

Markdown preview will use `react-markdown` with `remark-gfm` to support tables, task lists, strikethrough, and other GitHub-flavored Markdown constructs.

Fenced code blocks tagged `mermaid` will render through Mermaid. Other fenced blocks remain syntax-preserving code blocks. Mermaid rendering will be isolated per preview instance and refreshed when file content changes. Invalid diagrams will display the original source as a code block so a preview error never hides file content.

Raw HTML will not be enabled, preserving the safer default rendering behavior.

## Verification

Regression coverage will verify:

- privileged Agy commands include the permission-bypass flag;
- non-privileged Agy commands do not include it;
- Codex rollout discovery extracts the UUID from `session_meta.payload.id` for the matching workspace;
- unrelated and malformed Codex rollout files are ignored;
- existing provider resume argument mappings remain intact;
- Markdown tables produce table markup;
- Mermaid blocks use the diagram renderer and invalid diagrams preserve their source;
- the shared provider icon component maps all five supported agents and retains the fallback.

The existing frontend and Rust test suites will run before packaging. A production frontend/Tauri build will then produce a macOS DMG. The DMG will be verified, mounted, and its TDE application copied to `/Applications`, replacing the installed application only after the build succeeds.

## Acceptance Criteria

- Starting a privileged Agy session passes `--dangerously-skip-permissions`.
- Resuming a matching Codex workspace uses a UUID and no longer flashes and exits because of a rollout filename.
- Session and settings surfaces display the bundled provider glyphs consistently.
- GitHub-flavored Markdown tables and fenced Mermaid diagrams render in preview, with readable fallback on diagram errors.
- Automated checks and production builds pass.
- A verified DMG is produced and the resulting TDE application is installed in `/Applications`.
