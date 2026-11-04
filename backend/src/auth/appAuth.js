import { requireAuth, requireSessionAuth } from '../middleware/auth.js';
import { qrLimiter, qrStatusLimiter } from '../middleware/rateLimiter.js';
import {
  startQrLogin,
  getQrLogin,
  confirmQrLogin,
  cancelQrLogin,
  scanQrLogin,
  getQrStatusByCode,
  claimQrLogin,
  listAppDevices,
  revokeAppDevice,
  revokeAppTokenById,
} from '../services/appAuthService.js';
import { scanSchema, codeSchema, statusQuerySchema } from '../validators/appAuthValidators.js';

// Коды ошибок → HTTP-статусы. Держим в одном месте, чтобы сайт и приложение
// получали предсказуемые ответы.
const STATUS_BY_ERROR = {
  NOT_FOUND: 404,
  INVALID_CODE: 404,
  EXPIRED: 410,
  CANCELLED: 410,
  ALREADY_USED: 409,
  ALREADY_SCANNED: 409,
  ALREADY_CONFIRMED: 409,
  NOT_SCANNED: 409,
  NOT_CONFIRMED: 409,
  CONFLICT: 409,
  DEVICE_LIMIT_REACHED: 409,
};

function fail(res, error, extra = {}) {
  return res.status(STATUS_BY_ERROR[error] || 400).json({ error, ...extra });
}

export function mountAppAuth(app) {
  // ── Веб-портал: показать QR и подтвердить устройство ────────────────────

  app.post('/auth/qr/start', qrLimiter, requireSessionAuth, async (req, res, next) => {
    try {
      return res.json(await startQrLogin(req.user));
    } catch (err) {
      return next(err);
    }
  });

  app.get('/auth/qr/:id', qrStatusLimiter, requireSessionAuth, async (req, res, next) => {
    try {
      const result = await getQrLogin(req.params.id, req.user.sub);
      if (result.error) return fail(res, result.error);
      return res.json(result.session);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/auth/qr/:id/confirm', qrLimiter, requireSessionAuth, async (req, res, next) => {
    try {
      const result = await confirmQrLogin(req.params.id, req.user.sub);
      if (result.error) return fail(res, result.error);
      return res.json(result.session);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/auth/qr/:id/cancel', qrLimiter, requireSessionAuth, async (req, res, next) => {
    try {
      const result = await cancelQrLogin(req.params.id, req.user.sub);
      if (result.error) return fail(res, result.error);
      return res.json(result.session);
    } catch (err) {
      return next(err);
    }
  });

  // ── Приложение: сканирование, ожидание подтверждения, получение токена ──

  app.post('/auth/app/qr/scan', qrLimiter, async (req, res, next) => {
    try {
      const parsed = scanSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
      const result = await scanQrLogin(parsed.data);
      if (result.error) return fail(res, result.error);
      return res.json(result.session);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/auth/app/qr/status', qrStatusLimiter, async (req, res, next) => {
    try {
      const parsed = statusQuerySchema.safeParse(req.query || {});
      if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
      const result = await getQrStatusByCode(parsed.data.code);
      if (result.error) return fail(res, result.error);
      return res.json(result.session);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/auth/app/qr/claim', qrLimiter, async (req, res, next) => {
    try {
      const parsed = codeSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
      const result = await claimQrLogin(parsed.data.code);
      if (result.error) {
        return fail(res, result.error, result.limit ? { limit: result.limit } : {});
      }
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  // ── Управление устройствами (веб-портал) ────────────────────────────────

  app.get('/auth/app/devices', requireSessionAuth, async (req, res, next) => {
    try {
      return res.json({ devices: await listAppDevices(req.user.sub) });
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/auth/app/devices/:id', requireSessionAuth, async (req, res, next) => {
    try {
      const revoked = await revokeAppDevice(req.params.id, req.user.sub);
      if (!revoked) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Приложение может выйти этим эндпоинтом (Bearer).
  app.post('/auth/app/logout', requireAuth, async (req, res, next) => {
    try {
      if (req.user?.appTokenId) {
        await revokeAppTokenById(req.user.appTokenId, req.user.sub);
      }
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });
}
