import session from 'express-session';
import RedisStore from 'connect-redis';
import redisClient from '../db/redis.js';
import logger from '../utils/logger.js';

// Если Redis недоступен, сессии продолжают работать в памяти процесса.
// Это деградация, а не штатный режим: при нескольких инстансах сессии
// не будут общими, а после рестарта пользователи перелогинятся.
class ResilientStore extends session.Store {
  constructor(redisStore, memoryStore) {
    super();
    this.redisStore = redisStore;
    this.memoryStore = memoryStore;
  }

  #fallback(method, args) {
    logger.warn({ method }, 'session store: Redis unavailable, falling back to memory');
    return this.memoryStore[method](...args);
  }

  get(sid, cb) {
    this.redisStore.get(sid, (err, session) => {
      if (err) return this.#fallback('get', [sid, cb]);
      return cb(null, session);
    });
  }

  set(sid, session, cb) {
    this.redisStore.set(sid, session, (err) => {
      if (err) return this.#fallback('set', [sid, session, cb]);
      return cb?.(null);
    });
  }

  destroy(sid, cb) {
    this.redisStore.destroy(sid, (err) => {
      if (err) return this.#fallback('destroy', [sid, cb]);
      return cb?.(null);
    });
  }

  touch(sid, session, cb) {
    this.redisStore.touch(sid, session, (err) => {
      if (err) return this.#fallback('touch', [sid, session, cb]);
      return cb?.(null);
    });
  }
}

export function createSessionStore() {
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'dogma:session:',
  });
  const memoryStore = new session.MemoryStore();
  return new ResilientStore(redisStore, memoryStore);
}
