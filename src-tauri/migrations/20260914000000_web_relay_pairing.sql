CREATE TABLE IF NOT EXISTS web_relay_pairing (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    relay_url TEXT NOT NULL,
    room_id TEXT NOT NULL,
    token TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
