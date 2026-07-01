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

* **PTY Process Execution**: Runs shells and interactive CLI tools within a cross-platform pseudo-terminal (PTY) using `portable-pty` in Rust.
* **Tauri v2 Shell Integration**: High-performance, low-overhead desktop window host binding React to native system commands.
* **SQLite Database Layer**: Handles local configuration, workspace directories, session states, and persists raw binary terminal streams (with full ANSI escapes preserved) using `sqlx`.
* **Auto-Migrations**: Automatically establishes and migrates the database schema (`migrations/`) inside the user's OS App Data directory on startup.
* **Frontend Web Terminal**: Renders real-time stream logs using `xterm.js` and propagates resizing events natively to adjust the PTY bounds.
* **Zustand State Store**: Synchronizes layouts, active workspace contexts, and concurrent session tracking.

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
│   ├── migrations/           # SQLite database schema migration script
│   └── src/
│       ├── main.rs           # Tauri entrypoint and IPC router
│       ├── db.rs             # SQLite pool initialization
│       ├── process.rs        # PTY spawn controller
│       └── event_bus.rs      # Stdout read thread & DB broadcaster
├── src/                      # Vite + React + TypeScript frontend
│   ├── main.tsx              # React mounting root
│   ├── App.tsx               # Cockpit layout interface
│   ├── components/
│   │   └── TerminalPane.tsx  # xterm.js terminal mount
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

* **Phase 2**: Visual Project Explorer, Git status inspection panel, and inline file diff editor.
* **Phase 3**: Provider settings vault (storing API keys for Anthropic, OpenAI, Gemini) and proxy routing.
* **Phase 4**: Agent adapter scripts to run Claude Code, Aider, and custom CLI agents with pre-execution safety filters.
