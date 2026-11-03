import { randomUUID } from 'node:crypto';
import { query } from '../db/postgres.js';

// Хранилище подписок (VPN-доступов) сотрудников.
// Каждая подписка — это право пользователя получать актуальные конфигурации по subscription URL.

function rowToSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    userSub: row.user_sub,
    userName: row.user_name,
    userEmail: row.user_email,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    trafficLimitGb: row.traffic_limit_gb,
    trafficUsedGb: row.traffic_used_gb,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revokedReason: row.revoked_reason,
  };
}

class VpnSubscriptionStore {
  async create({ userSub, userName, userEmail, token, expiresAt, trafficLimitGb, status }) {
    const now = new Date().toISOString();
    const rec = {
      id: randomUUID(),
      userSub,
      userName: userName || null,
      userEmail: userEmail || null,
      token,
      status: status || 'active',
      expiresAt: expiresAt || null,
      trafficLimitGb: trafficLimitGb || null,
      trafficUsedGb: 0,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      revokedReason: null,
    };
    await query(
      `INSERT INTO vpn_subscriptions (id, user_sub, user_name, user_email, token, status, expires_at, traffic_limit_gb, traffic_used_gb, created_at, updated_at, revoked_at, revoked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [rec.id, rec.userSub, rec.userName, rec.userEmail, rec.token, rec.status,
        rec.expiresAt, rec.trafficLimitGb, rec.trafficUsedGb, rec.createdAt, rec.updatedAt, rec.revokedAt, rec.revokedReason],
    );
    return rec;
  }

  async get(id) {
    const { rows } = await query('SELECT * FROM vpn_subscriptions WHERE id = $1', [id]);
    return rowToSub(rows[0]);
  }

  async findByToken(token) {
    const { rows } = await query('SELECT * FROM vpn_subscriptions WHERE token = $1', [token]);
    return rowToSub(rows[0]);
  }

  async findByUserSub(userSub) {
    const { rows } = await query('SELECT * FROM vpn_subscriptions WHERE user_sub = $1 ORDER BY created_at DESC', [userSub]);
    return rows.map(rowToSub);
  }

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) return null;
    const rec = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await query(
      `UPDATE vpn_subscriptions SET
        user_sub = $1, user_name = $2, user_email = $3, token = $4, status = $5,
        expires_at = $6, traffic_limit_gb = $7, traffic_used_gb = $8, updated_at = $9, revoked_at = $10, revoked_reason = $11
       WHERE id = $12`,
      [rec.userSub, rec.userName, rec.userEmail, rec.token, rec.status,
        rec.expiresAt, rec.trafficLimitGb, rec.trafficUsedGb, rec.updatedAt, rec.revokedAt, rec.revokedReason, rec.id],
    );
    return rec;
  }

  async updateTrafficByToken(token, trafficUsedGb) {
    await query(
      'UPDATE vpn_subscriptions SET traffic_used_gb = $1, updated_at = $2 WHERE token = $3',
      [trafficUsedGb, new Date().toISOString(), token],
    );
  }

  async revoke(id, reason) {
    return this.update(id, { status: 'revoked', revokedAt: new Date().toISOString(), revokedReason: reason || null });
  }

  async delete(id) {
    await query('DELETE FROM vpn_subscriptions WHERE id = $1', [id]);
  }

  async deleteByUserSub(userSub) {
    await query('DELETE FROM vpn_subscriptions WHERE user_sub = $1', [userSub]);
  }

  // Помечает активные подписки с истёкшим сроком как expired. Идемпотентно:
  // параллельный прогон на второй реплике просто получит 0 строк.
  async markExpired(now = new Date()) {
    const { rows } = await query(
      `UPDATE vpn_subscriptions
          SET status = 'expired', updated_at = $1
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at < $1
        RETURNING id, user_sub`,
      [now.toISOString()],
    );
    return rows.map((row) => ({ id: row.id, userSub: row.user_sub }));
  }

  // Удаляет давно истёкшие подписки (expired/revoked с expires_at < cutoff).
  async deleteDeadBefore(cutoff) {
    const { rowCount } = await query(
      `DELETE FROM vpn_subscriptions
        WHERE status IN ('expired', 'revoked')
          AND expires_at IS NOT NULL
          AND expires_at < $1`,
      [cutoff],
    );
    return rowCount;
  }

  async listAll() {
    const { rows } = await query('SELECT * FROM vpn_subscriptions ORDER BY created_at DESC');
    return rows.map(rowToSub);
  }

  async listActive() {
    const { rows } = await query("SELECT * FROM vpn_subscriptions WHERE status = 'active' ORDER BY created_at DESC");
    return rows.map(rowToSub);
  }

  async listPending() {
    const { rows } = await query("SELECT * FROM vpn_subscriptions WHERE status = 'pending' ORDER BY created_at ASC");
    return rows.map(rowToSub);
  }

  // Самая свежая подписка пользователя (любого статуса) — для решения, нужно ли одобрение.
  async latestByUserSub(userSub) {
    const { rows } = await query('SELECT * FROM vpn_subscriptions WHERE user_sub = $1 ORDER BY created_at DESC LIMIT 1', [userSub]);
    return rowToSub(rows[0]);
  }

  // Подписки, которые действительно активны: статус active и не истёк срок,
  // и не превышен лимит трафика.
  async listEffectiveActive() {
    const now = new Date().toISOString();
    const { rows } = await query(
      `SELECT * FROM vpn_subscriptions
       WHERE status = 'active'
         AND (expires_at IS NULL OR expires_at > $1)
         AND (traffic_limit_gb IS NULL OR traffic_used_gb < traffic_limit_gb)
       ORDER BY created_at DESC`,
      [now],
    );
    return rows.map(rowToSub);
  }
}

export const vpnSubscriptionStore = new VpnSubscriptionStore();
