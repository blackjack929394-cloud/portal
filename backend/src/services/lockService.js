import { randomUUID } from 'node:crypto';
import redis from '../db/redis.js';
import logger from '../utils/logger.js';

// Распределённая блокировка для фоновых задач: при нескольких инстансах
// один и тот же setInterval не должен выполняться дважды.
// При недоступном Redis работаем в деградированном режиме (один инстанс).

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export async function withLock(key, ttlSeconds, fn) {
  if (!redis.isReady) {
    return fn();
  }

  const token = randomUUID();
  let acquired = false;
  try {
    const result = await redis.set(key, token, { NX: true, EX: Math.max(1, ttlSeconds) });
    acquired = result === 'OK';
  } catch (err) {
    logger.warn({ err, key }, 'distributed lock: Redis error, running without lock');
    return fn();
  }

  if (!acquired) {
    return { skipped: true, reason: 'locked' };
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
    } catch (err) {
      logger.warn({ err, key }, 'distributed lock release failed');
    }
  }
}
