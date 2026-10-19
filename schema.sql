-- talkingpoints.gershon.ai — D1 schema

-- One row per Gershon client (e.g. Valos). Each client maps to one Streak "<Client> - LG" pipeline.
CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,          -- 'valos'
  name          TEXT NOT NULL,                 -- 'Valos Srl'
  pipeline_key  TEXT NOT NULL,                 -- Streak pipeline key
  email_domains TEXT NOT NULL DEFAULT '',      -- comma list, e.g. 'valos.it,valosbygc.com'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- People allowed to sign in (LinkedIn email must match one row, or match a client email domain).
CREATE TABLE IF NOT EXISTS members (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER NOT NULL REFERENCES clients(id),
  email            TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  title            TEXT NOT NULL DEFAULT '',
  linkedin_url     TEXT NOT NULL DEFAULT '',
  linkedin_sub     TEXT,                       -- OIDC subject, set at first login
  picture          TEXT NOT NULL DEFAULT '',
  background       TEXT NOT NULL DEFAULT '',   -- career summary used for "what you have in common"
  is_admin         INTEGER NOT NULL DEFAULT 0, -- Gershon staff
  notify           INTEGER NOT NULL DEFAULT 1, -- receives a talking-point email per new lead
  last_login_at    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One talking-point brief per Streak box (lead).
-- `data` is the full brief as JSON (structure documented in functions/_render.js).
CREATE TABLE IF NOT EXISTS briefs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  box_key     TEXT UNIQUE NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  lead_name   TEXT NOT NULL DEFAULT '',
  lead_role   TEXT NOT NULL DEFAULT '',
  stage       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft',   -- 'draft' (auto) | 'ready' (researched, reviewed)
  data        TEXT NOT NULL DEFAULT '{}',
  emailed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS briefs_client ON briefs(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                -- random token (cookie value is HMAC-signed)
  member_id   INTEGER NOT NULL REFERENCES members(id),
  expires_at  TEXT NOT NULL
);
