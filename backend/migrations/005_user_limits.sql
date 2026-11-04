-- Индивидуальные лимиты аккаунта: количество устройств и трафик.
-- Значения по умолчанию — 5 устройств и 150 ГБ; админ может изменить.

CREATE TABLE IF NOT EXISTS user_limits (
  user_sub         TEXT PRIMARY KEY,
  device_limit     INTEGER NOT NULL DEFAULT 5,
  traffic_limit_gb INTEGER NOT NULL DEFAULT 150,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
