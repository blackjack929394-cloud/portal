import crypto from 'node:crypto';
import config from '../config/index.js';

function safeEqual(a, b) {
  const ab = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function requireAdmin(req, res, next) {
  if (!config.admin.token) return res.status(503).json({ error: 'ADMIN_API_DISABLED' });
  if (!safeEqual(req.get('x-admin-token'), config.admin.token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  return next();
}
