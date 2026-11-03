import { query } from '../db/postgres.js';

// Профиль маршрутизации пользователя (split tunneling).
// Ключ — user_sub, поэтому настройки переживают перевыпуск подписки.

function parseList(json) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    userSub: row.user_sub,
    mode: row.mode,
    ruDirect: row.ru_direct,
    presets: parseList(row.presets),
    proxyDomains: parseList(row.proxy_domains),
    directDomains: parseList(row.direct_domains),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

class RoutingProfileStore {
  async get(userSub) {
    const { rows } = await query('SELECT * FROM routing_profiles WHERE user_sub = $1', [userSub]);
    return rowToProfile(rows[0]);
  }

  // Вставка или полное обновление профиля пользователя.
  async upsert(userSub, { mode, ruDirect, presets, proxyDomains, directDomains }) {
    const now = new Date().toISOString();
    await query(
      `INSERT INTO routing_profiles (user_sub, mode, ru_direct, presets, proxy_domains, direct_domains, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(user_sub) DO UPDATE SET
         mode = EXCLUDED.mode,
         ru_direct = EXCLUDED.ru_direct,
         presets = EXCLUDED.presets,
         proxy_domains = EXCLUDED.proxy_domains,
         direct_domains = EXCLUDED.direct_domains,
         updated_at = EXCLUDED.updated_at`,
      [userSub, mode, ruDirect ? true : false, JSON.stringify(presets || []), JSON.stringify(proxyDomains || []), JSON.stringify(directDomains || []), now],
    );
    return this.get(userSub);
  }

  async delete(userSub) {
    await query('DELETE FROM routing_profiles WHERE user_sub = $1', [userSub]);
  }
}

export const routingProfileStore = new RoutingProfileStore();
