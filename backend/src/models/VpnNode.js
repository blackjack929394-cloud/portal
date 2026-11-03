import { randomUUID } from 'node:crypto';
import { query } from '../db/postgres.js';

// Хранилище VPN-нод (выходных точек).
// Каждая нода — это VM с развёрнутым VPN-стеком (sing-box, xray, hysteria2, wg и т.д.).

function rowToNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    kind: row.kind,
    region: row.region,
    provider: row.provider,
    status: row.status,
    publicKey: row.public_key,
    extra: row.extra_json ? JSON.parse(row.extra_json) : {},
    deploymentStatus: row.deployment_status,
    deploymentError: row.deployment_error,
    wgTunnelIp: row.wg_tunnel_ip,
    wgPublicKey: row.wg_public_key,
    wgPrivateKey: row.wg_private_key,
    sshHost: row.ssh_host,
    sshPort: row.ssh_port,
    sshUser: row.ssh_user,
    sshKey: row.ssh_key,
    sshKeyPath: row.ssh_key_path,
    sshKeyBase64: row.ssh_key_base64,
    intermediateHost: row.intermediate_host,
    intermediatePublicPort: row.intermediate_public_port,
    hysteriaConfig: row.hysteria_config_json ? JSON.parse(row.hysteria_config_json) : null,
    trafficStatsEnabled: row.traffic_stats_enabled,
    trafficStatsEndpoint: row.traffic_stats_endpoint,
    trafficStatsSecret: row.traffic_stats_secret,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
  };
}

class VpnNodeStore {
  async create({ name, host, port, protocol, kind, region, provider, publicKey, extra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64 }) {
    const now = new Date().toISOString();
    const rec = {
      id: randomUUID(),
      name,
      host,
      port: port || 443,
      protocol: protocol || 'sing-box',
      kind: kind || protocol || 'sing-box',
      region: region || null,
      provider: provider || null,
      status: 'active',
      publicKey: publicKey || null,
      extra: extra || {},
      deploymentStatus: 'pending',
      deploymentError: null,
      wgTunnelIp: null,
      wgPublicKey: null,
      wgPrivateKey: null,
      sshHost: sshHost || host || null,
      sshPort: sshPort || 22,
      sshUser: sshUser || 'root',
      sshKey: sshKey || null,
      sshKeyPath: sshKeyPath || null,
      sshKeyBase64: sshKeyBase64 || null,
      intermediateHost: null,
      intermediatePublicPort: null,
      hysteriaConfig: null,
      trafficStatsEnabled: false,
      trafficStatsEndpoint: null,
      trafficStatsSecret: null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null,
    };
    await query(
      `INSERT INTO vpn_nodes (id, name, host, port, protocol, kind, region, provider, status, public_key, extra_json,
        deployment_status, deployment_error, wg_tunnel_ip, wg_public_key, wg_private_key,
        ssh_host, ssh_port, ssh_user, ssh_key, ssh_key_path, ssh_key_base64,
        intermediate_host, intermediate_public_port, hysteria_config_json,
        traffic_stats_enabled, traffic_stats_endpoint, traffic_stats_secret,
        created_at, updated_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)`,
      [rec.id, rec.name, rec.host, rec.port, rec.protocol, rec.kind, rec.region, rec.provider, rec.status,
        rec.publicKey, JSON.stringify(rec.extra),
        rec.deploymentStatus, rec.deploymentError, rec.wgTunnelIp, rec.wgPublicKey, rec.wgPrivateKey,
        rec.sshHost, rec.sshPort, rec.sshUser, rec.sshKey, rec.sshKeyPath, rec.sshKeyBase64,
        rec.intermediateHost, rec.intermediatePublicPort, JSON.stringify(rec.hysteriaConfig),
        rec.trafficStatsEnabled, rec.trafficStatsEndpoint, rec.trafficStatsSecret,
        rec.createdAt, rec.updatedAt, rec.lastSeenAt],
    );
    return rec;
  }

  async get(id) {
    const { rows } = await query('SELECT * FROM vpn_nodes WHERE id = $1', [id]);
    return rowToNode(rows[0]);
  }

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) return null;
    const rec = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await query(
      `UPDATE vpn_nodes SET
        name = $1, host = $2, port = $3, protocol = $4, kind = $5, region = $6, provider = $7, status = $8, public_key = $9, extra_json = $10,
        deployment_status = $11, deployment_error = $12, wg_tunnel_ip = $13, wg_public_key = $14, wg_private_key = $15,
        ssh_host = $16, ssh_port = $17, ssh_user = $18, ssh_key = $19, ssh_key_path = $20, ssh_key_base64 = $21,
        intermediate_host = $22, intermediate_public_port = $23, hysteria_config_json = $24,
        traffic_stats_enabled = $25, traffic_stats_endpoint = $26, traffic_stats_secret = $27,
        updated_at = $28, last_seen_at = $29
       WHERE id = $30`,
      [rec.name, rec.host, rec.port, rec.protocol, rec.kind, rec.region, rec.provider, rec.status, rec.publicKey, JSON.stringify(rec.extra || {}),
        rec.deploymentStatus, rec.deploymentError, rec.wgTunnelIp, rec.wgPublicKey, rec.wgPrivateKey,
        rec.sshHost, rec.sshPort, rec.sshUser, rec.sshKey, rec.sshKeyPath, rec.sshKeyBase64,
        rec.intermediateHost, rec.intermediatePublicPort, JSON.stringify(rec.hysteriaConfig),
        rec.trafficStatsEnabled, rec.trafficStatsEndpoint, rec.trafficStatsSecret,
        rec.updatedAt, rec.lastSeenAt, rec.id],
    );
    return rec;
  }

  async delete(id) {
    await query('DELETE FROM vpn_nodes WHERE id = $1', [id]);
  }

  async listAll() {
    const { rows } = await query('SELECT * FROM vpn_nodes ORDER BY created_at DESC');
    return rows.map(rowToNode);
  }

  async listActive() {
    const { rows } = await query("SELECT * FROM vpn_nodes WHERE status = 'active' ORDER BY created_at DESC");
    return rows.map(rowToNode);
  }
}

export const vpnNodeStore = new VpnNodeStore();
