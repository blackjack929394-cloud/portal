import { createClient } from 'redis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// Redis не должен быть жёсткой точкой отказа при старте: приложение поднимается,
// а клиент переподключается с backoff. Readiness при этом честно показывает 0.
const client = createClient({
  url: config.redis.url,
  socket: {
    reconnectStrategy: (retries) => Math.min(200 * Math.max(1, retries), 5000),
  },
});

client.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});
client.on('ready', () => logger.info('Redis ready'));
client.on('end', () => logger.warn('Redis connection closed'));

let connecting = null;

export function connectRedis() {
  if (client.isReady) return Promise.resolve(client);
  if (connecting) return connecting;
  connecting = client.connect()
    .then(() => client)
    .catch((err) => {
      logger.warn({ err }, 'Redis initial connection failed; will retry in background');
      return null;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

export function isRedisReady() {
  return client.isReady;
}

// Не блокируем импорт/старт приложения.
connectRedis().catch(() => {});

export default client;
