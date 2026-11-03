import rateLimit from 'express-rate-limit';

// В тестах лимитер выключен: серверы поднимаются в одном процессе с одного IP
// и делят общий счётчик, что даёт ложные 429.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Tight limit on creating issuance requests (anti-abuse / anti-mass-issuance).
export const createRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'RATE_LIMITED', message: 'Слишком много заявок. Попробуйте позже.' },
});

// General per-IP limit for the rest of the API.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});
