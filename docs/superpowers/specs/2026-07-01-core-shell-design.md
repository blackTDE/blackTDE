# TDE Sub-Project 1: Core Shell & Rust/Tauri Skeleton Design

## 1. Overview
This design specification defines the foundational architecture of the Terminal Development Environment (TDE) desktop application. Sub-Project 1 establishes the Tauri shell, the database model, the asynchronous process runner (using a pseudo-terminal PTY), and a central event bus to stream terminal input/output between the frontend and backend.

---

## 2. System Architecture

The following diagram details the flow of data between the UI components, the Rust event bus, the PTY master, and the SQLite storage layer.

```mermaid
graph TD
    subgraph Frontend (React + Vite)
        UI[Workspace UI]
        Term[xterm.js Panel]
        Store[Zustand Store]
    end

    subgraph Tauri IPC Bridge
        Cmd[Tauri Commands]
        Evt[Tauri Event emitter]
    end

    subgraph Backend (Rust)
        EB[Event Bus]
        PM[Process Manager]
        DB[SQLite / SQLx Pool]
    end

    subgraph OS Processes
        PTY[portable-pty Master]
        Shell[Shell/Agent Process]
    end

    %% Input flow
    UI -->|mount/resize| Cmd
    Term -->|keyboard input| Cmd
    Cmd -->|write/resize| PM
    PM -->|write stdin| PTY

    %% Output flow
    PTY -->|read stdout/stderr| EB
    EB -->|insert chunk| DB
    EB -->|tde-event payload| Evt
    Evt -->|stream data| Term
    Store -->|select active session| Term
```

---

## 3. Tech Stack & Dependencies

### Rust Backend (`src-tauri/Cargo.toml`)
* **Tauri v2** (`tauri = { version = "2.0.0-rc", features = ["api-all"] }`): Desktop host.
* **SQLx** (`sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "macros", "migrate"] }`): Asynchronous database access with compile-time query verification.
* **Tokio** (`tokio = { version = "1", features = ["full"] }`): Async runtime.
* **portable-pty** (`portable-pty = "0.8"`): Cross-platform PTY management to enable full terminal compliance (escape codes, colors, interactivity).
* **Serde & Serde JSON** (`serde`, `serde_json`): Data serialization.
* **UUID** (`uuid = { version = "1.0", features = ["v4", "serde"] }`): Session/Workspace identifier generation.

### React Frontend (`package.json`)
* **Vite + React + TypeScript**: Fast, lightweight frontend build.
* **@tauri-apps/api**: IPC bindings to invoke Rust commands and listen to event loops.
* **@xterm/xterm** & **@xterm/addon-fit**: High-performance canvas-based terminal rendering.
* **Zustand**: Fast state store to manage active tabs, workspaces, and UI panels.
* **TailwindCSS**: CSS styling framework.

---

## 4. Database Schema (`migrations/20260701000000_init.sql`)

SQLite will store local session state, workspace directories, and persist PTY transcripts.

```sql
-- 1. Workspaces (Project projects and preferences)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sessions (Individual CLI/Shell threads)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL,              -- 'claude', 'aider', 'bash', 'custom'
    provider TEXT,                         -- 'anthropic', 'openai', etc.
    model TEXT,                            -- 'claude-3-5-sonnet', etc.
    cwd TEXT NOT NULL,                     -- Directory the session executes within
    git_branch TEXT,
    status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'suspended', 'terminated'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Transcripts (PTY raw stream chunks with ANSI escape codes)
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    stream_type TEXT NOT NULL,             -- 'stdin', 'stdout', 'system'
    data BLOB NOT NULL,                    -- Raw PTY bytes
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### DB Lifecycle & Migrations (Rust)
Upon Tauri startup (`tauri::Builder::setup`):
1. Resolve application directory path `AppDir/tde.db`.
2. Connect using `SqlitePool`.
3. Auto-run embedded migrations:
   ```rust
   sqlx::migrate!("./migrations").run(&pool).await?;
   ```
4. Register DB connection pool as app state via `.manage(pool)`.

---

## 5. Backend Process & Event Management

### Process Manager State (`src-tauri/src/process.rs`)
Manages PTY instances and tracks write handles.

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};
use portable_pty::MasterPty;

pub struct ActiveProcess {
    pub writer: Box<dyn MasterPty + Send>,
    pub kill_tx: oneshot::Sender<()>,
}

#[derive(Default)]
pub struct ProcessManager {
    pub active_sessions: Arc<Mutex<HashMap<String, ActiveProcess>>>,
}
```

### PTY Spawning
We spawn processes inside a system PTY:
* Allocate a pseudo-terminal pair (Master and Slave).
* Construct Command (e.g. `/bin/zsh` on macOS, `cmd.exe` or `powershell.exe` on Windows).
* Initialize child process attached to the slave side.
* Spawn a async Tokio loop to read stdout/stderr from Master PTY.

### The Event Bus (`src-tauri/src/event_bus.rs`)
The stdout read task continuously pulls data from the PTY master, inserts the bytes to the SQLite `transcripts` table, and broadcasts to the frontend:

```rust
#[derive(Clone, serde::Serialize)]
pub struct TdeEvent {
    pub session_id: String,
    pub event_type: String, // "stdout", "exit", "error"
    pub data: Vec<u8>,       // Binary payload containing ANSI styling codes
}
```

Tauri Event dispatch:
```rust
app_handle.emit("tde-event", TdeEvent {
    session_id: session_id.clone(),
    event_type: "stdout".into(),
    data: buffer[..bytes_read].to_vec(),
})?;
```

### Invokable Tauri Commands
* `spawn_session(id: String, command: String, args: Vec<String>, cwd: String, rows: u16, cols: u16)`
* `write_to_session(id: String, data: Vec<u8>)`
* `resize_session(id: String, rows: u16, cols: u16)`
* `terminate_session(id: String)`

---

## 6. Frontend Terminal Interface

### Zustand Store (`src/store/workspaceStore.ts`)
React elements query state and interact with active workspaces/sessions.

```typescript
export interface Session {
  id: string;
  agentType: string;
  cwd: string;
  status: 'active' | 'suspended' | 'terminated';
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspace: null,
  sessions: {},
  activeSessionId: null,
  setWorkspace: (ws) => set({ activeWorkspace: ws }),
  addSession: (s) => set((state) => ({ sessions: { ...state.sessions, [s.id]: s } })),
  setActiveSession: (id) => set({ activeSessionId: id }),
}));
```

### xterm.js Panel Component (`src/components/TerminalPane.tsx`)
```typescript
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export const TerminalPane: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#1a1b26' }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // Listen to incoming stdout streams
    const unlistenPromise = listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.session_id === sessionId) {
        if (payload.event_type === 'stdout') {
          term.write(new Uint8Array(payload.data));
        } else if (payload.event_type === 'exit') {
          term.write('\r\n[Process terminated]\r\n');
        }
      }
    });

    // Capture user input
    const dataDisposer = term.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      invoke('write_to_session', { id: sessionId, data: Array.from(bytes) });
    });

    // Resize listener
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      invoke('resize_session', { id: sessionId, rows: term.rows, cols: term.cols });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unlistenPromise.then(fn => fn());
      dataDisposer.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" />;
};
```

---

## 7. Testing Strategy
1. **Database Unit Tests**:
   * Verify SQLite migrations run successfully.
   * Verify insert/query integrity for workspace directories, sessions, and binary stream logs.
2. **PTY Process Isolation Tests**:
   * Verify stdout outputs are accurately captured when executing standard binary commands.
   * Verify process lifecycle hooks correctly clean up spawned system child processes when requested.
