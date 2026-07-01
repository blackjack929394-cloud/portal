import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { startArtifactCleanup } from './utils/artifactCleanup.js';
import { recoverPendingRequests } from './services/certificateService.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    `Backend listening on :${config.port} (env=${config.env}, certMode=${config.cert.mode})`,
  );
  startArtifactCleanup();
  recoverPendingRequests();
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
