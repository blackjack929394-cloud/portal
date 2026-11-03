import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { startTrafficStatsPoller } from './services/trafficStatsService.js';
import { startSubscriptionMaintenance } from './services/subscriptionMaintenance.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info(`Backend listening on ${config.host}:${config.port} (env=${config.env})`);
});

server.on('error', (err) => {
  logger.error({ err }, `Failed to start backend on port ${config.port}`);
  process.exit(1);
});

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Периодически забираем трафик с Hysteria2-нод и обновляем подписки.
startTrafficStatsPoller(30000);

// Раз в час: помечаем просроченные подписки expired и вычищаем давно истёкшие.
startSubscriptionMaintenance();
