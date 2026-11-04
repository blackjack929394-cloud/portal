import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from './auditService.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { vpnSubscriptionStore } from '../models/VpnSubscription.js';
import { generateToken } from '../utils/secureToken.js';
import { generateClientOutbound, generateHysteria2Uri } from './hysteriaConfig.js';
import { generateAmneziaWGClientOutbound, generateAmneziaWGDefaults } from './amneziaConfig.js';
import { generateVlessClientOutbound, generateVlessRealityUri, tokenToUuid } from './vlessConfig.js';
import { generateWireguardClientOutbound, buildWireguardConf } from './wireguardConfig.js';
import { getProfile, buildSingboxConfig, buildHappConfig, buildPac } from './routingService.js';
import { encryptSubscription } from './subscriptionCrypto.js';

// ── Public API: ноды ─────────────────────────────────────────────────────────

export async function listNodes() {
  return vpnNodeStore.listAll();
}

export async function listActiveNodes() {
  const nodes = await vpnNodeStore.listActive();
  return nodes.filter((node) => {
    // Нода, которую health-check признал упавшей (N провалов подряд),
    // автоматически выпадает из выдачи подписки. После успешной пробы
    // health-check вернёт её обратно.
    if (node.healthStatus === 'down') return false;
    if (node.kind === 'hysteria2') {
      return node.status === 'active' && node.deploymentStatus === 'active';
    }
    return node.status === 'active';
  });
}

export async function createNode({ name, host, port, protocol, kind, region, provider, publicKey, extra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64 }) {
  let nodeExtra = extra || {};
  // Для AmneziaWG сразу генерируем параметры обфускации, если их не передали явно.
  if (kind === 'amneziawg') {
    const defaults = generateAmneziaWGDefaults();
    nodeExtra = { ...defaults, ...nodeExtra };
  }
  const node = await vpnNodeStore.create({
    name, host, port, protocol, kind, region, provider, publicKey,
    extra: nodeExtra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64,
  });
  audit('vpn.node_created', { nodeId: node.id, name, host, kind: node.kind });
  return node;
}

export async function updateNode(id, patch) {
  const node = await vpnNodeStore.update(id, patch);
  if (!node) return null;
  audit('vpn.node_updated', { nodeId: id, patch: Object.keys(patch) });
  return node;
}

export async function deleteNode(id) {
  await vpnNodeStore.delete(id);
  audit('vpn.node_deleted', { nodeId: id });
}

export async function toggleNodeStatus(id) {
  const node = await vpnNodeStore.get(id);
  if (!node) return null;
  const next = node.status === 'active' ? 'blocked' : 'active';
  const updated = await vpnNodeStore.update(id, { status: next });
  audit('vpn.node_toggled', { nodeId: id, status: next });
  return updated;
}

// ── Public API: подписки ─────────────────────────────────────────────────────

export async function getSubscriptionByToken(token) {
  const sub = await vpnSubscriptionStore.findByToken(token);
  if (!sub) return null;
  // Проверка срока и статуса
  if (sub.status === 'pending') return { error: 'PENDING' };
  // Задача обслуживания могла уже перевести подписку в expired — отдаём тот же
  // код, что и при проверке срока ниже, чтобы клиенты не видели «REVOKED».
  if (sub.status === 'expired') return { error: 'EXPIRED' };
  if (sub.status !== 'active') return { error: 'REVOKED' };
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    return { error: 'EXPIRED' };
  }
  if (sub.trafficLimitGb && sub.trafficUsedGb >= sub.trafficLimitGb) {
    return { error: 'LIMIT_EXCEEDED' };
  }
  return sub;
}

// Effective status shown in admin UI: active / pending / revoked / expired / exhausted.
function effectiveStatusOf(sub) {
  if (sub.status !== 'active') return sub.status;
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return 'expired';
  if (sub.trafficLimitGb && sub.trafficUsedGb >= sub.trafficLimitGb) return 'exhausted';
  return 'active';
}

function isEffectiveActive(sub) {
  return effectiveStatusOf(sub) === 'active';
}

export async function getUserSubscription(userSub) {
  const subs = await vpnSubscriptionStore.findByUserSub(userSub);
  return subs.find((s) => isEffectiveActive(s)) || null;
}

// Отзыв админом (не self-revoke и не reissue) — признак, что новая заявка
// пользователя должна пройти одобрение.
function isAdminRevoke(reason) {
  return !!reason && reason !== 'user_requested' && reason !== 'reissued';
}

// Нужна ли новая заявка пользователя на одобрение: если его последняя подписка
// была отозвана админом (или отклонена).
export async function userNeedsApproval(userSub) {
  const latest = await vpnSubscriptionStore.latestByUserSub(userSub);
  return !!latest && latest.status === 'revoked' && isAdminRevoke(latest.revokedReason);
}

export async function getUserPendingSubscription(userSub) {
  const subs = await vpnSubscriptionStore.findByUserSub(userSub);
  return subs.find((s) => s.status === 'pending') || null;
}

export async function getUserLatestSubscription(userSub) {
  return vpnSubscriptionStore.latestByUserSub(userSub);
}

export async function issueSubscription({ userSub, userName, userEmail, ttlDays, trafficLimitGb }) {
  // Уже есть активная подписка — обычный перевыпуск, одобрение не требуется.
  const existing = await getUserSubscription(userSub);
  if (existing) {
    await vpnSubscriptionStore.revoke(existing.id, 'reissued');
    audit('vpn.subscription_revoked', { subscriptionId: existing.id, reason: 'reissued', userSub });
  } else {
    // Активной нет. Если уже есть заявка на одобрении — возвращаем её.
    const pending = await getUserPendingSubscription(userSub);
    if (pending) return pending;
    // Прошлую подписку отозвал/отклонил админ — новая заявка идёт на одобрение.
    if (await userNeedsApproval(userSub)) {
      const token = generateToken(32);
      const sub = await vpnSubscriptionStore.create({
        userSub,
        userName,
        userEmail,
        token,
        expiresAt: null, // срок стартует при одобрении
        trafficLimitGb: trafficLimitGb || null,
        status: 'pending',
      });
      audit('vpn.subscription_pending', { subscriptionId: sub.id, userSub, userEmail });
      return sub;
    }
  }

  const token = generateToken(32);
  const expiresAt = ttlDays
    ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const sub = await vpnSubscriptionStore.create({
    userSub,
    userName,
    userEmail,
    token,
    expiresAt,
    trafficLimitGb: trafficLimitGb || null,
  });

  audit('vpn.subscription_created', {
    subscriptionId: sub.id,
    userSub,
    tokenPrefix: token.slice(0, 8),
    expiresAt,
    trafficLimitGb,
  });

  return sub;
}

// ── Одобрение заявок (модерация после отзыва админом) ────────────────────────
export async function listPendingSubscriptions() {
  return vpnSubscriptionStore.listPending();
}

export async function approveSubscription(id) {
  const sub = await vpnSubscriptionStore.get(id);
  if (!sub || sub.status !== 'pending') return null;
  const ttl = config.vpn.defaultTtlDays;
  const expiresAt = ttl ? new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString() : null;
  const updated = await vpnSubscriptionStore.update(id, { status: 'active', expiresAt });
  audit('vpn.subscription_approved', { subscriptionId: id, userSub: sub.userSub });
  return updated;
}

export async function denySubscription(id, reason) {
  const sub = await vpnSubscriptionStore.get(id);
  if (!sub || sub.status !== 'pending') return null;
  const updated = await vpnSubscriptionStore.update(id, {
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    revokedReason: reason || 'denied',
  });
  audit('vpn.subscription_denied', { subscriptionId: id, userSub: sub.userSub });
  return updated;
}

export async function revokeSubscription(id, reason) {
  const sub = await vpnSubscriptionStore.revoke(id, reason);
  if (!sub) return null;
  audit('vpn.subscription_revoked', { subscriptionId: id, reason, userSub: sub.userSub });
  return sub;
}

export async function deleteSubscription(id) {
  await vpnSubscriptionStore.delete(id);
  audit('vpn.subscription_deleted', { subscriptionId: id });
}

// Правка полей подписки (срок, лимит трафика) администратором.
export async function updateSubscription(id, patch) {
  const allowed = {};
  if ('expiresAt' in patch) allowed.expiresAt = patch.expiresAt;
  if ('trafficLimitGb' in patch) allowed.trafficLimitGb = patch.trafficLimitGb;
  return vpnSubscriptionStore.update(id, allowed);
}

export async function deleteUserSubscriptions(userSub) {
  await vpnSubscriptionStore.deleteByUserSub(userSub);
}

// Отзывает все активные/ожидающие подписки пользователя (напр. при блокировке).
export async function revokeUserActiveSubscriptions(userSub, reason) {
  const subs = await vpnSubscriptionStore.findByUserSub(userSub);
  for (const s of subs) {
    if (s.status === 'active' || s.status === 'pending') {
      await vpnSubscriptionStore.revoke(s.id, reason || 'blocked');
    }
  }
}

export async function getSubscriptionById(id) {
  const sub = await vpnSubscriptionStore.get(id);
  if (!sub) return null;
  return { ...sub, effectiveStatus: effectiveStatusOf(sub) };
}

export async function listSubscriptions() {
  const subs = await vpnSubscriptionStore.listAll();
  return subs.map((sub) => ({ ...sub, effectiveStatus: effectiveStatusOf(sub) }));
}
export async function listActiveSubscriptions() {
  return vpnSubscriptionStore.listEffectiveActive();
}

// Обновляет потраченный трафик подписки по токену (из Hysteria2 Traffic Stats API).
export async function updateSubscriptionTrafficByToken(token, trafficUsedGb) {
  await vpnSubscriptionStore.updateTrafficByToken(token, trafficUsedGb);
}

// ── Subscription payload generation ──────────────────────────────────────────

// Формирует актуальную конфигурацию для клиентского приложения по подписке.
// baseUrl — URL бэкенда (например, https://api.example.com), без trailing slash.
export async function buildSubscriptionPayload(token, baseUrl) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const nodes = await listActiveNodes();
  if (nodes.length === 0) {
    return { error: 'NO_NODES_AVAILABLE' };
  }

  // Формат sing-box JSON (outbounds)
  const outbounds = nodes.map((node) => {
    if (node.kind === 'hysteria2' && node.hysteriaConfig) {
      return generateClientOutbound({
        name: node.name,
        server: node.intermediateHost || node.host,
        port: node.intermediatePublicPort || node.port,
        password: node.hysteriaConfig.password,
        tlsFingerprint: node.hysteriaConfig.tlsFingerprint,
        insecure: !node.hysteriaConfig.tlsFingerprint,
      });
    }
    if (node.kind === 'vless' || node.protocol === 'vless') {
      return generateVlessClientOutbound({
        name: node.name,
        server: node.intermediateHost || node.host,
        port: node.intermediatePublicPort || node.port,
        extra: node.extra,
      });
    }
    if (node.kind === 'wireguard' || node.protocol === 'wireguard') {
      return generateWireguardClientOutbound({
        name: node.name,
        server: node.intermediateHost || node.host,
        port: node.intermediatePublicPort || node.port,
        extra: node.extra,
      });
    }
    if (node.kind === 'amneziawg' || node.protocol === 'amneziawg') {
      return generateAmneziaWGClientOutbound({
        name: node.name,
        server: node.intermediateHost || node.host,
        port: node.intermediatePublicPort || node.port,
        privateKey: node.extra?.privateKey,
        peerPublicKey: node.extra?.peerPublicKey || node.publicKey,
        presharedKey: node.extra?.presharedKey,
        localAddress: node.extra?.localAddress,
        allowedIps: node.extra?.allowedIps,
        mtu: node.extra?.mtu,
        extra: node.extra,
      });
    }
    return {
      tag: node.name,
      type: node.protocol,
      server: node.host,
      server_port: node.port,
      ...(node.publicKey ? { public_key: node.publicKey } : {}),
      ...(node.extra ? { ...node.extra } : {}),
    };
  });

  return {
    version: 1,
    tokenPrefix: token.slice(0, 8),
    updatedAt: new Date().toISOString(),
    expiresAt: sub.expiresAt,
    trafficLimitGb: sub.trafficLimitGb,
    trafficUsedGb: sub.trafficUsedGb,
    nodes: outbounds,
    // Маршрутизация пользователя (split tunneling) — для десктоп-клиента.
    routing: await (async () => {
      const { userSub, updatedAt, ...rest } = await getProfile(sub.userSub);
      return rest;
    })(),
    pacUrl: `${baseUrl}/api/v1/sub/${token}?format=pac`,
    // Обратная совместимость: ссылка на саму подписку для обновления
    subscriptionUrl: `${baseUrl}/api/v1/sub/${token}`,
  };
}

// Готовый WireGuard .conf для подписки (импорт в Hiddify / WireGuard).
// Берём первую активную WireGuard-ноду. Возвращает { error } или { conf, node }.
export async function buildSubscriptionWireguardConf(token) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const nodes = await listActiveNodes();
  const node = nodes.find((n) => n.kind === 'wireguard' || n.protocol === 'wireguard');
  if (!node) return { error: 'NO_WIREGUARD_NODE' };

  const conf = buildWireguardConf({
    server: node.intermediateHost || node.host,
    port: node.intermediatePublicPort || node.port,
    extra: node.extra,
  });
  return { conf, node };
}

// Массив share-ссылок (hysteria2://, vless://, …) по активным нодам подписки.
export async function buildSubscriptionUris(token, { scheme } = {}) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const nodes = await listActiveNodes();
  const uris = [];
  for (const node of nodes) {
    if (node.kind === 'hysteria2' && node.hysteriaConfig) {
      uris.push(generateHysteria2Uri({
        scheme,
        name: node.name,
        server: node.intermediateHost || node.host,
        port: node.intermediatePublicPort || node.port,
        // Пароль = токен подписки: сервер валидирует его через HTTP-auth портала,
        // поэтому отзыв подписки реально блокирует доступ.
        password: token,
        sni: node.hysteriaConfig.sni || 'www.bing.com',
        insecure: node.hysteriaConfig.insecure !== false,
        fingerprint: node.hysteriaConfig.tlsFingerprint,
      }));
    }
  }
  // VLESS+Reality (второй вход, TCP 443) — для клиентов на ядре Xray (Happ).
  // UUID детерминированно выводится из токена подписки (отзыв синкается на ноду).
  if (config.vless.enabled) {
    uris.push(generateVlessRealityUri({
      uuid: tokenToUuid(token),
      host: config.vless.host,
      port: config.vless.port,
      publicKey: config.vless.publicKey,
      shortId: config.vless.shortId,
      sni: config.vless.serverName,
      fingerprint: config.vless.fingerprint,
      flow: config.vless.flow,
      name: 'Dogma-VLESS',
    }));
  }
  if (uris.length === 0) return { error: 'NO_NODES_AVAILABLE' };
  return { uris };
}

// UUID'ы всех действующих подписок — для синка списка клиентов Xray на ноде.
export async function listActiveXrayUuids() {
  const subs = await vpnSubscriptionStore.listEffectiveActive();
  return subs.map((s) => tokenToUuid(s.token));
}

// Base64-подписка (стандартный формат для Hiddify/v2ray-клиентов).
export async function buildSubscriptionBase64(token, { scheme } = {}) {
  const res = await buildSubscriptionUris(token, { scheme });
  if (res.error) return res;
  return { base64: Buffer.from(res.uris.join('\n'), 'utf8').toString('base64') };
}

// Hysteria2-outbound'ы по активным нодам (пароль = токен подписки) +
// адреса серверов, которые клиент должен резолвить напрямую.
async function hysteriaOutboundsForToken(token) {
  const outbounds = [];
  const serverHosts = [];
  const nodes = await listActiveNodes();
  for (const node of nodes) {
    if (node.kind !== 'hysteria2' || !node.hysteriaConfig) continue;
    const server = node.intermediateHost || node.host;
    const tls = {
      enabled: true,
      server_name: node.hysteriaConfig.sni || 'www.bing.com',
    };
    if (node.hysteriaConfig.tlsFingerprint) {
      tls.pin_sha256 = [node.hysteriaConfig.tlsFingerprint];
    } else {
      tls.insecure = true;
    }
    const outbound = {
      type: 'hysteria2',
      tag: node.name,
      server,
      server_port: node.intermediatePublicPort || node.port,
      password: token,
      tls,
    };
    outbounds.push(outbound);
    if (!serverHosts.includes(server)) serverHosts.push(server);
  }
  return { outbounds, serverHosts };
}

// Полный sing-box профиль с маршрутизацией пользователя и DNS через туннель.
// «Умная подписка»: Hiddify/sing-box импортируют её по URL, изменения
// настроек в портале подтягиваются при обновлении подписки в клиенте.
export async function buildSubscriptionSingbox(token) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const { outbounds, serverHosts } = await hysteriaOutboundsForToken(token);
  if (outbounds.length === 0) return { error: 'NO_NODES_AVAILABLE' };

  const profile = await getProfile(sub.userSub);
  return { config: buildSingboxConfig({ profile, outbounds, serverHosts }), sub };
}

// Полный sing-box конфиг в формате, совместимом со старыми ядрами (Happ).
export async function buildSubscriptionHapp(token) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const { outbounds, serverHosts } = await hysteriaOutboundsForToken(token);
  if (outbounds.length === 0) return { error: 'NO_NODES_AVAILABLE' };

  const profile = await getProfile(sub.userSub);
  return { config: buildHappConfig({ profile, outbounds, serverHosts }), sub };
}

// Зашифрованная подписка (format=enc): тот же sing-box конфиг, но AES-256-GCM.
// Расшифровать может только клиент Dogma с общим секретом. Перехватчик ссылки
// видит случайные байты — DNS/адрес ноды/правила недоступны.
export async function buildSubscriptionEncrypted(token) {
  if (!config.vpn.subscriptionEncSecret) return { error: 'ENC_NOT_CONFIGURED' };
  const res = await buildSubscriptionSingbox(token);
  if (res.error) return res;
  const blob = encryptSubscription(JSON.stringify(res.config), token, config.vpn.subscriptionEncSecret);
  return { blob, sub: res.sub };
}

// PAC-файл с теми же правилами маршрутизации — для десктоп-клиента
// (системный прокси Windows понимает PAC).
export async function buildSubscriptionPac(token, proxyAddr) {
  const sub = await getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const { serverHosts } = await hysteriaOutboundsForToken(token);
  const profile = await getProfile(sub.userSub);
  return { pac: buildPac({ profile, proxyAddr, serverHosts }), sub };
}

// ── Admin helpers ────────────────────────────────────────────────────────────

export async function getSubscriptionStats() {
  return {
    totalNodes: (await vpnNodeStore.listAll()).length,
    activeNodes: (await vpnNodeStore.listActive()).length,
    totalSubscriptions: (await vpnSubscriptionStore.listAll()).length,
    activeSubscriptions: (await vpnSubscriptionStore.listActive()).length,
  };
}
