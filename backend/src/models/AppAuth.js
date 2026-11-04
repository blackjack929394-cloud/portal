import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { query, transaction } from '../db/postgres.js';

// Хранилище QR-сессий и токенов клиентского приложения.
// В БД лежат только хэши секретов: утечка дампа не даёт войти в аккаунт.

export function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userSub: row.user_sub,
    userName: row.user_name,
    userEmail: row.user_email,
    userKind: row.user_kind,
    status: row.status,
    deviceName: row.device_name,
    platform: row.platform,
    appVersion: row.app_version,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    scannedAt: iso(row.scanned_at),
    confirmedAt: iso(row.confirmed_at),
    approvedAt: iso(row.approved_at),
    cancelledAt: iso(row.cancelled_at),
  };
}

function rowToToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userSub: row.user_sub,
    userName: row.user_name,
    userEmail: row.user_email,
    userKind: row.user_kind,
    deviceName: row.device_name,
    platform: row.platform,
    appVersion: row.app_version,
    createdAt: iso(row.created_at),
    lastUsedAt: iso(row.last_used_at),
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at),
  };
}

class AppAuthStore {
  // ── QR-сессии (вход с телефона) ──────────────────────────────────────────

  async createLoginSession({ user, code, expiresAt }) {
    const id = randomUUID();
    const { rows } = await query(
      `INSERT INTO app_login_sessions
         (id, code_hash, user_sub, user_name, user_email, user_kind, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [id, hashSecret(code), user.sub, user.name || null, user.email || null, user.kind || 'user', expiresAt],
    );
    return rowToSession(rows[0]);
  }

  async getLoginSession(id) {
    const { rows } = await query('SELECT * FROM app_login_sessions WHERE id = $1', [id]);
    return rowToSession(rows[0]);
  }

  async findLoginSessionByCode(code) {
    const { rows } = await query(
      'SELECT * FROM app_login_sessions WHERE code_hash = $1',
      [hashSecret(code)],
    );
    return rowToSession(rows[0]);
  }

  // Первое сканирование выигрывает: второй телефон не может перехватить QR.
  async markScanned(id, { deviceName, platform, appVersion }) {
    const { rows } = await query(
      `UPDATE app_login_sessions
          SET status = 'scanned',
              device_name = $2,
              platform = $3,
              app_version = $4,
              scanned_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, deviceName || null, platform || null, appVersion || null],
    );
    return rowToSession(rows[0]);
  }

  async markConfirmed(id) {
    const { rows } = await query(
      `UPDATE app_login_sessions
          SET status = 'confirmed', confirmed_at = NOW()
        WHERE id = $1 AND status = 'scanned'
        RETURNING *`,
      [id],
    );
    return rowToSession(rows[0]);
  }

  async markApproved(id) {
    const { rows } = await query(
      `UPDATE app_login_sessions
          SET status = 'approved', approved_at = NOW()
        WHERE id = $1 AND status = 'confirmed'
        RETURNING *`,
      [id],
    );
    return rowToSession(rows[0]);
  }

  async cancel(id) {
    const { rows } = await query(
      `UPDATE app_login_sessions
          SET status = 'cancelled', cancelled_at = NOW()
        WHERE id = $1 AND status IN ('pending', 'scanned', 'confirmed')
        RETURNING *`,
      [id],
    );
    return rowToSession(rows[0]);
  }

  async expire(id) {
    const { rows } = await query(
      `UPDATE app_login_sessions
          SET status = 'expired'
        WHERE id = $1 AND status IN ('pending', 'scanned', 'confirmed')
        RETURNING *`,
      [id],
    );
    return rowToSession(rows[0]);
  }

  // ── Токены устройств (Bearer) ────────────────────────────────────────────

  async createToken({ user, token, expiresAt, deviceName, platform, appVersion }) {
    const id = randomUUID();
    const { rows } = await query(
      `INSERT INTO app_tokens
         (id, token_hash, user_sub, user_name, user_email, user_kind,
          device_name, platform, app_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id, hashSecret(token), user.sub, user.name || null, user.email || null, user.kind || 'user',
        deviceName || null, platform || null, appVersion || null, expiresAt,
      ],
    );
    return rowToToken(rows[0]);
  }

  async findLiveTokenByHash(tokenHash) {
    const { rows } = await query(
      `SELECT * FROM app_tokens
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash],
    );
    return rowToToken(rows[0]);
  }

  // Обновляем last_used_at не на каждом запросе, чтобы не писать в БД зря.
  async touchToken(id) {
    await query(
      `UPDATE app_tokens
          SET last_used_at = NOW()
        WHERE id = $1
          AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '5 minutes')`,
      [id],
    );
  }

  async revokeToken(id) {
    const { rows } = await query(
      `UPDATE app_tokens
          SET revoked_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING *`,
      [id],
    );
    return rowToToken(rows[0]);
  }

  async revokeTokenForUser(id, userSub) {
    const { rows } = await query(
      `UPDATE app_tokens
          SET revoked_at = NOW()
        WHERE id = $1 AND user_sub = $2 AND revoked_at IS NULL
        RETURNING *`,
      [id, userSub],
    );
    return rowToToken(rows[0]);
  }

  // Принимает сырой токен (как пришёл в Authorization), хэширует сам.
  async revokeTokenByRaw(rawToken) {
    const { rows } = await query(
      `UPDATE app_tokens
          SET revoked_at = NOW()
        WHERE token_hash = $1 AND revoked_at IS NULL
        RETURNING *`,
      [hashSecret(rawToken)],
    );
    return rowToToken(rows[0]);
  }

  async listTokens(userSub) {
    const { rows } = await query(
      `SELECT * FROM app_tokens
        WHERE user_sub = $1
        ORDER BY created_at DESC`,
      [userSub],
    );
    return rows.map(rowToToken);
  }

  // Для админки: все устройства всех аккаунтов, включая отозванные.
  async listAllTokens() {
    const { rows } = await query(
      'SELECT * FROM app_tokens ORDER BY last_used_at DESC NULLS LAST, created_at DESC',
    );
    return rows.map(rowToToken);
  }

  // Атомарно: confirmed → approved + выдача токена. Два одновременных claim
  // не создадут два токена — второй увидит, что статус уже не confirmed.
  async claimLoginSession({ id, token, expiresAt }) {
    return transaction(async (client) => {
      const updated = await client.query(
        `UPDATE app_login_sessions
            SET status = 'approved', approved_at = NOW()
          WHERE id = $1
            AND status = 'confirmed'
            AND expires_at > NOW()
          RETURNING *`,
        [id],
      );
      if (!updated.rows[0]) return { error: 'NOT_CONFIRMED' };

      const session = rowToSession(updated.rows[0]);
      const tokenId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO app_tokens
           (id, token_hash, user_sub, user_name, user_email, user_kind,
            device_name, platform, app_version, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tokenId, hashSecret(token), session.userSub, session.userName,
          session.userEmail, session.userKind, session.deviceName,
          session.platform, session.appVersion, expiresAt,
        ],
      );
      return { session, token: rowToToken(inserted.rows[0]) };
    });
  }
}

export const appAuthStore = new AppAuthStore();
