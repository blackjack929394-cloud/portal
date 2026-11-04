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
import { query } from './db/postgres.js';
import pool from './db/postgres.js';
import redis from './db/redis.js';
import { httpMetricsMiddleware, renderMetrics } from './services/metricsService.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  // CSP отключаем — раздаём собранный SPA-фронтенд (иначе ломает загрузку ассетов).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(pinoHttp({ logger }));
  app.use(httpMetricsMiddleware);

  // Внешняя auth для Hysteria2 (вызывается сервером ноды) — вне rate-limiter.
  app.post('/hysteria/auth', hysteriaAuth);
  // Синк списка VLESS-клиентов (нода Xray тянет активные UUID) — вне rate-limiter.
  app.get('/xray/users', xrayUsers);

  // Liveness: процесс жив. Readiness: доступны ли БД и Redis.
  app.get('/health', (req, res) => res.json({
    status: 'ok',
    service: 'dogma-backend',
    uptimeSeconds: Math.round(process.uptime()),
    vpnEnabled: true,
  }));

  async function redisReady() {
    try {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function dbReady() {
    try {
      await query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  app.get('/ready', async (req, res) => {
    const [db, redisUp] = await Promise.all([dbReady(), redisReady()]);
    const ready = db && redisUp;
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: { database: db, redis: redisUp },
    });
  });

  // Prometheus scraping — вне общего rate-limiter.
  app.get('/metrics', async (req, res, next) => {
    try {
      let dbUp = false;
      const nodesByHealth = { up: 0, degraded: 0, down: 0, unknown: 0 };
      try {
        const { rows } = await query(
          `SELECT health_status, COUNT(*)::int AS count
             FROM vpn_nodes
            GROUP BY health_status`,
        );
        dbUp = true;
        for (const row of rows) {
          const key = row.health_status || 'unknown';
          nodesByHealth[key] = row.count;
        }
      } catch {
        // БД недоступна — отдаём метрики с db_up=0, чтобы скрейпер видел аварию.
      }
      const redisUp = await redisReady();
      const body = renderMetrics({
        nodesByHealth,
        dbUp,
        redisUp,
        poolStats: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
      });
      res.type('text/plain; version=0.0.4').send(body);
    } catch (err) {
      return next(err);
    }
  });

  app.use(generalLimiter);

  mountAuth(app);

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