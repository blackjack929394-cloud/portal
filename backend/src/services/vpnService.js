import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from './auditService.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { vpnSubscriptionStore } from '../models/VpnSubscription.js';
import { generateToken } from '../utils/secureToken.js';
import { generateClientOutbound } from './hysteriaConfig.js';

// ── Public API: ноды ─────────────────────────────────────────────────────────

export function listNodes() {
  return vpnNodeStore.listAll();
}

export function listActiveNodes() {
  return vpnNodeStore.listActive().filter((node) => {
    if (node.kind === 'hysteria2') {
      return node.status === 'active' && node.deploymentStatus === 'active';
    }
    return node.status === 'active';
  });
}

export function createNode({ name, host, port, protocol, kind, region, provider, publicKey, extra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64 }) {
  const node = vpnNodeStore.create({ name, host, port, protocol, kind, region, provider, publicKey, extra, sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64 });
  audit('vpn.node_created', { nodeId: node.id, name, host, kind: node.kind });
  return node;
}

export function updateNode(id, patch) {
  const node = vpnNodeStore.update(id, patch);
  if (!node) return null;
  audit('vpn.node_updated', { nodeId: id, patch: Object.keys(patch) });
  return node;
}

export function deleteNode(id) {
  vpnNodeStore.delete(id);
  audit('vpn.node_deleted', { nodeId: id });
}

export function toggleNodeStatus(id) {
  const node = vpnNodeStore.get(id);
  if (!node) return null;
  const next = node.status === 'active' ? 'blocked' : 'active';
  const updated = vpnNodeStore.update(id, { status: next });
  audit('vpn.node_toggled', { nodeId: id, status: next });
  return updated;
}

// ── Public API: подписки ─────────────────────────────────────────────────────

export function getSubscriptionByToken(token) {
  const sub = vpnSubscriptionStore.findByToken(token);
  if (!sub) return null;
  // Проверка срока и статуса
  if (sub.status !== 'active') return { error: 'REVOKED' };
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    return { error: 'EXPIRED' };
  }
  if (sub.trafficLimitGb && sub.trafficUsedGb >= sub.trafficLimitGb) {
    return { error: 'LIMIT_EXCEEDED' };
  }
  return sub;
}

function isEffectiveActive(sub) {
  if (sub.status !== 'active') return false;
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;
  if (sub.trafficLimitGb && sub.trafficUsedGb >= sub.trafficLimitGb) return false;
  return true;
}

export function getUserSubscription(userSub) {
  const subs = vpnSubscriptionStore.findByUserSub(userSub);
  return subs.find((s) => isEffectiveActive(s)) || null;
}

export function issueSubscription({ userSub, userName, userEmail, ttlDays, trafficLimitGb }) {
  // Отзываем предыдущую активную подписку, если есть
  const existing = getUserSubscription(userSub);
  if (existing) {
    vpnSubscriptionStore.revoke(existing.id, 'reissued');
    audit('vpn.subscription_revoked', { subscriptionId: existing.id, reason: 'reissued', userSub });
  }

  const token = generateToken(32);
  const expiresAt = ttlDays
    ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const sub = vpnSubscriptionStore.create({
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

export function revokeSubscription(id, reason) {
  const sub = vpnSubscriptionStore.revoke(id, reason);
  if (!sub) return null;
  audit('vpn.subscription_revoked', { subscriptionId: id, reason, userSub: sub.userSub });
  return sub;
}

export function listSubscriptions() {
  return vpnSubscriptionStore.listAll();
}

export function listActiveSubscriptions() {
  return vpnSubscriptionStore.listEffectiveActive();
}

// ── Subscription payload generation ──────────────────────────────────────────

// Формирует актуальную конфигурацию для клиентского приложения по подписке.
// baseUrl — URL бэкенда (например, https://api.example.com), без trailing slash.
export function buildSubscriptionPayload(token, baseUrl) {
  const sub = getSubscriptionByToken(token);
  if (sub?.error) return sub;
  if (!sub) return { error: 'NOT_FOUND' };

  const nodes = listActiveNodes();
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
    // Обратная совместимость: ссылка на саму подписку для обновления
    subscriptionUrl: `${baseUrl}/api/v1/sub/${token}`,
  };
}

// ── Admin helpers ────────────────────────────────────────────────────────────

export function getSubscriptionStats() {
  return {
    totalNodes: vpnNodeStore.listAll().length,
    activeNodes: vpnNodeStore.listActive().length,
    totalSubscriptions: vpnSubscriptionStore.listAll().length,
    activeSubscriptions: vpnSubscriptionStore.listActive().length,
  };
}
