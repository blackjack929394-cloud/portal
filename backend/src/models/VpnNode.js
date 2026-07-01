import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Хранилище VPN-нод (выходных точек).
// Каждая нода — это VM с развёрнутым VPN-стеком (sing-box, xray, hysteria2, wg и т.д.).

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(dirName, '../../storage-test')
  : path.resolve(dirName, '../../storage');
const DB_PATH = path.join(STORAGE_DIR, 'vpn_nodes.db');

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vpn_nodes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      host        TEXT NOT NULL,
      port        INTEGER NOT NULL DEFAULT 443,
      protocol    TEXT NOT NULL DEFAULT 'sing-box',
      kind        TEXT NOT NULL DEFAULT 'sing-box',
      region      TEXT,
      provider    TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      public_key  TEXT,
      extra_json  TEXT,
      deployment_status TEXT,
      deployment_error  TEXT,
      wg_tunnel_ip      TEXT,
      wg_public_key     TEXT,
      wg_private_key    TEXT,
      ssh_host          TEXT,
      ssh_port          INTEGER DEFAULT 22,
      ssh_user          TEXT DEFAULT 'root',
      ssh_key           TEXT,
      ssh_key_path      TEXT,
      ssh_key_base64    TEXT,
      intermediate_host       TEXT,
      intermediate_public_port INTEGER,
      hysteria_config_json    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      last_seen_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vn_stat ON vpn_nodes(status);
    CREATE INDEX IF NOT EXISTS idx_vn_kind ON vpn_nodes(kind);
  `);

  // Миграции: добавляем колонки, если их нет (для существующих БД)
  const columns = db.prepare("PRAGMA table_info(vpn_nodes)").all().map((r) => r.name);
  const additions = [
    { name: 'kind', def: "TEXT NOT NULL DEFAULT 'sing-box'" },
    { name: 'deployment_status', def: 'TEXT' },
    { name: 'deployment_error', def: 'TEXT' },
    { name: 'wg_tunnel_ip', def: 'TEXT' },
    { name: 'wg_public_key', def: 'TEXT' },
    { name: 'wg_private_key', def: 'TEXT' },
    { name: 'ssh_host', def: 'TEXT' },
    { name: 'ssh_port', def: 'INTEGER DEFAULT 22' },
    { name: 'ssh_user', def: "TEXT DEFAULT 'root'" },
    { name: 'ssh_key', def: 'TEXT' },
    { name: 'ssh_key_path', def: 'TEXT' },
    { name: 'ssh_key_base64', def: 'TEXT' },
    { name: 'intermediate_host', def: 'TEXT' },
    { name: 'intermediate_public_port', def: 'INTEGER' },
    { name: 'hysteria_config_json', def: 'TEXT' },
  ];
  for (const col of additions) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE vpn_nodes ADD COLUMN ${col.name} ${col.def}`);
    }
  }

  return db;
}

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

class VpnNodeStore {
  create({ name, host, port, protocol, kind, region, provider, publicKey, extra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64 }) {
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
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null,
    };
    getDb()
      .prepare(
        `INSERT INTO vpn_nodes (id, name, host, port, protocol, kind, region, provider, status, public_key, extra_json,
          deployment_status, deployment_error, wg_tunnel_ip, wg_public_key, wg_private_key,
          ssh_host, ssh_port, ssh_user, ssh_key, ssh_key_path, ssh_key_base64,
          intermediate_host, intermediate_public_port, hysteria_config_json, created_at, updated_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.id, rec.name, rec.host, rec.port, rec.protocol, rec.kind, rec.region, rec.provider, rec.status,
        rec.publicKey, JSON.stringify(rec.extra),
        rec.deploymentStatus, rec.deploymentError, rec.wgTunnelIp, rec.wgPublicKey, rec.wgPrivateKey,
        rec.sshHost, rec.sshPort, rec.sshUser, rec.sshKey, rec.sshKeyPath, rec.sshKeyBase64,
        rec.intermediateHost, rec.intermediatePublicPort, JSON.stringify(rec.hysteriaConfig),
        rec.createdAt, rec.updatedAt, rec.lastSeenAt,
      );
    return rec;
  }

  get(id) {
    return rowToNode(getDb().prepare('SELECT * FROM vpn_nodes WHERE id = ?').get(id));
  }

  update(id, patch) {
    const existing = this.get(id);
    if (!existing) return null;
    const rec = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    getDb()
      .prepare(
        `UPDATE vpn_nodes SET
          name = ?, host = ?, port = ?, protocol = ?, kind = ?, region = ?, provider = ?, status = ?, public_key = ?, extra_json = ?,
          deployment_status = ?, deployment_error = ?, wg_tunnel_ip = ?, wg_public_key = ?, wg_private_key = ?,
          ssh_host = ?, ssh_port = ?, ssh_user = ?, ssh_key = ?, ssh_key_path = ?, ssh_key_base64 = ?,
          intermediate_host = ?, intermediate_public_port = ?, hysteria_config_json = ?, updated_at = ?, last_seen_at = ?
         WHERE id = ?`,
      )
      .run(
        rec.name, rec.host, rec.port, rec.protocol, rec.kind, rec.region, rec.provider, rec.status, rec.publicKey, JSON.stringify(rec.extra || {}),
        rec.deploymentStatus, rec.deploymentError, rec.wgTunnelIp, rec.wgPublicKey, rec.wgPrivateKey,
        rec.sshHost, rec.sshPort, rec.sshUser, rec.sshKey, rec.sshKeyPath, rec.sshKeyBase64,
        rec.intermediateHost, rec.intermediatePublicPort, JSON.stringify(rec.hysteriaConfig),
        rec.updatedAt, rec.lastSeenAt, rec.id,
      );
    return rec;
  }

  delete(id) {
    getDb().prepare('DELETE FROM vpn_nodes WHERE id = ?').run(id);
  }

  listAll() {
    return getDb()
      .prepare('SELECT * FROM vpn_nodes ORDER BY created_at DESC')
      .all()
      .map(rowToNode);
  }

  listActive() {
    return getDb()
      .prepare("SELECT * FROM vpn_nodes WHERE status = 'active' ORDER BY created_at DESC")
      .all()
      .map(rowToNode);
  }
}

export const vpnNodeStore = new VpnNodeStore();
