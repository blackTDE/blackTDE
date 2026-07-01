-- 4. Provider Keys (Credentials vault for AI provider API tokens)
CREATE TABLE IF NOT EXISTS provider_keys (
    provider TEXT PRIMARY KEY,    -- 'anthropic', 'openai', 'gemini', 'deepseek', etc.
    api_key TEXT NOT NULL,         -- Plaintext key stored locally
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
