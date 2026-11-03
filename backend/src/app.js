import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import config from './config/index.js';
import logger from './utils/logger.js';
import adminRouter from './routes/admin.js';
import vpnRouter from './routes/vpn.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { mountAuth } from './auth/index.js';
import { hysteriaAuth, xrayUsers } from './controllers/vpnController.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  // CSP отключаем — раздаём собранный SPA-фронтенд (иначе ломает загрузку ассетов).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(pinoHttp({ logger }));

  // Внешняя auth для Hysteria2 (вызывается сервером ноды) — вне rate-limiter.
  app.post('/hysteria/auth', hysteriaAuth);
  // Синк списка VLESS-клиентов (нода Xray тянет активные UUID) — вне rate-limiter.
  app.get('/xray/users', xrayUsers);

  app.use(generalLimiter);

  mountAuth(app);

  app.get('/health', (req, res) => res.json({ status: 'ok', vpnEnabled: true }));

  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1', vpnRouter);

  // Раздача собранного фронтенда (public/), если он есть. SPA-fallback на index.html.
  const dirName = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(dirName, '../public');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api|\/auth|\/health).*/, (req, res, next) => {
      res.sendFile(path.join(publicDir, 'index.html'), (err) => (err ? next() : undefined));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}