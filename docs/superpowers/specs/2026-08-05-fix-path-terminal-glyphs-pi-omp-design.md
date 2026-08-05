# Design Specification: System App PATH Resolution, Terminal Glyph Rendering, and Pi / Oh My Pi Agent Support

## 1. System App PATH Resolution Fix (macOS GUI PATH Environment)

### Issue Analysis
When launching TDE as a compiled macOS app bundle (`/Applications/TDE.app`) via Finder or Spotlight, macOS `launchd` provides a minimal default `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`). CLI agents installed in user-level directories (e.g. `/opt/homebrew/bin`, `/usr/local/bin`, `~/.gemini/bin`, `~/.cargo/bin`, `~/.nvm/versions/node/.../bin`, `~/.local/bin`) cannot be found by `CommandBuilder` in `portable-pty` or `detect_available_clis`, resulting in `[Auto resume failed: Unable to spawn agy because it doesn't exist on the filesystem and was not found in PATH]`.

### Solution
- **PATH Environment Enrichment in Rust Backend (`src-tauri/src/process.rs` & `src-tauri/src/main.rs`)**:
  - Implement a `resolve_command_path(command: &str) -> String` helper function.
  - If `command` is an absolute path that exists, return it directly.
  - Check current process `PATH`. If not found, enrich `PATH` by scanning standard user binary paths:
    - `/opt/homebrew/bin`, `/opt/homebrew/sbin`
    - `/usr/local/bin`, `/usr/local/sbin`
    - `~/.cargo/bin`, `~/.gemini/bin`, `~/.local/bin`, `~/.npm-global/bin`, `~/.bun/bin`
    - `~/.nvm/versions/node/*/bin`
  - If still not found, execute `$SHELL -l -c 'echo $PATH'` to query the user's interactive login shell environment and extract the full `PATH`.
  - Pass the enriched `PATH` to `spawn_pty_process` environment so every spawned shell/agent process has access to all user binaries.

---

## 2. Terminal Messy Head String & Powerline Glyph Fix

### Issue Analysis
Terminal prompt headers (like Powerlevel10k, Starship, or Oh My Zsh) displayed double underscores (`__`) and broken characters for Powerline segment arrows (``, ``) and branch symbols (``). This occurred because:
1. PTY sessions spawned from `launchd` lacked `LANG` / `LC_ALL` UTF-8 locale environment variables, causing shell prompt scripts to fall back to ASCII rendering.
2. xterm.js canvas renderer required `customGlyphs: true` to custom-draw Powerline symbol ranges when system fonts lack built-in Nerd Font glyphs.

### Solution
- **Backend PTY Locale Setup (`src-tauri/src/process.rs`)**:
  - Automatically set `LANG=en_US.UTF-8` and `LC_ALL=en_US.UTF-8` in PTY environment if not already present.
  - Set `COLORTERM=truecolor` to ensure full 24-bit color palette support.
- **xterm.js Configuration (`src/components/TerminalPane.tsx`)**:
  - Enable `customGlyphs: true` and `allowProposedApi: true` in xterm constructor options.

---

## 3. Pi and "Oh My Pi" (`omp`) Code Agent Support

### Requirements
Add native support for `pi` (Pi Coding Agent) and `omp` / `oh-my-pi` (Oh My Pi Agent) across CLI detection, session spawning, icon rendering, and session resume.

### Solution
- **Backend (`src-tauri/src/main.rs`)**:
  - Add `"pi"`, `"omp"`, and `"oh-my-pi"` to `detect_available_clis()` common commands list and fallback paths.
  - Add `pi` and `omp` to `agent_new_session_args` and `agent_resume_args` (`--session <id>`).
  - Add `pi` and `omp` to `privileged_agent_args`.
- **Frontend (`src/agentIcons.ts` & `src/components/AgentIcon.tsx`)**:
  - Add `'pi'` and `'omp'` to `AgentIconKind`.
  - Add dedicated SVG icons for Pi (`π`) and Oh My Pi (`omp`).
  - Add `'pi'`, `'omp'`, and `'oh-my-pi'` to `resumableAgents` array in `App.tsx`.
