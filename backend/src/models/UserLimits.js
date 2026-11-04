import { query } from '../db/postgres.js';

// Индивидуальные лимиты аккаунта. Если строки нет — действуют значения
// по умолчанию из конфига (5 устройств, 150 ГБ).
function rowToLimits(row) {
  if (!row) return null;
  return {
    userSub: row.user_sub,
    deviceLimit: row.device_limit,
    trafficLimitGb: row.traffic_limit_gb,
    updatedAt: row.updated_at,
  };
}

class UserLimitsStore {
  async get(userSub) {
    const { rows } = await query('SELECT * FROM user_limits WHERE user_sub = $1', [userSub]);
    return rowToLimits(rows[0]);
  }

  async upsert(userSub, { deviceLimit, trafficLimitGb }) {
    const { rows } = await query(
      `INSERT INTO user_limits (user_sub, device_limit, traffic_limit_gb, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_sub) DO UPDATE SET
         device_limit = EXCLUDED.device_limit,
         traffic_limit_gb = EXCLUDED.traffic_limit_gb,
         updated_at = NOW()
       RETURNING *`,
      [userSub, deviceLimit, trafficLimitGb],
    );
    return rowToLimits(rows[0]);
  }
}

export const userLimitsStore = new UserLimitsStore();
