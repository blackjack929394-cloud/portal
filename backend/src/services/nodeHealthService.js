import net from 'node:net';
import { performance } from 'node:perf_hooks';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { withLock } from './lockService.js';

// Проверка доступности нод.
//
// Для Hysteria2/WireGuard нельзя проверить UDP-порт обычным TCP-коннектом,
// поэтому проверяем management-плоскость (SSH). Если у ноды настроен
// traffic-stats endpoint, дополнительно проверяем его по HTTP: недоступная
// статистика переводит ноду в degraded, но не выключает из подписки.

function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    const socket = net.connect({ host, port: Number(port) || 22 });

    const finish = (ok, error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        error,
      });
    };

    socket.setTimeout(timeoutMs, () => finish(false, 'timeout'));
    socket.once('connect', () => finish(true));
    socket.once('error', (err) => finish(false, err.code || err.message));
  });
}

async function httpProbe(node, timeoutMs) {
  if (!node.trafficStatsEnabled || !node.trafficStatsEndpoint) return null;
  const started = performance.now();
  try {
    const res = await fetch(node.trafficStatsEndpoint, {
      headers: node.trafficStatsSecret
        ? { Authorization: node.trafficStatsSecret }
        : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, latencyMs: Math.round(performance.now() - started), error: `stats HTTP ${res.status}` };
    }
    await res.arrayBuffer();
    return { ok: true, latencyMs: Math.max(1, Math.round(performance.now() - started)), error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: err.name === 'TimeoutError' ? 'stats timeout' : (err.code || err.message),
    };
  }
}

function probeTarget(node) {
  const udpOnly = ['hysteria2', 'wireguard', 'amneziawg'].includes(node.kind);
  if (udpOnly) {
    return { host: node.sshHost || node.host, port: node.sshPort || 22 };
  }
  return { host: node.host, port: node.port || 443 };
}

export async function probeNode(node) {
  const timeoutMs = config.nodeHealth.timeoutMs;
  const stats = await httpProbe(node, timeoutMs);
  if (stats?.ok) {
    return { status: 'up', latencyMs: stats.latencyMs, error: null };
  }

  const target = probeTarget(node);
  const tcp = await tcpProbe(target.host, target.port, timeoutMs);
  if (tcp.ok) {
    return {
      status: stats ? 'degraded' : 'up',
      latencyMs: tcp.latencyMs,
      error: stats?.error || null,
    };
  }

  return {
    status: 'down',
    latencyMs: null,
    error: tcp.error || stats?.error || 'unreachable',
  };
}

export async function checkNodeHealth(node) {
  const result = await probeNode(node);
  const now = new Date().toISOString();
  const prevFails = node.healthFailCount || 0;
  const failCount = result.status === 'down' ? prevFails + 1 : 0;
  const threshold = config.nodeHealth.failThreshold;
  const status = result.status === 'down' && failCount < threshold ? 'degraded' : result.status;

  await vpnNodeStore.update(node.id, {
    healthStatus: status,
    healthCheckedAt: now,
    healthLatencyMs: result.latencyMs,
    healthFailCount: failCount,
    healthError: result.error,
    ...(result.status !== 'down' ? { lastSeenAt: now } : {}),
  });
  await vpnNodeStore.addHealthCheck(node.id, {
    status,
    latencyMs: result.latencyMs,
    error: result.error,
  });

  if (node.healthStatus !== status) {
    logger.info(
      { nodeId: node.id, name: node.name, from: node.healthStatus, to: status, latencyMs: result.latencyMs, error: result.error },
      'node health changed',
    );
  }

  return { id: node.id, name: node.name, status, latencyMs: result.latencyMs, error: result.error };
}

// Проверяем пачками, чтобы недоступная нода не блокировала весь цикл.
export async function checkAllNodes() {
  const nodes = await vpnNodeStore.listActive();
  const batchSize = 5;
  const results = [];
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((node) => checkNodeHealth(node).catch((err) => {
        logger.warn({ err, nodeId: node.id }, 'node health check failed');
        return null;
      })),
    );
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}

let timer = null;
let running = false;

export function startNodeHealthMonitor() {
  if (timer) return () => {};

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const ttl = Math.max(30, Math.ceil(config.nodeHealth.intervalMs / 1000) * 2);
      await withLock('dogma:lock:node-health', ttl, checkAllNodes);
    } catch (err) {
      logger.error({ err }, 'node health monitor error');
    } finally {
      running = false;
    }
  };

  tick();
  timer = setInterval(tick, config.nodeHealth.intervalMs);
  timer.unref?.();
  logger.info(
    { intervalMs: config.nodeHealth.intervalMs, failThreshold: config.nodeHealth.failThreshold },
    'node health monitor started',
  );

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export function stopNodeHealthMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
