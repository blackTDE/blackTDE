# TDE — Terminal Development Environment

TDE (Terminal Development Environment) is a persistent, visual, multi-agent workspace desktop application designed for terminal-native AI coding agents (such as Claude Code, Aider, Codex CLI, etc.). It brings IDE-grade session management, provider abstraction, visual file operations, and remote control capabilities to terminal-centric workflows.

## Sub-Project 1: Core Shell & Rust/Tauri Skeleton

The initial release establishes the foundational cockpit shell, database layer, PTY process runner, and interactive React webview integration.

### Core Architecture

```mermaid
graph TD
    subgraph Frontend (React + Vite)
        UI[Workspace UI Cockpit]
        Term[xterm.js Terminal Panel]
        Store[Zustand State Store]
    end

    subgraph Tauri IPC Bridge
        Cmd[Tauri Commands]
        Evt[Tauri Event Emitter]
    end

    subgraph Backend (Rust)
        EB[Event Bus]
        PM[Process Manager]
        DB[SQLite / SQLx Connection Pool]
    end

    subgraph OS Processes
        PTY[portable-pty Master]
        Shell[Shell/Agent Binary Process]
    end

    UI -->|mount/resize| Cmd
    Term -->|keyboard input| Cmd
    Cmd -->|write/resize| PM
    PM -->|write stdin| PTY

    PTY -->|read stdout/stderr| EB
    EB -->|insert transcript| DB
    EB -->|tde-event payload| Evt
    Evt -->|stream data| Term
    Store -->|select active session| Term
```

---

## Features Implemented

* **Terminal splits cockpit (up to 4 screens)**: Supports layouts matching 1x1, 1x2, 2x1, and 2x2 grid cell divisions in the frontend with focus tracking.
* **Session Auto-Capture & Resumption**: Backend scans stdout logs on the fly to capture remote session ID tokens (e.g. from Claude Code stream-json output) and auto-injects `--resume <session_id>` flag to recover conversations.
* **Advanced Settings Panel**: Full configurations UI managing Model Context Protocol (MCP) server inputs, local LLM proxies (Ollama, LM Studio overrides), credentials vault keys, and CLI version checkers.
* **PTY Process Execution**: Runs shells and interactive CLI tools within a cross-platform pseudo-terminal (PTY) using `portable-pty` in Rust.
* **Credentials Vault (API Keys)**: Securely stores credentials for multiple AI models (Anthropic, OpenAI, Google Gemini, DeepSeek) in the local SQLite database.
* **Environment Variable Injection**: Pre-injects provider API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) automatically when spawning processes.
* **Workspace File Explorer**: Recursive, dynamic tree browsing of directories in the active workspace.
* **Embedded Code Editor**: Hosts Microsoft's Monaco Editor (`@monaco-editor/react`) for code editing with auto syntax detection and diff rendering.
* **Visual Git Operations**: Displays porcelain status, renders unified diff patches, stages/unstages changed files, and commits directly.
* **SQLite Database & Auto-Migrations**: Manages workspaces, session states, and persists raw binary terminal streams (ANSI style code compliant) using `sqlx` and dynamic SQLite connection pool.
* **xterm.js Console View**: Renders real-time stream logs with canvas acceleration and forwards keyboard input/dimensions to PTY processes.

---

## Project Structure

```text
black_tde/
├── docs/
│   ├── prd-v1.md
│   └── superpowers/
│       ├── specs/            # Design spec documents
│       └── plans/            # Feature implementation plans
├── src-tauri/                # Tauri Rust desktop backend
│   ├── Cargo.toml
│   ├── tauri.conf.json       # Tauri v2 window and security settings
│   ├── build.rs              # Build scripts
│   ├── capabilities/         # Default application permissions
│   ├── migrations/           # SQLite database schema migration scripts
│   └── src/
│       ├── main.rs           # Tauri entrypoint and IPC router
│       ├── db.rs             # SQLite pool initialization
│       ├── process.rs        # PTY spawn controller
│       ├── event_bus.rs      # Stdout read thread & DB broadcaster
│       ├── file_manager.rs   # Directory listing and read/write file commands
│       ├── git_runner.rs     # Git diff, porcelain status, and commit commands
│       └── provider.rs       # Credentials vault save/list commands
├── src/                      # Vite + React + TypeScript frontend
│   ├── main.tsx              # React mounting root
│   ├── App.tsx               # Cockpit layout interface
│   ├── components/
│   │   ├── TerminalPane.tsx  # xterm.js terminal panel mount
│   │   ├── FileTree.tsx      # Folder navigation tree
│   │   ├── EditorPane.tsx    # Monaco Editor text editor
│   │   ├── GitPanel.tsx      # Staged changes diff viewer
│   │   └── ProviderVault.tsx # Credentials vault editor
│   ├── store/
│   │   └── workspaceStore.ts # Zustand global state manager
│   └── index.css             # Tailwind base styling
├── package.json              # NPM script configuration
└── vite.config.ts            # Vite compile settings
```

---

## Getting Started

### Prerequisites

* **Node.js** (v18+) and **NPM** (v9+)
* **Rust** (v1.75+ or latest stable) and **Cargo**
* Standard desktop C++ compile toolchains (`Xcode Command Line Tools` on macOS, `Build Tools for Visual Studio` on Windows, or `build-essential` on Linux).

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <repo-url>
   cd black_tde
   ```

2. Install NPM packages:
   ```bash
   npm install
   ```

### Running Locally

To launch the desktop application in development mode with hot-reloading:

```bash
npm run tauri dev
```

### Running Tests

To verify backend database migrations and PTY process spawning on your local operating system:

```bash
cd src-tauri
cargo test
```

---

## Future Roadmap

* **Phase 4**: Agent adapter scripts to run Claude Code, Aider, and custom CLI agents with pre-execution safety filters.
* **Phase 5**: Agent Orchestration dashboard (swarms, delegation panels) and mobile/web remote control.

