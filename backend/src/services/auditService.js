import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../utils/logger.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(dirName, '../../storage');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit.log');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Очередь записи: не блокируем event loop синхронным appendFileSync в hot path.
// Записи сохраняют порядок, ошибки не роняют запрос.
let writeQueue = Promise.resolve();

// Append-only audit trail.
// NEVER pass secret material (passwords, private keys, registration keys) here.
// Stage 2+: ship these events to a database and/or SIEM instead of a local file.
export function audit(event, data = {}) {
  const entry = { ts: new Date().toISOString(), event, ...data };
  logger.info({ audit: entry }, `audit:${event}`);
  writeQueue = writeQueue
    .then(() => fsp.appendFile(AUDIT_FILE, `${JSON.stringify(entry)}\n`))
    .catch((err) => logger.error({ err }, 'failed to write audit log'));
  return writeQueue;
}

// Дождаться записи очереди при graceful shutdown.
export function flushAudit() {
  return writeQueue;
}
