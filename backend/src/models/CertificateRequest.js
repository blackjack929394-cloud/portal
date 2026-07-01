import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const RequestStatus = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  ISSUED: 'ISSUED',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
});

// Персистентное хранилище заявок (node:sqlite, без нативной сборки).
// ВАЖНО: пароль .p12 здесь НЕ хранится (он только в зашифрованном vault + письме).
// В artifact сохраняются неконфиденциальные поля и in-band deliverable (ключ
// регистрации), необходимые для одноразовой выдачи.

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(dirName, '../../storage-test')
  : path.resolve(dirName, '../../storage');
const DB_PATH = path.join(STORAGE_DIR, 'requests.db');

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cert_requests (
      id                        TEXT PRIMARY KEY,
      full_name                 TEXT,
      email                     TEXT,
      meta_json                 TEXT,
      status                    TEXT NOT NULL,
      created_at                TEXT NOT NULL,
      updated_at                TEXT NOT NULL,
      artifact_json             TEXT,
      download_token            TEXT,
      download_token_expires_at TEXT,
      file_delivered_at         TEXT,
      password_token            TEXT,
      password_token_expires_at TEXT,
      password_revealed_at      TEXT,
      error                     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_req_dl   ON cert_requests(download_token);
    CREATE INDEX IF NOT EXISTS idx_req_pw   ON cert_requests(password_token);
    CREATE INDEX IF NOT EXISTS idx_req_stat ON cert_requests(status);
  `);
  return db;
}

const COLUMNS = [
  'id', 'full_name', 'email', 'meta_json', 'status', 'created_at', 'updated_at',
  'artifact_json', 'download_token', 'download_token_expires_at', 'file_delivered_at',
  'password_token', 'password_token_expires_at', 'password_revealed_at', 'error',
];

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    meta: row.meta_json ? JSON.parse(row.meta_json) : {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    artifact: row.artifact_json ? JSON.parse(row.artifact_json) : null,
    downloadToken: row.download_token,
    downloadTokenExpiresAt: row.download_token_expires_at,
    fileDeliveredAt: row.file_delivered_at,
    passwordToken: row.password_token,
    passwordTokenExpiresAt: row.password_token_expires_at,
    passwordRevealedAt: row.password_revealed_at,
    error: row.error,
  };
}

// Сериализация artifact БЕЗ пароля (пароль не должен попадать в это хранилище).
function artifactToJson(artifact) {
  if (!artifact) return null;
  const { password, ...safe } = artifact; // eslint-disable-line no-unused-vars
  return JSON.stringify(safe);
}

function writeRecord(rec) {
  getDb()
    .prepare(
      `INSERT INTO cert_requests (${COLUMNS.join(', ')})
       VALUES (${COLUMNS.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${COLUMNS.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(', ')}`,
    )
    .run(
      rec.id,
      rec.fullName,
      rec.email || null,
      JSON.stringify(rec.meta || {}),
      rec.status,
      rec.createdAt,
      rec.updatedAt,
      artifactToJson(rec.artifact),
      rec.downloadToken || null,
      rec.downloadTokenExpiresAt || null,
      rec.fileDeliveredAt || null,
      rec.passwordToken || null,
      rec.passwordTokenExpiresAt || null,
      rec.passwordRevealedAt || null,
      rec.error || null,
    );
}

class CertificateRequestStore {
  create({ fullName, email, meta }) {
    const now = new Date().toISOString();
    const rec = {
      id: randomUUID(),
      fullName,
      email: email || null,
      meta: meta || {},
      status: RequestStatus.QUEUED,
      createdAt: now,
      updatedAt: now,
      artifact: null,
      downloadToken: null,
      downloadTokenExpiresAt: null,
      fileDeliveredAt: null,
      passwordToken: null,
      passwordTokenExpiresAt: null,
      passwordRevealedAt: null,
      error: null,
    };
    writeRecord(rec);
    return rec;
  }

  get(id) {
    return rowToRecord(getDb().prepare('SELECT * FROM cert_requests WHERE id = ?').get(id));
  }

  update(id, patch) {
    const rec = this.get(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    writeRecord(rec);
    return rec;
  }

  findByDownloadToken(token) {
    return rowToRecord(getDb().prepare('SELECT * FROM cert_requests WHERE download_token = ?').get(token));
  }

  findByPasswordToken(token) {
    return rowToRecord(getDb().prepare('SELECT * FROM cert_requests WHERE password_token = ?').get(token));
  }

  listByStatus(statuses) {
    const placeholders = statuses.map(() => '?').join(', ');
    return getDb()
      .prepare(`SELECT * FROM cert_requests WHERE status IN (${placeholders})`)
      .all(...statuses)
      .map(rowToRecord);
  }
}

export const certificateRequestStore = new CertificateRequestStore();
