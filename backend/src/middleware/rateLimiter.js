import rateLimit from 'express-rate-limit';

// Tight limit on creating issuance requests (anti-abuse / anti-mass-issuance).
export const createRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Слишком много заявок. Попробуйте позже.' },
});

// General per-IP limit for the rest of the API.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
