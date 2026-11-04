-- Health-check нод: статус, задержка, число подряд идущих ошибок и история.
ALTER TABLE vpn_nodes
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS health_fail_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_error TEXT;

CREATE TABLE IF NOT EXISTS vpn_node_health_checks (
  id         BIGSERIAL PRIMARY KEY,
  node_id    TEXT NOT NULL REFERENCES vpn_nodes(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  latency_ms INTEGER,
  error      TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nhc_node_time ON vpn_node_health_checks(node_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_nhc_time ON vpn_node_health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_health ON vpn_nodes(health_status);
