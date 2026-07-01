import config from '../config/index.js';
import * as vpnService from '../services/vpnService.js';
import { audit } from '../services/auditService.js';
import { deployNodeAsync, deployNode } from '../services/nodeDeploymentService.js';
import { vpnNodeStore } from '../models/VpnNode.js';

// ── User-facing endpoints ────────────────────────────────────────────────────

export function getMySubscription(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const sub = vpnService.getUserSubscription(user.sub);
  if (!sub) return res.status(404).json({ error: 'NO_SUBSCRIPTION' });
  return res.json({
    id: sub.id,
    status: sub.status,
    expiresAt: sub.expiresAt,
    trafficLimitGb: sub.trafficLimitGb,
    trafficUsedGb: sub.trafficUsedGb,
    token: sub.token,
    subscriptionUrl: `${req.protocol}://${req.get('host')}/api/v1/sub/${sub.token}`,
  });
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function createSubscription(req, res) {
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

  const sub = vpnService.issueSubscription({
    userSub: user.sub,
    userName: user.name,
    userEmail: user.email,
    ttlDays: effectiveTtl,
    trafficLimitGb: effectiveTraffic,
  });
  return res.status(201).json({
    id: sub.id,
    token: sub.token,
    subscriptionUrl: `${req.protocol}://${req.get('host')}/api/v1/sub/${sub.token}`,
    expiresAt: sub.expiresAt,
    trafficLimitGb: sub.trafficLimitGb,
  });
}

export function revokeMySubscription(req, res) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const sub = vpnService.getUserSubscription(user.sub);
  if (!sub) return res.status(404).json({ error: 'NO_SUBSCRIPTION' });
  vpnService.revokeSubscription(sub.id, 'user_requested');
  return res.json({ ok: true });
}

// ── Public client endpoint: subscription config (no auth, token-based) ───────

export function getSubscriptionConfig(req, res) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const payload = vpnService.buildSubscriptionPayload(req.params.token, baseUrl);
  if (payload.error) {
    const code = payload.error === 'NOT_FOUND' ? 404 : 410;
    return res.status(code).json({ error: payload.error });
  }
  return res.json(payload);
}

// ── Admin endpoints ────────────────────────────────────────────────────────────

export function listNodes(req, res) {
  return res.json({ nodes: vpnService.listNodes() });
}

export function createNode(req, res) {
  const {
    name, host, port, protocol, kind, region, provider, publicKey, extra,
    sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64,
  } = req.body || {};
  if (!name || !host) {
    return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', details: ['name', 'host'] });
  }
  const node = vpnService.createNode({
    name, host, port, protocol, kind, region, provider, publicKey, extra,
    sshHost, sshPort, sshUser, sshKey, sshKeyPath, sshKeyBase64,
  });
  return res.status(201).json(node);
}

export function updateNode(req, res) {
  const node = vpnService.updateNode(req.params.id, req.body || {});
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(node);
}

export function deleteNode(req, res) {
  vpnService.deleteNode(req.params.id);
  return res.json({ ok: true });
}

export function toggleNode(req, res) {
  const node = vpnService.toggleNodeStatus(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(node);
}

export function listSubscriptions(req, res) {
  return res.json({ subscriptions: vpnService.listSubscriptions() });
}

export function revokeSubscription(req, res) {
  const { reason } = req.body || {};
  const sub = vpnService.revokeSubscription(req.params.id, reason || 'admin_revoked');
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(sub);
}

export function getStats(req, res) {
  return res.json(vpnService.getSubscriptionStats());
}

export function deployNodeController(req, res) {
  const node = vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}

export function getDeployStatus(req, res) {
  const node = vpnNodeStore.get(req.params.id);
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
  const node = vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}

export async function rotateWgKeysController(req, res) {
  const node = vpnNodeStore.get(req.params.id);
  if (!node) return res.status(404).json({ error: 'NOT_FOUND' });
  deployNodeAsync(req.params.id);
  return res.json({ ok: true, status: 'deploying' });
}
