# TDE Sub-Project 5: Multi-Pane Terminals, Session Recovery, and Advanced Settings

## 1. Overview
This design specification defines the architecture for the next major upgrade of the Terminal Development Environment (TDE). It expands the terminal cockpit into a multi-pane terminal grid supporting up to 4 concurrent splits (1x1, 1x2, 2x1, 2x2 layouts), introduces automatic session ID capture and conversation resumption, and adds a unified settings panel to manage LLM providers, local proxies, custom skills, and MCP servers.

---

## 2. Technical Architecture

```mermaid
graph TD
    subgraph UI Grid View (React)
        Grid[Terminal Split Grid: 1x1, 1x2, 2x1, 2x2]
        Pane1[Pane 1: xterm.js]
        Pane2[Pane 2: xterm.js]
        Pane3[Pane 3: xterm.js]
        Pane4[Pane 4: xterm.js]
        Settings[Settings Panel: Vault, Proxies, MCP]
    end

    subgraph Zustand Layout Store
        LS[Layout State: panes array]
    end

    subgraph Tauri IPC Commands
        Spawn[spawn_session_with_resume]
        SaveKey[save_provider_key]
        SaveProxy[save_proxy_settings]
        SaveMCP[save_mcp_config]
    end

    subgraph Rust PTY & DB
        PM[PTY Process Manager]
        DB[(SQLite / SQLx)]
    end

    Grid -->|Layout Switch| LS
    LS -->|bind slots| Pane1 & Pane2 & Pane3 & Pane4
    Pane1 & Pane2 & Pane3 & Pane4 -->|spawn/write| Spawn
    Settings -->|save configs| SaveKey & SaveProxy & SaveMCP
    Spawn & SaveKey & SaveProxy & SaveMCP --> PM & DB
```

---

## 3. Tech Stack & Dependencies

* **Frontend**: React + Vite + TS + Zustand + TailwindCSS + Lucide React icons.
* **Terminal**: `@xterm/xterm` with canvas rendering and `@xterm/addon-fit`.
* **Backend**: Rust + Tauri v2 + SQLx + SQLite + native process management.

---

## 4. Key Design Upgrades

### A. Terminal Split Grid (Up to 4 Panes)
* The Zustand store maintains:
  ```typescript
  export interface PaneLayout {
    type: '1x1' | '1x2' | '2x1' | '2x2';
    activePaneIndex: number; // 0 to 3
    panes: (string | null)[]; // Array of active session IDs (length 4)
  }
  ```
* The UI renders a grid container corresponding to the selected layout. Clicking a cell sets the active pane index.
* Each cell renders either the active terminal session or a "Select/Create Session" placeholder.

### B. Session Capture & Resumption
We introduce automatic CLI session tracking:
* When spawning `claude` (Claude Code), the backend parses stdout for JSON or text pattern matches:
  * Claude Code initial JSON: `{"type":"system","subtype":"init","session_id":"..."}`
  * If a session ID matches, we automatically write it to the SQLite `sessions.id` database field.
* When spawning an agent, we check if the user is resuming a past session. If yes, we append the CLI resume flags:
  * Claude Code: `--resume <session_id>`
  * Aider: We query and pre-inject git branch metadata or command history.

### C. Advanced Settings Panel
The Settings view in the right panel is expanded to support four tabs:
1. **Providers Vault**: Configure API keys for Anthropic, OpenAI, Gemini, DeepSeek, etc.
2. **Local LLM Proxies**:
   * Set up local LLM endpoints (e.g. Ollama `http://localhost:11434`, LM Studio `http://localhost:1234`).
   * Manage proxy settings: inject `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` env vars when launching CLI tools so they route through local models.
3. **MCP Servers**: Configure external Model Context Protocol (MCP) server JSON configurations.
4. **System Status**: Check installed versions of CLIs (`claude --version`, `aider --version`) and display details.

---

## 5. Database Schema Extensions

We add the following tables in a new SQL migration script:

```sql
-- 1. Local proxies configuration
CREATE TABLE IF NOT EXISTS local_proxies (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    default_model TEXT NOT NULL,
    active INTEGER DEFAULT 0
);

-- 2. MCP servers configuration
CREATE TABLE IF NOT EXISTS mcp_servers (
    name TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    args TEXT NOT NULL,           -- JSON array of strings
    env TEXT NOT NULL             -- JSON object
);
```

---

## 6. Testing Strategy
1. **PTY Resumption tests**: Verify command builds correctly append `--resume` flag when a valid session ID is provided.
2. **Layout Split Tests**: Verify Zustand store handles resizing and slot assignments without pane conflicts.
