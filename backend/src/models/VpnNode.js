import { randomUUID } from 'node:crypto';
import { query } from '../db/postgres.js';
import { seal, open } from '../utils/secretBox.js';

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
    wgPrivateKey: open(row.wg_private_key),
    sshHost: row.ssh_host,
    sshPort: row.ssh_port,
    sshUser: row.ssh_user,
    sshKey: open(row.ssh_key),
    sshKeyPath: row.ssh_key_path,
    sshKeyBase64: open(row.ssh_key_base64),
    intermediateHost: row.intermediate_host,
    intermediatePublicPort: row.intermediate_public_port,
    hysteriaConfig: (() => {
      if (!row.hysteria_config_json) return null;
      const parsed = JSON.parse(row.hysteria_config_json);
      if (parsed && parsed.password) parsed.password = open(parsed.password);
      return parsed;
    })(),
    trafficStatsEnabled: row.traffic_stats_enabled,
    trafficStatsEndpoint: row.traffic_stats_endpoint,
    trafficStatsSecret: open(row.traffic_stats_secret),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    healthStatus: row.health_status || 'unknown',
    healthCheckedAt: row.health_checked_at ? new Date(row.health_checked_at).toISOString() : null,
    healthLatencyMs: row.health_latency_ms ?? null,
    healthFailCount: row.health_fail_count ?? 0,
    healthError: row.health_error || null,
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

  // Атомарный UPDATE только переданных полей. Раньше метод делал
  // read-modify-write и затирал поля, которые параллельно менял health-check.
  async update(id, patch) {
    const columns = {
      name: 'name',
      host: 'host',
      port: 'port',
      protocol: 'protocol',
      kind: 'kind',
      region: 'region',
      provider: 'provider',
      status: 'status',
      publicKey: 'public_key',
      extra: 'extra_json',
      deploymentStatus: 'deployment_status',
      deploymentError: 'deployment_error',
      wgTunnelIp: 'wg_tunnel_ip',
      wgPublicKey: 'wg_public_key',
      wgPrivateKey: 'wg_private_key',
      sshHost: 'ssh_host',
      sshPort: 'ssh_port',
      sshUser: 'ssh_user',
      sshKey: 'ssh_key',
      sshKeyPath: 'ssh_key_path',
      sshKeyBase64: 'ssh_key_base64',
      intermediateHost: 'intermediate_host',
      intermediatePublicPort: 'intermediate_public_port',
      hysteriaConfig: 'hysteria_config_json',
      trafficStatsEnabled: 'traffic_stats_enabled',
      trafficStatsEndpoint: 'traffic_stats_endpoint',
      trafficStatsSecret: 'traffic_stats_secret',
      lastSeenAt: 'last_seen_at',
      healthStatus: 'health_status',
      healthCheckedAt: 'health_checked_at',
      healthLatencyMs: 'health_latency_ms',
      healthFailCount: 'health_fail_count',
      healthError: 'health_error',
    };
    const jsonColumns = new Set(['extra_json', 'hysteria_config_json']);
    const secretColumns = new Set(['wg_private_key', 'ssh_key', 'ssh_key_base64', 'traffic_stats_secret']);

    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in patch)) continue;
      let value;
      if (column === 'hysteria_config_json') {
        const configValue = patch[key] == null ? null : { ...patch[key] };
        if (configValue?.password) configValue.password = seal(configValue.password);
        value = configValue == null ? null : JSON.stringify(configValue);
      } else if (column === 'extra_json') {
        value = patch[key] == null ? null : JSON.stringify(patch[key]);
      } else if (secretColumns.has(column)) {
        value = seal(patch[key]);
      } else {
        value = patch[key];
      }
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return this.get(id);

    sets.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await query(
      `UPDATE vpn_nodes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return rowToNode(rows[0]);
  }

  async addHealthCheck(nodeId, { status, latencyMs = null, error = null }) {
    await query(
      `INSERT INTO vpn_node_health_checks (node_id, status, latency_ms, error)
       VALUES ($1, $2, $3, $4)`,
      [nodeId, status, latencyMs, error],
    );
  }

  async listHealthChecks(nodeId, limit = 50) {
    const { rows } = await query(
      `SELECT status, latency_ms, error, checked_at
         FROM vpn_node_health_checks
        WHERE node_id = $1
        ORDER BY checked_at DESC
        LIMIT $2`,
      [nodeId, Math.min(Math.max(limit, 1), 500)],
    );
    return rows.map((r) => ({
      status: r.status,
      latencyMs: r.latency_ms,
      error: r.error,
      checkedAt: new Date(r.checked_at).toISOString(),
    }));
  }

  async delete(id) {
    await query('DELETE FROM vpn_nodes WHERE id = $1', [id]);
  }

  async listAll() {
    const { rows } = await query('SELECT * FROM vpn_nodes ORDER BY created_at DESC');
    return rows.map(rowToNode);
  }

  // После падения процесса нода могла остаться в статусе deploying навсегда.
  // При старте возвращаем такие записи в failed, чтобы админ увидел проблему.
  async reconcileStuckDeployments() {
    const { rows } = await query(
      `UPDATE vpn_nodes
          SET deployment_status = 'failed',
              deployment_error = COALESCE(deployment_error, 'deployment interrupted by process restart'),
              updated_at = NOW()
        WHERE deployment_status = 'deploying'
        RETURNING id, name`,
    );
    return rows;
  }

  async listActive() {
    const { rows } = await query("SELECT * FROM vpn_nodes WHERE status = 'active' ORDER BY created_at DESC");
    return rows.map(rowToNode);
  }
}

export const vpnNodeStore = new VpnNodeStore();
