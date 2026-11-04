-- QR-вход в клиентское приложение Dogma.
-- Одноразовые сессии входа (QR) и долгоживущие токены устройств.
-- Секреты в БД не хранятся в открытом виде: только SHA-256 хэши.

CREATE TABLE IF NOT EXISTS app_login_sessions (
  id          TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL UNIQUE,
  user_sub    TEXT NOT NULL,
  user_name   TEXT,
  user_email  TEXT,
  user_kind   TEXT NOT NULL DEFAULT 'user',
  status      TEXT NOT NULL DEFAULT 'pending',
  device_name TEXT,
  platform    TEXT,
  app_version TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  scanned_at  TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_als_user   ON app_login_sessions(user_sub);
CREATE INDEX IF NOT EXISTS idx_als_status ON app_login_sessions(status);
CREATE INDEX IF NOT EXISTS idx_als_exp    ON app_login_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_tokens (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  user_sub     TEXT NOT NULL,
  user_name    TEXT,
  user_email   TEXT,
  user_kind    TEXT NOT NULL DEFAULT 'user',
  device_name  TEXT,
  platform     TEXT,
  app_version  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_at_user ON app_tokens(user_sub);
CREATE INDEX IF NOT EXISTS idx_at_live ON app_tokens(expires_at) WHERE revoked_at IS NULL;
