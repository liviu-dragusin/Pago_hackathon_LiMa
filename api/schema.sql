-- Schema SQLite pentru Pago LiMa (hackathon).
-- Statusul facturii (paid / unpaid / overdue) NU se stochează: se derivă din paid_at și due_date.

CREATE TABLE users (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    email   TEXT NOT NULL,
    county  TEXT              -- cod județ (B, CJ, ...), folosit de harta de furnizori
);

CREATE TABLE providers (
    id       INTEGER PRIMARY KEY,
    slug     TEXT,                   -- legătura cu api/catalog/providers.json (NULL = furnizor din afara catalogului)
    name     TEXT NOT NULL,
    category TEXT NOT NULL,          -- energie | gaz | apa | internet | telefonie | intretinere | comunicatii | salubrizare | diverse
    color    TEXT NOT NULL
);

-- Un cont de client la un furnizor (un user poate avea mai multe la același furnizor)
CREATE TABLE user_providers (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    client_code TEXT NOT NULL,
    alias       TEXT,
    county      TEXT,
    created_at  TEXT,
    source      TEXT NOT NULL DEFAULT 'manual'   -- manual | gmail (conturile gmail se înlocuiesc la fiecare import)
);

CREATE TABLE bills (
    id               INTEGER PRIMARY KEY,
    user_provider_id INTEGER NOT NULL REFERENCES user_providers(id),
    period           TEXT NOT NULL,   -- YYYY-MM
    amount           REAL NOT NULL,
    issued_at        TEXT NOT NULL,   -- YYYY-MM-DD
    due_date         TEXT NOT NULL,   -- YYYY-MM-DD
    paid_at          TEXT,            -- NULL = neplătită
    UNIQUE (user_provider_id, period)
);

CREATE TABLE budgets (
    user_id       INTEGER NOT NULL REFERENCES users(id),
    category      TEXT NOT NULL,
    monthly_limit REAL NOT NULL,
    PRIMARY KEY (user_id, category)
);

-- Plăți split
CREATE TABLE split_groups (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE split_members (
    id       INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES split_groups(id),
    name     TEXT NOT NULL,
    is_owner INTEGER NOT NULL DEFAULT 0
);

-- Cât datorează fiecare membru dintr-o factură împărțită. Owner-ul plătește furnizorul,
-- ceilalți îi dau partea lor (settled_at = când au dat banii).
CREATE TABLE split_shares (
    id         INTEGER PRIMARY KEY,
    bill_id    INTEGER NOT NULL REFERENCES bills(id),
    group_id   INTEGER NOT NULL REFERENCES split_groups(id),
    member_id  INTEGER NOT NULL REFERENCES split_members(id),
    amount     REAL NOT NULL,
    settled_at TEXT,
    UNIQUE (bill_id, member_id)
);

-- Cereri de contract nou trimise din harta de furnizori
CREATE TABLE contract_requests (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    provider_slug TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    category      TEXT NOT NULL,
    county        TEXT NOT NULL,
    locality      TEXT NOT NULL,
    address       TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    phone         TEXT NOT NULL,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'trimisa',   -- trimisa | in_analiza | aprobata | respinsa
    created_at    TEXT NOT NULL
);
