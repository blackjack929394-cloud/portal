import pino from 'pino';
import { createRequire } from 'node:module';
import config from '../config/index.js';

// pino-pretty — это dev-зависимость; в прод-образе её может не быть.
// Используем её только если NODE_ENV=development И пакет реально установлен,
// иначе пишем обычный JSON (без падения).
const require = createRequire(import.meta.url);
let prettyTransport;
if (config.env === 'development') {
  try {
    require.resolve('pino-pretty');
    prettyTransport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
  } catch {
    prettyTransport = undefined;
  }
}

// Redaction prevents secrets from ever reaching the logs / audit trail.
const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'password',
      '*.password',
      'p12Password',
      '*.p12Password',
      'apiKey',
      '*.apiKey',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: prettyTransport,
});

export default logger;
