# Black TDE

**Black TDE** is a desktop Terminal Development Environment for people who build with shells and AI coding agents. It gives local terminals, Claude Code, Codex, Gemini, Aider, OpenCode, and SSH sessions a shared visual workspace without turning them into a web IDE.

TDE is built with Tauri, Rust, React, xterm.js, SQLite, and Monaco. Your commands run locally in a real PTY; the desktop UI handles the workspace, terminal layout, files, Git, and session recovery around them.

## Why TDE

Terminal workflows are fast, expressive, and easy to compose, but managing several coding agents across projects is not. TDE keeps those workflows intact and adds the structure they usually lack:

- Keep up to four terminal sessions visible in a project workspace.
- Resume local `zsh`, `bash`, and `sh` sessions after restarting TDE when `tmux` is available.
- Reopen supported AI-agent sessions using their provider session IDs.
- Browse, create, rename, delete, preview, and edit project files without leaving the terminal workspace.
- Read Markdown, tables, and Mermaid diagrams directly in the file preview.
- Review Git status and diffs alongside the work that produced them.

The result is a focused control surface for terminal-native development: fewer terminal windows, less context switching, and no requirement to give up your preferred CLI tools.

## What You Can Do with Black TDE

| Area | Capabilities |
| --- | --- |
| Terminals | Start local shells, AI coding CLIs, and SSH sessions; arrange up to four panes; keep terminal output persisted locally. |
| Session recovery | Reattach persistent local shell sessions through tmux; resume supported agent conversations; keep inactive panes mounted while switching views. |
| Files | Browse a workspace tree, create files or directories, rename or delete paths, edit text in Monaco, and preview images, HTML, Markdown, PDFs, and Office files. |
| Documentation | Render GitHub-flavored Markdown tables and Mermaid fenced diagrams in the preview pane. |
| Git | Inspect repository status and diffs, stage or unstage files, and create commits. |
| Providers | Configure proxy providers, virtual model aliases, API keys, local proxies, MCP servers, and check installed CLI versions. |
| Workspaces | Group sessions by project, restore saved layouts, and move sessions between panes without duplicating them. |

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Rust stable with Cargo
- Platform build tools: Xcode Command Line Tools (macOS), Build Tools for Visual Studio (Windows), or `build-essential` and WebKitGTK dependencies (Linux)
- `tmux` for persistent local shell recovery (optional; TDE falls back to a normal fresh shell if it is unavailable)

### Install and run

```bash
git clone <repo-url>
cd black_tde
npm install
npm run tauri dev
```

Create a production bundle with:

```bash
npm run tauri build
```

## User Manual

### 1. Create or open a workspace

Use the project controls in the left sidebar to choose a local directory. TDE associates sessions, open files, and pane layout with that workspace.

### 2. Start a session

Open the new-session dialog, select a shell or installed agent CLI, enter any arguments, and choose an optional SSH host when needed. The active workspace becomes the working directory.

- Use `zsh`, `bash`, or `sh` for an ordinary local terminal.
- Use an agent CLI such as Claude Code, Codex, Gemini, Aider, OpenCode, or Agy for an agent session.
- Enter an SSH host to run the selected command remotely.

Local shells are placed in a named tmux session. Closing and reopening TDE reconnects to that shell instead of creating the misleading “remote ID: None” fresh session. Its saved terminal transcript is restored before the session reconnects.

### 3. Work across panes

Select a one-, two-, or four-pane layout. Choose a session for each pane from the terminal toolbar. TDE keeps the active terminal mounted while you open files or switch panes, so switching views does not reset the live screen.

### 4. Manage files

Open the right-hand **Files** tab and select a project directory.

- Click a file to preview it; switch to edit mode for supported text files.
- Use the file-tree controls to create a file or directory.
- Hover a path to rename or delete it. Delete asks for confirmation and is irreversible.
- Save an edited file with the save control or `Cmd/Ctrl+S`. If the path was deleted externally, TDE asks before recreating it.

Markdown previews support headings, lists, tables, links, fenced code blocks, and Mermaid diagrams. Mermaid is rendered only from a fenced `mermaid` code block.

### 5. Configure providers and tools

Open **Settings** to add API keys, proxy providers, virtual model aliases, and MCP servers. Use the versions section to see whether common CLI tools are installed. Provider configuration is local to this TDE installation.

### 6. Review Git work

Use the Git tab to inspect changed files and diffs. Stage or unstage files as needed, then create commits from the same workspace.

## Session Recovery Details

| Session type | Recovery behavior |
| --- | --- |
| Local `zsh`, `bash`, `sh` | TDE attaches to a deterministic tmux session. The same shell process, cwd, environment, and jobs continue when tmux is installed. |
| Supported agent CLI | TDE uses the provider’s saved session identifier and provider-specific resume arguments. |
| SSH | TDE starts a new SSH client session; remote process persistence depends on the remote host and tools such as tmux. |

Deleting a local shell session also terminates its corresponding tmux session. TDE does not delete a tmux session merely because the desktop app closes.

## Safety Notes

- TDE runs commands and agent CLIs with the permissions of the local user.
- File deletion is recursive for directories and cannot be undone by TDE.
- API keys and provider settings are stored in TDE’s local SQLite database. Treat the machine account and TDE data directory as sensitive.
- Review agent arguments and privileged-mode settings before starting a session.

## Development

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Useful source locations:

```text
src/                         React desktop interface
src/components/              terminal, files, editor, Git, and settings panels
src/store/                   workspace and layout state
src-tauri/src/               Tauri commands, PTY lifecycle, SQLite, and file/Git services
src-tauri/src/shell_session.rs  persistent local-shell adapter
tests/                       frontend behavior tests
```

## Development Targets

The next practical milestones are:

1. Add in-app diagnostics for tmux availability and session-recovery failures.
2. Add safer file operations: trash integration, multi-file actions, and a clear undo path where the platform supports it.
3. Expand agent adapters with explicit capability detection, richer resume verification, and per-agent status reporting.
4. Add end-to-end desktop tests for PTY lifecycle, workspace switching, and file operations.
5. Harden local settings storage and document backup/export of workspaces, session metadata, and provider configuration.

## License

This repository does not currently declare a license. Add one before distributing Black TDE outside your organization.
