import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import config from './config/index.js';
import logger from './utils/logger.js';
import certificatesRouter from './routes/certificates.js';
import adminRouter from './routes/admin.js';
import vpnRouter from './routes/vpn.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { mountAuth } from './auth/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind a reverse proxy / load balancer
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(pinoHttp({ logger }));
  app.use(generalLimiter);

  mountAuth(app);

  app.get('/health', (req, res) => res.json({ status: 'ok', certMode: config.cert.mode, vpnEnabled: true }));

  app.use('/api/v1', certificatesRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1', vpnRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
