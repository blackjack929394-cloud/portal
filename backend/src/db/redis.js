import { createClient } from 'redis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const client = createClient({
  url: config.redis.url,
});

client.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

await client.connect();

export default client;
