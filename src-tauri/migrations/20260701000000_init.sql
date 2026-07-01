-- 1. Workspaces (Project directories and settings)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sessions (Individual CLI/Shell instances)
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
