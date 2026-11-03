-- Add traffic stats API configuration to VPN nodes.
ALTER TABLE vpn_nodes ADD COLUMN IF NOT EXISTS traffic_stats_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vpn_nodes ADD COLUMN IF NOT EXISTS traffic_stats_endpoint TEXT;
ALTER TABLE vpn_nodes ADD COLUMN IF NOT EXISTS traffic_stats_secret TEXT;
