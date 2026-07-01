import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Хранилище подписок (VPN-доступов) сотрудников.
// Каждая подписка — это право пользователя получать актуальные конфигурации по subscription URL.

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(dirName, '../../storage-test')
  : path.resolve(dirName, '../../storage');
const DB_PATH = path.join(STORAGE_DIR, 'vpn_subscriptions.db');

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vpn_subscriptions (
      id              TEXT PRIMARY KEY,
      user_sub        TEXT NOT NULL,
      user_name       TEXT,
      user_email      TEXT,
      token           TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'active',
      expires_at      TEXT,
      traffic_limit_gb INTEGER,
      traffic_used_gb  REAL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      revoked_at      TEXT,
      revoked_reason  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vs_token ON vpn_subscriptions(token);
    CREATE INDEX IF NOT EXISTS idx_vs_user  ON vpn_subscriptions(user_sub);
    CREATE INDEX IF NOT EXISTS idx_vs_stat  ON vpn_subscriptions(status);
  `);
  return db;
}

function rowToSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    userSub: row.user_sub,
    userName: row.user_name,
    userEmail: row.user_email,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    trafficLimitGb: row.traffic_limit_gb,
    trafficUsedGb: row.traffic_used_gb,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}

class VpnSubscriptionStore {
  create({ userSub, userName, userEmail, token, expiresAt, trafficLimitGb }) {
    const now = new Date().toISOString();
    const rec = {
      id: randomUUID(),
      userSub,
      userName: userName || null,
      userEmail: userEmail || null,
      token,
      status: 'active',
      expiresAt: expiresAt || null,
      trafficLimitGb: trafficLimitGb || null,
      trafficUsedGb: 0,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      revokedReason: null,
    };
    getDb()
      .prepare(
        `INSERT INTO vpn_subscriptions (id, user_sub, user_name, user_email, token, status, expires_at, traffic_limit_gb, traffic_used_gb, created_at, updated_at, revoked_at, revoked_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.id, rec.userSub, rec.userName, rec.userEmail, rec.token, rec.status,
        rec.expiresAt, rec.trafficLimitGb, rec.trafficUsedGb, rec.createdAt, rec.updatedAt, rec.revokedAt, rec.revokedReason,
      );
    return rec;
  }

  get(id) {
    return rowToSub(getDb().prepare('SELECT * FROM vpn_subscriptions WHERE id = ?').get(id));
  }

  findByToken(token) {
    return rowToSub(getDb().prepare('SELECT * FROM vpn_subscriptions WHERE token = ?').get(token));
  }

  findByUserSub(userSub) {
    return getDb()
      .prepare('SELECT * FROM vpn_subscriptions WHERE user_sub = ? ORDER BY created_at DESC')
      .all(userSub)
      .map(rowToSub);
  }

  update(id, patch) {
    const existing = this.get(id);
    if (!existing) return null;
    const rec = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    getDb()
      .prepare(
        `UPDATE vpn_subscriptions SET
          user_sub = ?, user_name = ?, user_email = ?, token = ?, status = ?,
          expires_at = ?, traffic_limit_gb = ?, traffic_used_gb = ?, updated_at = ?, revoked_at = ?, revoked_reason = ?
         WHERE id = ?`,
      )
      .run(
        rec.userSub, rec.userName, rec.userEmail, rec.token, rec.status,
        rec.expiresAt, rec.trafficLimitGb, rec.trafficUsedGb, rec.updatedAt, rec.revokedAt, rec.revokedReason, rec.id,
      );
    return rec;
  }

  revoke(id, reason) {
    return this.update(id, { status: 'revoked', revokedAt: new Date().toISOString(), revokedReason: reason || null });
  }

  listAll() {
    return getDb()
      .prepare('SELECT * FROM vpn_subscriptions ORDER BY created_at DESC')
      .all()
      .map(rowToSub);
  }

  listActive() {
    return getDb()
      .prepare("SELECT * FROM vpn_subscriptions WHERE status = 'active' ORDER BY created_at DESC")
      .all()
      .map(rowToSub);
  }

  // Подписки, которые действительно активны: статус active и не истёк срок,
  // и не превышен лимит трафика.
  listEffectiveActive() {
    const now = new Date().toISOString();
    return getDb()
      .prepare(
        `SELECT * FROM vpn_subscriptions
         WHERE status = 'active'
           AND (expires_at IS NULL OR expires_at > ?)
           AND (traffic_limit_gb IS NULL OR traffic_used_gb < traffic_limit_gb)
         ORDER BY created_at DESC`,
      )
      .all(now)
      .map(rowToSub);
  }
}

export const vpnSubscriptionStore = new VpnSubscriptionStore();
