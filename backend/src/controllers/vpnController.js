import config from '../config/index.js';
import * as vpnService from '../services/vpnService.js';
import { audit } from '../services/auditService.js';
import { deployNodeAsync, deployNode } from '../services/nodeDeploymentService.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { chatStore } from '../models/ChatMessage.js';
import {
  listUsers,
  listEmployees,
  deleteUser,
  setUserBlocked,
  deleteEmployee,
  setEmployeeBlocked,
} from '../store/userDirectory.js';
import { PRESETS, getProfile, saveProfile } from '../services/routingService.js';

// Публичный базовый URL: из конфига (PUBLIC_BASE_URL), иначе из запроса.
function baseUrlFor(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
}

// Прямая share-ссылка (hysteria2://…) для первого активного узла подписки.
// Её клиенты (Hiddify) принимают из буфера обмена напрямую.
async function configLinkFor(token) {
  const res = await vpnService.buildSubscriptionUris(token);
  return res.uris && res.uris.length ? res.uris[0] : null;
}

// ── User-facing endpoints ────────────────────────────────────────────────────

export async function getMySubscription(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const sub = await vpnService.getUserSubscription(user.sub);
  if (!sub) {
    // Заявка ждёт одобрения администратора?
    if (await vpnService.getUserPendingSubscription(user.sub)) {
      return res.json({ status: 'pending' });
    }
    // Последнюю заявку отклонил админ?
    const latest = await vpnService.getUserLatestSubscription(user.sub);
    if (latest && latest.status === 'revoked' && latest.revokedReason === 'denied') {
      return res.json({ status: 'denied' });
    }
    return res.status(404).json({ error: 'NO_SUBSCRIPTION' });
  }
  return res.json({
    id: sub.id,
    status: sub.status,
    expiresAt: sub.expiresAt,
    trafficLimitGb: sub.trafficLimitGb,
    trafficUsedGb: sub.trafficUsedGb,
    token: sub.token,
    activeNodeCount: (await vpnService.listActiveNodes()).length,
    subscriptionUrl: `${baseUrlFor(req)}/api/v1/sub/${sub.token}`,
    // «Умная подписка»: sing-box конфиг с маршрутизацией и DNS через туннель.
    smartSubscriptionUrl: `${baseUrlFor(req)}/api/v1/sub/${sub.token}?format=singbox`,
    // Зашифрованная подписка (для приложения Dogma), если секрет настроен.
    secureSubscriptionUrl: config.vpn.subscriptionEncSecret
      ? `${baseUrlFor(req)}/api/v1/sub/${sub.token}?format=enc` : null,
    configLink: await configLinkFor(sub.token),
  });
}

// ── Маршрутизация (split tunneling) ──────────────────────────────────────────

export async function getMyRouting(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { userSub, ...profile } = await getProfile(user.sub);
  return res.json({ profile, presets: PRESETS.map(({ id, label }) => ({ id, label })) });
}

export async function updateMyRouting(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const result = await saveProfile(user.sub, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error, details: result.details });
  audit('vpn.routing_updated', { userSub: user.sub, mode: result.profile.mode });
  const { userSub, ...profile } = result.profile;
  return res.json({ profile });
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function createSubscription(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { ttlDays, trafficLimitGb } = req.body || {};

  const effectiveTtl = parsePositiveInt(ttlDays, config.vpn.defaultTtlDays);
  if (effectiveTtl === null) {
    return res.status(400).json({ error: 'INVALID_TTL_DAYS', details: 'ttlDays must be a positive integer' });
  }

  const effectiveTraffic = trafficLimitGb !== undefined && trafficLimitGb !== null && trafficLimitGb !== ''
    ? parsePositiveInt(trafficLimitGb, null)
    : config.vpn.defaultTrafficLimitGb;
  if (trafficLimitGb !== undefined && trafficLimitGb !== null && trafficLimitGb !== '' && effectiveTraffic === null) {
    return res.status(400).json({ error: 'INVALID_TRAFFIC_LIMIT', details: 'trafficLimitGb must be a positive integer' });
  }

  const sub = await vpnService.issueSubscription({
    userSub: user.sub,
    userName: user.name,
    userEmail: user.email,
    ttlDays: effectiveTtl,
    trafficLimitGb: effectiveTraffic,
  });
  // Заявка отправлена на одобрение админу — ссылку пока не выдаём.
  if (sub.status === 'pending') {
    return res.status(202).json({ status: 'pending', pending: true });
  }
  return res.status(201).json({
    id: sub.id,
    token: sub.token,
    subscriptionUrl: `${baseUrlFor(req)}/api/v1/sub/${sub.token}`,
    smartSubscriptionUrl: `${baseUrlFor(req)}/api/v1/sub/${sub.token}?format=singbox`,
    secureSubscriptionUrl: config.vpn.subscriptionEncSecret
      ? `${baseUrlFor(req)}/api/v1/sub/${sub.token}?format=enc` : null,
    configLink: await configLinkFor(sub.token),
    expiresAt: sub.expiresAt,
    trafficLimitGb: sub.trafficLimitGb,
  });
}

export async function revokeMySubscription(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const sub = await vpnService.getUserSubscription(user.sub);
  if (!sub) return res.status(404).json({ error: 'NO_SUBSCRIPTION' });
  await vpnService.revokeSubscription(sub.id, 'user_requested');
  return res.json({ ok: true });
}

// ── Чат поддержки (пользователь ↔ администратор) ─────────────────────────────

// Пользователь: своя переписка. Открытие помечает ответы админа прочитанными.
export async function getMyChat(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  await chatStore.markReadByUser(user.sub);
  return res.json({ messages: await chatStore.listByUser(user.sub) });
}

export async function getMyChatUnread(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  return res.json({ unread: await chatStore.unreadForUser(user.sub) });
}

export async function sendMyChatMessage(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const text = (req.body?.text || '').toString().trim();
  if (text.length < 1) return res.status(400).json({ error: 'MESSAGE_EMPTY' });
  if (text.length > 2000) return res.status(400).json({ error: 'MESSAGE_TOO_LONG' });
  const msg = await chatStore.add({ userSub: user.sub, userName: user.name, userEmail: user.email, sender: 'user', text });
  audit('chat.user_message', { userSub: user.sub });
  return res.status(201).json(msg);
}

// Админ: список бесед и переписка с конкретным пользователем.
export async function listChats(req, res) {
  return res.json({ chats: await chatStore.listConversations() });
}

export async function getChatMessages(req, res) {
  const userSub = (req.query.user || '').toString();
  if (!userSub) return res.status(400).json({ error: 'USER_REQUIRED' });
  await chatStore.markReadByAdmin(userSub);
  return res.json({ messages: await chatStore.listByUser(userSub) });
}

export async function sendAdminChatMessage(req, res) {
  const userSub = (req.body?.userSub || '').toString();
  const text = (req.body?.text || '').toString().trim();
  if (!userSub) return res.status(400).json({ error: 'USER_REQUIRED' });
  if (text.length < 1) return res.status(400).json({ error: 'MESSAGE_EMPTY' });
  if (text.length > 2000) return res.status(400).json({ error: 'MESSAGE_TOO_LONG' });
  // Берём имя/почту из последней реплики пользователя, если есть.
  const history = await chatStore.listByUser(userSub);
  const info = history.find((m) => m.userName || m.userEmail) || {};
  const msg = await chatStore.add({ userSub, userName: info.userName, userEmail: info.userEmail, sender: 'admin', text });
  audit('chat.admin_message', { userSub });
  return res.status(201).json(msg);
}

// ── Public client endpoint: subscription config (no auth, token-based) ───────

// Заголовки метаданных подписки — Hiddify показывает имя профиля,
// остаток трафика и срок действия.
const PROFILE_TITLE = 'Dogma-web';

function setSubscriptionHeaders(res, sub) {
  res.setHeader('profile-title', PROFILE_TITLE);
  res.setHeader('profile-update-interval', '1');
  const parts = [
    'upload=0',
    `download=${Math.round((sub.trafficUsedGb || 0) * 1024 ** 3)}`,
  ];
  if (sub.trafficLimitGb) parts.push(`total=${sub.trafficLimitGb * 1024 ** 3}`);
  if (sub.expiresAt) parts.push(`expire=${Math.floor(new Date(sub.expiresAt).getTime() / 1000)}`);
  res.setHeader('subscription-userinfo', parts.join('; '));
}

// Happ: клиент читает заголовок `custom-tunnel-config` и запускает переданный
// sing-box конфиг целиком — вместе с НАШИМИ правилами маршрутизации (RU-direct)
// и DNS. Так подписка в Happ реально применяет split-tunneling, а не только
// список серверов. Прочие клиенты (Hiddify и т.п.) заголовок игнорируют.
async function setHappTunnelHeader(res, token) {
  try {
    const sb = await vpnService.buildSubscriptionHapp(token);
    if (sb && sb.config) {
      res.setHeader('profile-title', PROFILE_TITLE); // имя подписки в Happ
      res.setHeader('custom-tunnel-config', JSON.stringify(sb.config)); // минифицированный JSON, одна строка
      res.setHeader('routing-enable', '1');
      res.setHeader('dns-from-json-enable', '1');
    }
  } catch { /* необязательный заголовок — молча пропускаем */ }
}

export async function getSubscriptionConfig(req, res) {
  const baseUrl = baseUrlFor(req);

  const format = (req.query.format || '').toString().toLowerCase();

  // Полный sing-box конфиг с маршрутизацией пользователя («умная подписка»).
  if (format === 'singbox' || format === 'sing-box') {
    const result = await vpnService.buildSubscriptionSingbox(req.params.token);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404 : 410;
      return res.status(code).json({ error: result.error });
    }
    setSubscriptionHeaders(res, result.sub);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(result.config, null, 2));
  }

  // Зашифрованная подписка (только клиент Dogma с общим секретом расшифрует).
  if (format === 'enc' || format === 'encrypted' || format === 'dogma') {
    const result = await vpnService.buildSubscriptionEncrypted(req.params.token);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404
        : result.error === 'ENC_NOT_CONFIGURED' ? 501 : 410;
      return res.status(code).json({ error: result.error });
    }
    setSubscriptionHeaders(res, result.sub);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(result.blob);
  }

  // PAC-файл (системный прокси): те же правила маршрутизации.
  if (format === 'pac') {
    const proxyAddr = /^[\w.-]+:\d+$/.test(String(req.query.proxy || ''))
      ? String(req.query.proxy)
      : undefined;
    const result = await vpnService.buildSubscriptionPac(req.params.token, proxyAddr);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404 : 410;
      return res.status(code).json({ error: result.error });
    }
    res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig; charset=utf-8');
    return res.send(result.pac);
  }

  // Формат для импорта в Hiddify / приложение WireGuard: готовый .conf.
  if (format === 'wireguard' || format === 'wg' || format === 'conf') {
    const result = await vpnService.buildSubscriptionWireguardConf(req.params.token);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404 : 410;
      return res.status(code).json({ error: result.error });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dogma-vpn.conf"');
    return res.send(result.conf);
  }

  // Base64-подписка для Hiddify/Happ/v2ray (hysteria2://, …).
  // Для Happ дополнительно кладём полный конфиг с RU-direct в заголовок.
  if (format === 'sub' || format === 'base64' || format === 'hiddify' || format === 'happ') {
    const result = await vpnService.buildSubscriptionBase64(req.params.token);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404 : 410;
      return res.status(code).json({ error: result.error });
    }
    await setHappTunnelHeader(res, req.params.token);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(result.base64);
  }

  // Сырые share-ссылки (по одной на строку).
  if (format === 'links' || format === 'hysteria2' || format === 'uri') {
    const result = await vpnService.buildSubscriptionUris(req.params.token);
    if (result.error) {
      const code = result.error === 'NOT_FOUND' ? 404 : 410;
      return res.status(code).json({ error: result.error });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(result.uris.join('\n'));
  }

  const payload = await vpnService.buildSubscriptionPayload(req.params.token, baseUrl);
  if (payload.error) {
    const code = payload.error === 'NOT_FOUND' ? 404 : 410;
    return res.status(code).json({ error: payload.error });
  }
  return res.json(payload);
}

// ── Hysteria2 external HTTP auth ─────────────────────────────────────────────
// Hysteria2-сервер на ноде вызывает этот эндпоинт при каждом подключении:
// POST { addr, auth, tx }. Пароль клиента (auth) = токен подписки.
// Отвечаем { ok, id }. Отозванная/просроченная подписка → ok:false.
export async function hysteriaAuth(req, res) {
  const token = req.body?.auth;
  if (!token) return res.json({ ok: false });
  const sub = await vpnService.getSubscriptionByToken(token);
  if (!sub || sub.error) {
    audit('vpn.hysteria_auth_denied', { tokenPrefix: String(token).slice(0, 8), reason: sub?.error || 'not_found' });
    return res.json({ ok: false });
  }
  // id = полный токен, чтобы Hysteria2 Traffic Stats API коррелировал
  // статистику с подпиской без дополнительных преобразований.
  return res.json({ ok: true, id: sub.token });
}

// ── Xray user sync (нода тянет список активных UUID) ─────────────────────────
// Нода Xray периодически забирает актуальный список клиентов и релоадит конфиг,
// поэтому отзыв/просрочка подписки убирает доступ и по VLESS. Защита — общий
// секрет (?secret= или заголовок X-Sync-Secret).
export async function xrayUsers(req, res) {
  const secret = config.vless.syncSecret;
  if (!secret) return res.status(501).json({ error: 'XRAY_SYNC_NOT_CONFIGURED' });
  const provided = req.get('x-sync-secret') || req.query.secret || '';
  if (provided !== secret) return res.status(403).json({ error: 'FORBIDDEN' });
  return res.json({ uuids: await vpnService.listActiveXrayUuids(), flow: config.vless.flow });
}

// ── Admin endpoints ────────────────────────────────────────────────────────────

export async function listNodes(req, res) {
  return res.json({ nodes: await vpnService.listNodes() });
}

export async function createNode(req, res) {
  const {
    name, host, port, protocol, kind, region, provider, publicKey, extra,
    sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64,
  } = req.body || {};
  if (!name || !host) {
    return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', details: ['name', 'host'] });
  }
  const node = await vpnService.createNode({
    name, host, port, protocol, kind, region, provider, publicKey, extra,
    sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64,
  });
  return res.status(201).json(node);
}

export async function updateNode(req, res) {
  const node = await vpnService.updateNode(req.params.id, req.body || {});
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(node);
}

export async function deleteNode(req, res) {
  await vpnService.deleteNode(req.params.id);
  return res.json({ ok: true });
}

export async function toggleNode(req, res) {
  const node = await vpnService.toggleNodeStatus(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(node);
}

export async function listSubscriptions(req, res) {
  return res.json({ subscriptions: await vpnService.listSubscriptions() });
}

export async function revokeSubscription(req, res) {
  const { reason } = req.body || {};
  const sub = await vpnService.revokeSubscription(req.params.id, reason || 'admin_revoked');
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(sub);
}

export async function deleteSubscription(req, res) {
  const sub = await vpnService.getSubscriptionById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND' });
  const now = new Date();
  const isExpired = sub.expiresAt && new Date(sub.expiresAt) < now;
  const isTrafficExceeded = sub.trafficLimitGb != null && sub.trafficUsedGb >= sub.trafficLimitGb;
  const isDeletable = sub.status === 'revoked' || isExpired || isTrafficExceeded;
  if (!isDeletable) {
    return res.status(400).json({ error: 'SUBSCRIPTION_ACTIVE', details: 'Only revoked, expired or traffic-exceeded subscriptions can be deleted' });
  }
  await vpnService.deleteSubscription(req.params.id);
  return res.json({ ok: true });
}

// Правка подписки: продление срока (extendDays) или явные expiresAt/trafficLimitGb.
export async function updateSubscriptionController(req, res) {
  const { extendDays, expiresAt, trafficLimitGb } = req.body || {};
  const patch = {};

  if (extendDays !== undefined) {
    const days = parsePositiveInt(extendDays, null);
    if (days === null) return res.status(400).json({ error: 'INVALID_EXTEND_DAYS' });
    const current = await vpnService.getSubscriptionById(req.params.id);
    if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
    const from = current.expiresAt && new Date(current.expiresAt) > new Date()
      ? new Date(current.expiresAt) : new Date();
    patch.expiresAt = new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (expiresAt !== undefined) {
    if (expiresAt === null || expiresAt === '') patch.expiresAt = null;
    else if (Number.isNaN(Date.parse(expiresAt))) return res.status(400).json({ error: 'INVALID_EXPIRES_AT' });
    else patch.expiresAt = new Date(expiresAt).toISOString();
  }

  if (trafficLimitGb !== undefined) {
    if (trafficLimitGb === null || trafficLimitGb === '') patch.trafficLimitGb = null;
    else {
      const gb = parsePositiveInt(trafficLimitGb, null);
      if (gb === null) return res.status(400).json({ error: 'INVALID_TRAFFIC_LIMIT' });
      patch.trafficLimitGb = gb;
    }
  }

  const updated = await vpnService.updateSubscription(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
  audit('vpn.subscription_updated', { subscriptionId: req.params.id, patch: Object.keys(patch) });
  return res.json(updated);
}

// Профиль маршрутизации пользователя — для поддержки (только чтение).
export async function getUserRoutingController(req, res) {
  const username = req.params.username;
  const userSub = username.startsWith('sso:') ? username.slice(4) : `local:${username}`;
  const { userSub: _, ...profile } = await getProfile(userSub);
  return res.json({ profile });
}

export async function getStats(req, res) {
  return res.json(await vpnService.getSubscriptionStats());
}

// Список зарегистрированных пользователей (локальные + SSO/employee).
export async function listUsersController(req, res) {
  const localUsers = (await listUsers()).map((u) => ({ ...u, kind: 'user' }));
  const employees = (await listEmployees()).map((e) => ({
    username: `sso:${e.sub}`,
    fullName: e.fullName,
    email: e.email,
    createdAt: e.createdAt,
    lastLogin: e.lastLogin,
    blocked: e.blocked,
    kind: 'employee',
  }));
  return res.json({ users: [...localUsers, ...employees] });
}

// Блокировка / разблокировка пользователя. При блокировке отзываем его доступ.
export async function setUserBlockedController(req, res) {
  const username = req.params.username;
  const blocked = !!req.body?.blocked;
  let ok;
  let userSub;
  if (username.startsWith('sso:')) {
    const sub = username.slice(4);
    ok = await setEmployeeBlocked(sub, blocked);
    userSub = sub;
  } else {
    ok = await setUserBlocked(username, blocked);
    userSub = `local:${username}`;
  }
  if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
  if (blocked) {
    await vpnService.revokeUserActiveSubscriptions(userSub, 'blocked');
  }
  audit('admin.user_blocked', { username, blocked });
  return res.json({ ok: true, blocked });
}

// Удаление пользователя вместе с его подписками и перепиской.
export async function deleteUserController(req, res) {
  const username = req.params.username;
  let userSub;
  let existed;
  if (username.startsWith('sso:')) {
    const sub = username.slice(4);
    userSub = sub;
    await vpnService.deleteUserSubscriptions(userSub);
    await chatStore.deleteByUser(userSub);
    existed = await deleteEmployee(sub);
  } else {
    userSub = `local:${username}`;
    await vpnService.deleteUserSubscriptions(userSub);
    await chatStore.deleteByUser(userSub);
    existed = await deleteUser(username);
  }
  if (!existed) return res.status(404).json({ error: 'NOT_FOUND' });
  audit('admin.user_deleted', { username });
  return res.json({ ok: true });
}

// ── Одобрение заявок (после отзыва админом) ──────────────────────────────────
export async function listPendingSubscriptions(req, res) {
  return res.json({ pending: await vpnService.listPendingSubscriptions() });
}

export async function approveSubscriptionController(req, res) {
  const sub = await vpnService.approveSubscription(req.params.id);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND_OR_NOT_PENDING' });
  return res.json(sub);
}

export async function denySubscriptionController(req, res) {
  const { reason } = req.body || {};
  const sub = await vpnService.denySubscription(req.params.id, reason);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND_OR_NOT_PENDING' });
  return res.json(sub);
}

export async function deployNodeController(req, res) {
  const node = await vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}

export async function getDeployStatus(req, res) {
  const node = await vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json({
    nodeId: node.id,
    deploymentStatus: node.deploymentStatus,
    deploymentError: node.deploymentError,
    wgTunnelIp: node.wgTunnelIp,
    intermediateHost: node.intermediateHost,
    intermediatePublicPort: node.intermediatePublicPort,
  });
}

export async function redeployNodeController(req, res) {
  const node = await vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}

export async function rotateWgKeysController(req, res) {
  const node = await vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}
