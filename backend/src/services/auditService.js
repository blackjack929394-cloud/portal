import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../utils/logger.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(dirName, '../../storage');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit.log');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Append-only audit trail.
// NEVER pass secret material (passwords, private keys, registration keys) here.
// Stage 2+: ship these events to a database and/or SIEM instead of a local file.
export function audit(event, data = {}) {
  const entry = { ts: new Date().toISOString(), event, ...data };
  logger.info({ audit: entry }, `audit:${event}`);
  try {
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    logger.error({ err }, 'failed to write audit log');
  }
}
