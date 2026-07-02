-- Redesign LLM Proxy configurations to match clack-harness features
CREATE TABLE IF NOT EXISTS proxy_providers (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL,          -- 'openai' | 'anthropic'
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    default_model TEXT NOT NULL,
    is_default INTEGER DEFAULT 0  -- 1 = true, 0 = false
);

CREATE TABLE IF NOT EXISTS proxy_virtual_models (
    name TEXT PRIMARY KEY,       -- e.g. 'claude', 'codex', 'aider'
    provider TEXT NOT NULL,      -- reference to proxy_providers(name)
    model TEXT NOT NULL
);
