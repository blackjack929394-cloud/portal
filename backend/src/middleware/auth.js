import { isBlocked } from '../store/userDirectory.js';
import { verifyAppToken, revokeAppTokenById } from '../services/appAuthService.js';

// Единая точка получения пользователя запроса.
// Веб — cookie-сессия, приложение — Authorization: Bearer <token>.
export function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

export async function attachUser(req, res, next) {
  try {
    if (req.session?.user) {
      req.user = req.session.user;
      return next();
    }
    const token = getBearerToken(req);
    if (!token) return next();
    const user = await verifyAppToken(token);
    if (user) req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function requireAuth(req, res, next) {
  const user = req.user || req.session?.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  req.user = user;

  try {
    const blocked = await isBlocked(user.sub, user.kind);
    if (blocked) {
      if (user.appTokenId) {
        await revokeAppTokenById(user.appTokenId, user.sub).catch(() => {});
      }
      if (req.session?.user) req.session.destroy(() => {});
      return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

// Для действий, которые может инициировать только веб-сессия
// (например, показ/подтверждение QR-кода на сайте).
export function requireSessionAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  req.user = req.session.user;
  return requireAuth(req, res, next);
}
