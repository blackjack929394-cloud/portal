import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// Отдельная БД с паролями к .p12 для админа.
// Пароли шифруются в покое (AES-256-GCM). Ключ — ADMIN_VAULT_KEY (64 hex = 32 байта).
// Без ключа хранилище ОТКЛЮЧЕНО (пароли не сохраняются), чтобы не лежал открытый текст.
// БД — встроенный node:sqlite (без нативной сборки).

const ALGO = 'aes-256-gcm';
const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(dirName, '../../storage-test')
  : path.resolve(dirName, '../../storage');
const DB_PATH = path.join(STORAGE_DIR, 'admin-vault.db');

let db = null;
let key = null;

function getKey() {
  if (key) return key;
  const raw = config.vault.key;
  if (!raw) return null;
  let buf;
  try {
    buf = Buffer.from(raw, 'hex');
  } catch {
    return null;
  }
  if (buf.length !== 32) {
    logger.error('ADMIN_VAULT_KEY must be 64 hex chars (32 bytes). Vault disabled.');
    return null;
  }
  key = buf;
  return key;
}

export function vaultEnabled() {
  return Boolean(getKey());
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cert_passwords (
      request_id TEXT PRIMARY KEY,
      full_name  TEXT,
      email      TEXT,
      file_name  TEXT,
      iv         TEXT NOT NULL,
      tag        TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ct.toString('hex'),
  };
}

function decrypt({ iv, tag, ciphertext }) {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

export function savePassword({ requestId, fullName, email, fileName, password }) {
  if (!vaultEnabled()) return false;
  const e = encrypt(password);
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO cert_passwords
       (request_id, full_name, email, file_name, iv, tag, ciphertext, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(requestId, fullName, email || null, fileName, e.iv, e.tag, e.ciphertext, new Date().toISOString());
  return true;
}

// Метаданные без паролей (для списка в админке).
export function listEntries() {
  if (!vaultEnabled()) return [];
  return getDb()
    .prepare(`SELECT request_id, full_name, email, file_name, created_at FROM cert_passwords ORDER BY created_at DESC`)
    .all()
    .map((r) => ({
      requestId: r.request_id,
      fullName: r.full_name,
      email: r.email,
      fileName: r.file_name,
      createdAt: r.created_at,
    }));
}

// Полная запись с расшифрованным паролем (по одному requestId).
export function getPassword(requestId) {
  if (!vaultEnabled()) return null;
  const r = getDb().prepare(`SELECT * FROM cert_passwords WHERE request_id = ?`).get(requestId);
  if (!r) return null;
  return {
    requestId: r.request_id,
    fullName: r.full_name,
    email: r.email,
    fileName: r.file_name,
    createdAt: r.created_at,
    password: decrypt({ iv: r.iv, tag: r.tag, ciphertext: r.ciphertext }),
  };
}
