-- Initial PostgreSQL schema for VPN portal (migration from SQLite).
-- Run as the application user (e.g. vpnportal).

CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  full_name  TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,
  pass_salt  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  blocked    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS employees (
  sub        TEXT PRIMARY KEY,
  full_name  TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS guests (
  email      TEXT PRIMARY KEY,
  full_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vpn_subscriptions (
  id                TEXT PRIMARY KEY,
  user_sub          TEXT NOT NULL,
  user_name         TEXT,
  user_email        TEXT,
  token             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'active',
  expires_at        TIMESTAMPTZ,
  traffic_limit_gb  INTEGER,
  traffic_used_gb   REAL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT
);

CREATE INDEX IF NOT EXISTS idx_vs_token ON vpn_subscriptions(token);
CREATE INDEX IF NOT EXISTS idx_vs_user  ON vpn_subscriptions(user_sub);
CREATE INDEX IF NOT EXISTS idx_vs_stat  ON vpn_subscriptions(status);

CREATE TABLE IF NOT EXISTS vpn_nodes (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  host                     TEXT NOT NULL,
  port                     INTEGER NOT NULL DEFAULT 443,
  protocol                 TEXT NOT NULL DEFAULT 'sing-box',
  kind                     TEXT NOT NULL DEFAULT 'sing-box',
  region                   TEXT,
  provider                 TEXT,
  status                   TEXT NOT NULL DEFAULT 'active',
  public_key               TEXT,
  extra_json               TEXT DEFAULT '{}',
  deployment_status        TEXT,
  deployment_error         TEXT,
  wg_tunnel_ip             TEXT,
  wg_public_key            TEXT,
  wg_private_key           TEXT,
  ssh_host                 TEXT,
  ssh_port                 INTEGER DEFAULT 22,
  ssh_user                 TEXT DEFAULT 'root',
  ssh_key                  TEXT,
  ssh_key_path             TEXT,
  ssh_key_base64           TEXT,
  intermediate_host        TEXT,
  intermediate_public_port INTEGER,
  hysteria_config_json     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vn_stat ON vpn_nodes(status);
CREATE INDEX IF NOT EXISTS idx_vn_kind ON vpn_nodes(kind);

CREATE TABLE IF NOT EXISTS routing_profiles (
  user_sub       TEXT PRIMARY KEY,
  mode           TEXT NOT NULL DEFAULT 'global',
  ru_direct      BOOLEAN NOT NULL DEFAULT TRUE,
  presets        TEXT NOT NULL DEFAULT '[]',
  proxy_domains  TEXT NOT NULL DEFAULT '[]',
  direct_domains TEXT NOT NULL DEFAULT '[]',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  user_sub      TEXT NOT NULL,
  user_name     TEXT,
  user_email    TEXT,
  sender        TEXT NOT NULL,
  text          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_user  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_cm_user ON chat_messages(user_sub);
