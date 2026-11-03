import config from '../config/index.js';
import logger from '../utils/logger.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { vpnSubscriptionStore } from '../models/VpnSubscription.js';

const BYTES_IN_GB = 1024 ** 3;

// Формат ответа Hysteria2 Traffic Stats API:
// { "<client_id>": { "tx": 12345, "rx": 67890 }, ... }
async function fetchNodeTrafficStats(node) {
  if (!node.trafficStatsEnabled || !node.trafficStatsEndpoint) {
    return null;
  }
  try {
    const res = await fetch(node.trafficStatsEndpoint, {
      headers: node.trafficStatsSecret ? { Authorization: node.trafficStatsSecret } : {},
    });
    if (!res.ok) {
      logger.warn({ nodeId: node.id, status: res.status, endpoint: node.trafficStatsEndpoint }, 'Hysteria traffic stats request failed');
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn({ err, nodeId: node.id, endpoint: node.trafficStatsEndpoint }, 'Hysteria traffic stats fetch error');
    return null;
  }
}

// Агрегирует трафик (tx + rx) по токену подписки.
// client_id в Hysteria2 = полный токен подписки (см. hysteriaAuth).
function aggregateTrafficByToken(statsMap) {
  const totals = new Map();
  if (!statsMap || typeof statsMap !== 'object') return totals;
  for (const [clientId, entry] of Object.entries(statsMap)) {
    if (!entry || typeof entry !== 'object') continue;
    const tx = Number(entry.tx) || 0;
    const rx = Number(entry.rx) || 0;
    const token = clientId;
    totals.set(token, (totals.get(token) || 0) + tx + rx);
  }
  return totals;
}

// Обновляет traffic_used_gb для всех активных подписок на основе статистики нод.
export async function updateSubscriptionsTraffic() {
  const nodes = await vpnNodeStore.listActive();
  const activeNodes = nodes.filter((n) => n.kind === 'hysteria2' && n.deploymentStatus === 'active');
  if (activeNodes.length === 0) return;

  const totals = new Map();
  for (const node of activeNodes) {
    const stats = await fetchNodeTrafficStats(node);
    if (!stats) continue;
    const nodeTotals = aggregateTrafficByToken(stats);
    for (const [token, bytes] of nodeTotals) {
      totals.set(token, (totals.get(token) || 0) + bytes);
    }
  }

  if (totals.size === 0) return;

  const subs = await vpnSubscriptionStore.listAll();
  for (const sub of subs) {
    const bytes = totals.get(sub.token);
    if (bytes === undefined) continue;
    const usedGb = bytes / BYTES_IN_GB;
    // Обновляем только если значение выросло, чтобы не сбрасывать счётчик
    // при кратковременном отсутствии клиента в статистике.
    if (usedGb > (sub.trafficUsedGb || 0)) {
      await vpnSubscriptionStore.updateTrafficByToken(sub.token, usedGb);
    }
  }
}

// Запускает периодический опрос статистики трафика.
export function startTrafficStatsPoller(intervalMs = 30000) {
  if (intervalMs <= 0) return;
  const tick = async () => {
    try {
      await updateSubscriptionsTraffic();
    } catch (err) {
      logger.error({ err }, 'Traffic stats poller error');
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}
