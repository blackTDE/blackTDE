-- 5. Local LLM Proxies configuration
CREATE TABLE IF NOT EXISTS local_proxies (
    id TEXT PRIMARY KEY,          -- UUID or identifier
    provider TEXT NOT NULL,       -- 'ollama', 'lm-studio', 'custom-proxy'
    base_url TEXT NOT NULL,       -- e.g. http://localhost:11434/v1
    default_model TEXT NOT NULL,  -- e.g. llama3, qwen2.5
    active INTEGER DEFAULT 0      -- Boolean flag: 1 = active, 0 = inactive
);

-- 6. Model Context Protocol (MCP) server configurations
CREATE TABLE IF NOT EXISTS mcp_servers (
    name TEXT PRIMARY KEY,        -- Server name
    command TEXT NOT NULL,        -- Executable path
    args TEXT NOT NULL            -- JSON array of strings
);

-- 7. Add remote_session_id to sessions table for auto-recovery tracking
ALTER TABLE sessions ADD COLUMN remote_session_id TEXT;
