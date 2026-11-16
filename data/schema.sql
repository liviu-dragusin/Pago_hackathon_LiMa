-- Schema comună pentru PHP (backend) și Python (scripts).
-- Rulează idempotent: CREATE IF NOT EXISTS + INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Refresh token-ul Gmail. Se șterge după scanare (revocare).
CREATE TABLE IF NOT EXISTS oauth_tokens (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id),
    refresh_token TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    mode         TEXT NOT NULL DEFAULT 'live',      -- live | demo
    status       TEXT NOT NULL DEFAULT 'pending',   -- pending | running | done | error
    total_emails INTEGER DEFAULT 0,
    processed    INTEGER DEFAULT 0,
    found        INTEGER DEFAULT 0,
    error        TEXT,
    started_at   TEXT,
    finished_at  TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
);

-- Catalogul furnizorilor Pago. Datele de mai jos sunt DEMO (fără CUI/IBAN reale).
CREATE TABLE IF NOT EXISTS provider_catalog (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT UNIQUE NOT NULL,
    cui      TEXT,
    iban     TEXT,
    category TEXT,
    logo     TEXT
);

CREATE TABLE IF NOT EXISTS discovered_providers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id            INTEGER NOT NULL REFERENCES scan_jobs(id),
    catalog_id        INTEGER REFERENCES provider_catalog(id),
    name              TEXT NOT NULL,
    cui               TEXT,
    iban              TEXT,
    client_code       TEXT,
    category          TEXT,
    last_amount       REAL,
    currency          TEXT DEFAULT 'RON',
    last_due_date     TEXT,
    invoice_count     INTEGER DEFAULT 0,
    confidence        REAL,
    iban_valid        INTEGER DEFAULT 0,
    source_message_id TEXT,
    status            TEXT NOT NULL DEFAULT 'proposed'  -- proposed | confirmed | rejected
);

CREATE TABLE IF NOT EXISTS user_providers (
    user_id       INTEGER NOT NULL REFERENCES users(id),
    catalog_id    INTEGER REFERENCES provider_catalog(id),
    discovered_id INTEGER REFERENCES discovered_providers(id),
    name          TEXT NOT NULL,
    client_code   TEXT NOT NULL DEFAULT '',
    added_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, name, client_code)
);

INSERT OR IGNORE INTO provider_catalog (name, cui, iban, category, logo) VALUES
    ('Enel Energie',   NULL, NULL, 'energie',   'enel'),
    ('Engie Romania',  NULL, NULL, 'gaz',       'engie'),
    ('Digi',           NULL, NULL, 'internet',  'digi'),
    ('Orange',         NULL, NULL, 'telecom',   'orange'),
    ('Apa Nova',       NULL, NULL, 'apa',       'apanova'),
    ('Salubritate',    NULL, NULL, 'salubritate','salubr'),
    ('Allianz-Tiriac', NULL, NULL, 'asigurare', 'allianz'),
    ('Vodafone',       NULL, NULL, 'telecom',   'vodafone'),
    ('Telekom',        NULL, NULL, 'internet',  'telekom'),
    ('Eon Romania',    NULL, NULL, 'energie',   'eon');
