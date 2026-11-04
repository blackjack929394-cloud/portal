import config from '../config/index.js';
import { appAuthStore, hashSecret } from '../models/AppAuth.js';
import { generateToken } from '../utils/secureToken.js';
import { audit } from './auditService.js';

// Логика QR-входа:
//   сайт (уже авторизован)  → pending
//   приложение сканирует QR → scanned
//   пользователь на сайте подтверждает устройство → confirmed
//   приложение забирает Bearer-токен → approved
// После approved QR-сессия больше не используется.

const ACTIVE_STATUSES = new Set(['pending', 'scanned', 'confirmed']);

function isExpired(session) {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

function userPreview(session) {
  return {
    name: session.userName || null,
    email: session.userEmail || null,
  };
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    user: userPreview(session),
    deviceName: session.deviceName || null,
    platform: session.platform || null,
    appVersion: session.appVersion || null,
    expiresAt: session.expiresAt,
    scannedAt: session.scannedAt,
    confirmedAt: session.confirmedAt,
    approvedAt: session.approvedAt,
  };
}

function cleanDevice({ deviceName, platform, appVersion }) {
  return {
    deviceName: String(deviceName || '').trim().slice(0, 80) || null,
    platform: String(platform || '').trim().slice(0, 32) || null,
    appVersion: String(appVersion || '').trim().slice(0, 40) || null,
  };
}

// Помечает просроченную сессию expired, чтобы сайт/приложение увидели
// понятный статус, а не «вечный pending».
async function ensureFresh(session) {
  if (!session) return session;
  if (ACTIVE_STATUSES.has(session.status) && isExpired(session)) {
    return (await appAuthStore.expire(session.id)) || { ...session, status: 'expired' };
  }
  return session;
}

export async function startQrLogin(user) {
  const code = generateToken(32);
  const expiresAt = new Date(Date.now() + config.appAuth.qrTtlSeconds * 1000).toISOString();
  const session = await appAuthStore.createLoginSession({ user, code, expiresAt });
  const qrPayload = config.appAuth.deepLinkTemplate.replaceAll('{code}', encodeURIComponent(code));

  audit('auth.app_qr_started', { sessionId: session.id, userSub: user.sub });
  return {
    id: session.id,
    code,
    qrPayload,
    expiresAt,
    ttlSeconds: config.appAuth.qrTtlSeconds,
  };
}

// Сайт опрашивает статус. Чужую сессию не отдаём (404, чтобы не палить id).
export async function getQrLogin(id, userSub) {
  let session = await appAuthStore.getLoginSession(id);
  if (!session || session.userSub !== userSub) return { error: 'NOT_FOUND' };
  session = await ensureFresh(session);
  return { session: publicSession(session) };
}

export async function confirmQrLogin(id, userSub) {
  let session = await appAuthStore.getLoginSession(id);
  if (!session || session.userSub !== userSub) return { error: 'NOT_FOUND' };
  session = await ensureFresh(session);

  if (session.status === 'expired') return { error: 'EXPIRED' };
  if (session.status === 'approved') return { session: publicSession(session) };
  if (session.status === 'cancelled') return { error: 'CANCELLED' };
  if (session.status !== 'scanned') return { error: 'NOT_SCANNED' };

  const confirmed = await appAuthStore.markConfirmed(id);
  if (!confirmed) return { error: 'CONFLICT' };
  audit('auth.app_qr_confirmed', {
    sessionId: id,
    userSub,
    platform: confirmed.platform,
    deviceName: confirmed.deviceName,
  });
  return { session: publicSession(confirmed) };
}

export async function cancelQrLogin(id, userSub) {
  let session = await appAuthStore.getLoginSession(id);
  if (!session || session.userSub !== userSub) return { error: 'NOT_FOUND' };
  session = await ensureFresh(session);
  if (ACTIVE_STATUSES.has(session.status)) {
    session = (await appAuthStore.cancel(id)) || session;
    audit('auth.app_qr_cancelled', { sessionId: id, userSub });
  }
  return { session: publicSession(session) };
}

// Приложение сканирует QR. Первый сканер фиксируется; повторный получает
// ALREADY_SCANNED, чтобы QR нельзя было перехватить вторым устройством.
export async function scanQrLogin({ code, deviceName, platform, appVersion }) {
  let session = await appAuthStore.findLoginSessionByCode(code);
  if (!session) return { error: 'INVALID_CODE' };
  session = await ensureFresh(session);

  if (session.status === 'expired') return { error: 'EXPIRED' };
  if (session.status === 'cancelled') return { error: 'CANCELLED' };
  if (session.status === 'approved') return { error: 'ALREADY_USED' };
  if (session.status === 'confirmed') return { error: 'ALREADY_CONFIRMED' };
  if (session.status === 'scanned') return { error: 'ALREADY_SCANNED' };

  const device = cleanDevice({ deviceName, platform, appVersion });
  const scanned = await appAuthStore.markScanned(session.id, device);
  if (!scanned) return { error: 'CONFLICT' };

  audit('auth.app_qr_scanned', {
    sessionId: scanned.id,
    userSub: scanned.userSub,
    platform: device.platform,
    deviceName: device.deviceName,
  });
  return { session: publicSession(scanned) };
}

// Приложение опрашивает статус по коду (до получения токена).
export async function getQrStatusByCode(code) {
  let session = await appAuthStore.findLoginSessionByCode(code);
  if (!session) return { error: 'INVALID_CODE' };
  session = await ensureFresh(session);
  return { session: publicSession(session) };
}

// Приложение забирает токен после подтверждения на сайте.
export async function claimQrLogin(code) {
  let session = await appAuthStore.findLoginSessionByCode(code);
  if (!session) return { error: 'INVALID_CODE' };
  session = await ensureFresh(session);

  if (session.status === 'expired') return { error: 'EXPIRED' };
  if (session.status === 'cancelled') return { error: 'CANCELLED' };
  if (session.status === 'approved') return { error: 'ALREADY_USED' };
  if (session.status !== 'confirmed') return { error: 'NOT_CONFIRMED' };

  const token = generateToken(32);
  const expiresAt = new Date(
    Date.now() + config.appAuth.tokenTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await appAuthStore.claimLoginSession({ id: session.id, token, expiresAt });
  if (result.error) return result;

  audit('auth.app_login', {
    sessionId: session.id,
    userSub: session.userSub,
    platform: session.platform,
    deviceName: session.deviceName,
    tokenId: result.token.id,
  });

  return {
    token,
    tokenType: 'Bearer',
    expiresAt,
    user: {
      name: session.userName || null,
      email: session.userEmail || null,
      kind: session.userKind,
    },
  };
}

// Проверка Bearer-токена для API. Возвращает пользователя в том же формате,
// что и сессия, плюс appTokenId (чтобы можно было отозвать токен).
export async function verifyAppToken(rawToken) {
  if (!rawToken) return null;
  const row = await appAuthStore.findLiveTokenByHash(hashSecret(rawToken));
  if (!row) return null;
  // Обновление last_used_at не критично для ответа — не ждём его.
  appAuthStore.touchToken(row.id).catch(() => {});
  return {
    sub: row.userSub,
    name: row.userName,
    email: row.userEmail,
    kind: row.userKind,
    via: 'app',
    appTokenId: row.id,
  };
}

export async function revokeAppToken(rawToken) {
  if (!rawToken) return null;
  const revoked = await appAuthStore.revokeTokenByRaw(rawToken);
  if (revoked) audit('auth.app_logout', { userSub: revoked.userSub, tokenId: revoked.id });
  return revoked;
}

export async function revokeAppTokenById(id, userSub) {
  const revoked = await appAuthStore.revokeToken(id);
  if (revoked) {
    audit('auth.app_token_revoked', { userSub: userSub || revoked.userSub, tokenId: revoked.id });
  }
  return revoked;
}

export async function listAppDevices(userSub) {
  const tokens = await appAuthStore.listTokens(userSub);
  return tokens
    .filter((t) => !t.revokedAt && new Date(t.expiresAt).getTime() > Date.now())
    .map((t) => ({
      id: t.id,
      deviceName: t.deviceName,
      platform: t.platform,
      appVersion: t.appVersion,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
    }));
}

export async function revokeAppDevice(id, userSub) {
  const revoked = await appAuthStore.revokeTokenForUser(id, userSub);
  if (revoked) audit('auth.app_device_revoked', { userSub, tokenId: revoked.id });
  return revoked;
}
