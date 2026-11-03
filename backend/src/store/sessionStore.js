import RedisStore from 'connect-redis';
import redisClient from '../db/redis.js';

export function createSessionStore(session) {
  return new RedisStore({
    client: redisClient,
    prefix: 'dogma:session:',
  });
}
