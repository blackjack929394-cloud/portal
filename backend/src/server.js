import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { startTrafficStatsPoller } from './services/trafficStatsService.js';
import { startSubscriptionMaintenance } from './services/subscriptionMaintenance.js';
import { startNodeHealthMonitor, stopNodeHealthMonitor } from './services/nodeHealthService.js';
import { flushAudit } from './services/auditService.js';
import { vpnNodeStore } from './models/VpnNode.js';

const app = createApp();

// Reconciliation: деплой, прерванный рестартом процесса, не должен висеть вечно.
vpnNodeStore.reconcileStuckDeployments()
  .then((rows) => {
    if (rows.length > 0) {
      logger.warn({ count: rows.length, nodes: rows.map((n) => n.name) }, 'stuck deployments reconciled');
    }
  })
  .catch((err) => logger.error({ err }, 'failed to reconcile deployments'));

const server = app.listen(config.port, config.host, () => {
  logger.info(`Backend listening on ${config.host}:${config.port} (env=${config.env})`);
});

server.on('error', (err) => {
  logger.error({ err }, `Failed to start backend on port ${config.port}`);
  process.exit(1);
});

// Периодически забираем трафик с Hysteria2-нод и обновляем подписки.
const trafficTimer = startTrafficStatsPoller(30000);

// Раз в час: помечаем просроченные подписки expired и вычищаем давно истёкшие.
const stopMaintenance = startSubscriptionMaintenance();

// Health-check нод + автоматическое исключение упавших из подписки.
const stopHealth = startNodeHealthMonitor();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, draining and shutting down`);

  // Останавливаем фоновые задачи, чтобы они не писали в БД во время остановки.
  stopHealth?.();
  stopNodeHealthMonitor();
  stopMaintenance?.();
  if (trafficTimer) clearInterval(trafficTimer);

  // Перестаём принимать новые соединения; текущие запросы дожидаются ответа.
  server.close(() => {
    flushAudit().finally(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
  server.closeIdleConnections?.();

  setTimeout(() => {
    logger.warn('shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
