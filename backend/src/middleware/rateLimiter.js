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

// Опрос статуса QR идёт каждые ~1.5 c и с одного IP (сайт + приложение за
// одним NAT), поэтому общий лимит его быстрее исчерпывал бы, чем пользователь
// успеет подтвердить вход. Такие запросы считает отдельный qrStatusLimiter.
const isQrPolling = (req) => {
  const path = req.path || '';
  return path === '/auth/app/qr/status' || /^\/auth\/qr\/[^/]+$/.test(path);
};

// Статика (HTML, JS, CSS, шрифты, скачивание APK) не должна расходовать
// лимит API: иначе обычная загрузка страницы и опрос админки съедают его.
const isStaticRequest = (req) => {
  const path = req.path || '';
  return !(path.startsWith('/api/') || path.startsWith('/auth/') || path === '/health');
};

// General per-IP limit for the rest of the API.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInTest() || isQrPolling(req) || isStaticRequest(req),
});

// QR-коды одноразовые и короткоживущие, но всё равно ограничиваем перебор
// кодов с одного IP (сканирование и получение токена приложением).
export const qrLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'RATE_LIMITED' },
});

// Опрос статуса: сайт и приложение вместе делают до ~80 запросов в минуту,
// поэтому лимит заметно выше, но всё ещё защищает от массового перебора.
export const qrStatusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'RATE_LIMITED' },
});
