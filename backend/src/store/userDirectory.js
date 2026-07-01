import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Каталог пользователей: две таблицы.
//   employees — пришедшие через корпоративный SSO (ключ: sub из токена)
//   guests    — самостоятельная регистрация (ключ: email, дедуп по почте)
// БД — встроенный node:sqlite (без нативной сборки).

const dirName = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(dirName, '../../storage-test')
  : path.resolve(dirName, '../../storage');
const DB_PATH = path.join(STORAGE_DIR, 'directory.db');

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      sub        TEXT PRIMARY KEY,
      full_name  TEXT,
      email      TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS guests (
      email      TEXT PRIMARY KEY,
      full_name  TEXT,
      created_at TEXT NOT NULL,
      last_seen  TEXT
    );
  `);
  return db;
}

// Сотрудник из SSO — upsert по sub.
export function upsertEmployee({ sub, fullName, email }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO employees (sub, full_name, email, created_at, last_login)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sub) DO UPDATE SET
         full_name = excluded.full_name,
         email     = excluded.email,
         last_login = excluded.last_login`,
    )
    .run(sub, fullName, email || null, now, now);
}

// Гость — дедуп по email. Повторная регистрация обновляет имя, не плодит дубль.
export function registerGuest({ fullName, email }) {
  const now = new Date().toISOString();
  const existing = getDb().prepare('SELECT email FROM guests WHERE email = ?').get(email);
  getDb()
    .prepare(
      `INSERT INTO guests (email, full_name, created_at, last_seen)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         full_name = excluded.full_name,
         last_seen = excluded.last_seen`,
    )
    .run(email, fullName, now, now);
  return { email, fullName, isNew: !existing };
}

export function listGuests() {
  return getDb()
    .prepare('SELECT email, full_name, created_at, last_seen FROM guests ORDER BY created_at DESC')
    .all()
    .map((r) => ({ email: r.email, fullName: r.full_name, createdAt: r.created_at, lastSeen: r.last_seen }));
}

export function listEmployees() {
  return getDb()
    .prepare('SELECT sub, full_name, email, created_at, last_login FROM employees ORDER BY created_at DESC')
    .all()
    .map((r) => ({ sub: r.sub, fullName: r.full_name, email: r.email, createdAt: r.created_at, lastLogin: r.last_login }));
}
