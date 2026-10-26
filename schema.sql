-- talkingpoints.gershon.ai — D1 schema

-- One row per Gershon client (e.g. Valos). Each client maps to one Streak "<Client> - LG" pipeline.
CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,          -- 'valos'
  name          TEXT NOT NULL,                 -- 'Valos Srl'
  pipeline_key  TEXT NOT NULL DEFAULT '',      -- Streak pipeline key (chosen in Settings)
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
  can_manage       INTEGER NOT NULL DEFAULT 0, -- may edit the client's Settings
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

-- Client settings, edited on the Settings page. Secrets are AES-GCM encrypted at rest.
CREATE TABLE IF NOT EXISTS client_settings (
  client_id           INTEGER PRIMARY KEY REFERENCES clients(id),
  streak_key_enc      TEXT NOT NULL DEFAULT '',
  streak_key_hint     TEXT NOT NULL DEFAULT '',   -- last 4 characters, for display
  recipients          TEXT NOT NULL DEFAULT '',   -- comma-separated emails that receive talking points
  google_refresh_enc  TEXT NOT NULL DEFAULT '',
  google_email        TEXT NOT NULL DEFAULT '',
  calendar_id         TEXT NOT NULL DEFAULT 'primary',
  lead_hours          INTEGER NOT NULL DEFAULT 48, -- send talking points this many hours before a meeting
  streak_checked_at   INTEGER NOT NULL DEFAULT 0,  -- ms epoch of the last new-lead check
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per calendar meeting we prepared talking points for.
CREATE TABLE IF NOT EXISTS meetings (
  client_id     INTEGER NOT NULL REFERENCES clients(id),
  event_id      TEXT NOT NULL,
  box_key       TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  attendee      TEXT NOT NULL DEFAULT '',
  starts_at     TEXT NOT NULL,
  sent_at       TEXT,
  PRIMARY KEY (client_id, event_id)
);

-- Talking-points template per client: which sections appear, plus the client's own company & ICP
-- (used by the AI for "What you have in common" and "Lead with this").
CREATE TABLE IF NOT EXISTS client_templates (
  client_id   INTEGER PRIMARY KEY REFERENCES clients(id),
  disabled    TEXT NOT NULL DEFAULT '',   -- comma list of section ids switched off
  company     TEXT NOT NULL DEFAULT '',   -- the client's company, as on its LinkedIn page
  icp         TEXT NOT NULL DEFAULT '',   -- ideal customer profile
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
