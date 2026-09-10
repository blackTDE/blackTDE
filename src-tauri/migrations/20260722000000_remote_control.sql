-- Remote Bot Configurations (Telegram, Lark/Feishu)
CREATE TABLE IF NOT EXISTS remote_bot_configs (
    platform TEXT PRIMARY KEY,
    credentials TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Remote Pairings (Authorized & pending chats)
CREATE TABLE IF NOT EXISTS remote_pairings (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    user_name TEXT,
    pair_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    bound_workspace_id TEXT,
    bound_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, chat_id)
);

-- Remote Control Message Audit Log
CREATE TABLE IF NOT EXISTS remote_message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
