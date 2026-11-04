import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '../db/postgres.js';

// Каталог пользователей: три таблицы.
//   users     — локальные аккаунты (логин + пароль)
//   employees — пришедшие через корпоративный SSO (ключ: sub из токена)
//   guests    — самостоятельная регистрация (ключ: email, дедуп по почте)
// Теперь хранится в PostgreSQL.

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

function rowToUser(r) {
  if (!r) return null;
  return {
    username: r.username,
    email: r.email,
    fullName: r.full_name,
    createdAt: r.created_at,
    lastLogin: r.last_login,
    blocked: r.blocked,
    pass_hash: r.pass_hash,
    pass_salt: r.pass_salt,
  };
}

function rowToEmployee(r) {
  if (!r) return null;
  return {
    sub: r.sub,
    fullName: r.full_name,
    email: r.email,
    createdAt: r.created_at,
    lastLogin: r.last_login,
    blocked: r.blocked,
  };
}

// ── Локальные аккаунты (логин + пароль) ──────────────────────────────────────

export async function getUserByUsername(username) {
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
  return rowToUser(rows[0]) || null;
}

export async function getUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rowToUser(rows[0]) || null;
}

// Создаёт аккаунт. Бросает Error с .code = 'USERNAME_TAKEN' | 'EMAIL_TAKEN'.
export async function createUser({ username, email, fullName, password }) {
  const existingUser = await getUserByUsername(username);
  if (existingUser) { const e = new Error('username taken'); e.code = 'USERNAME_TAKEN'; throw e; }
  const existingEmail = await getUserByEmail(email);
  if (existingEmail) { const e = new Error('email taken'); e.code = 'EMAIL_TAKEN'; throw e; }
  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();
  await query(
    `INSERT INTO users (username, email, full_name, pass_hash, pass_salt, created_at, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [username, email, fullName, hash, salt, now, now],
  );
  return { username, email, fullName };
}

// Проверяет логин/пароль. Возвращает пользователя, { blocked: true } или null.
export async function authenticateUser(username, password) {
  let row = await getUserByUsername(username);
  // Вход по email: Windows-клиент присылает почту вместо логина.
  if (!row && username.includes('@')) {
    row = await getUserByEmail(username);
  }
  if (!row) return null;
  if (!verifyPassword(password, row.pass_hash, row.pass_salt)) return null;
  if (row.blocked) return { blocked: true };
  await query('UPDATE users SET last_login = $1 WHERE username = $2', [new Date().toISOString(), username]);
  return rowToUser(row);
}

// Блокировка/разблокировка. Возвращает true, если пользователь найден.
export async function setUserBlocked(username, blocked) {
  const { rowCount } = await query('UPDATE users SET blocked = $1 WHERE username = $2', [blocked, username]);
  return rowCount > 0;
}

export async function listUsers() {
  const { rows } = await query('SELECT username, email, full_name, created_at, last_login, blocked FROM users ORDER BY created_at DESC');
  return rows.map(rowToUser);
}

export async function deleteUser(username) {
  const { rowCount } = await query('DELETE FROM users WHERE username = $1', [username]);
  return rowCount > 0;
}

// ── Сотрудники из SSO ───────────────────────────────────────────────────────

export async function getEmployeeBySub(sub) {
  const { rows } = await query('SELECT * FROM employees WHERE sub = $1', [sub]);
  return rowToEmployee(rows[0]) || null;
}

// Сотрудник из SSO — upsert по sub. Поле blocked не трогаем.
export async function upsertEmployee({ sub, fullName, email }) {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO employees (sub, full_name, email, created_at, last_login)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(sub) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       email     = EXCLUDED.email,
       last_login = EXCLUDED.last_login`,
    [sub, fullName, email || null, now, now],
  );
}

export async function setEmployeeBlocked(sub, blocked) {
  const { rowCount } = await query('UPDATE employees SET blocked = $1 WHERE sub = $2', [blocked, sub]);
  return rowCount > 0;
}

export async function deleteEmployee(sub) {
  const { rowCount } = await query('DELETE FROM employees WHERE sub = $1', [sub]);
  return rowCount > 0;
}

export async function listEmployees() {
  const { rows } = await query('SELECT sub, full_name, email, created_at, last_login, blocked FROM employees ORDER BY created_at DESC');
  return rows.map(rowToEmployee);
}

// ── Общие проверки ──────────────────────────────────────────────────────────

// Возвращает true, если пользователь (локальный или SSO) заблокирован.
export async function isBlocked(sub, kind) {
  if (kind === 'employee') {
    const emp = await getEmployeeBySub(sub);
    return emp ? emp.blocked : false;
  }
  if (kind === 'user' && sub.startsWith('local:')) {
    const username = sub.slice(6);
    const user = await getUserByUsername(username);
    return user ? user.blocked : false;
  }
  return false;
}

// Гость — дедуп по email. Повторная регистрация обновляет имя, не плодит дубль.
export async function registerGuest({ fullName, email }) {
  const now = new Date().toISOString();
  const { rows } = await query('SELECT email FROM guests WHERE email = $1', [email]);
  const existing = rows[0];
  await query(
    `INSERT INTO guests (email, full_name, created_at, last_seen)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       last_seen = EXCLUDED.last_seen`,
    [email, fullName, now, now],
  );
  return { email, fullName, isNew: !existing };
}

export async function listGuests() {
  const { rows } = await query('SELECT email, full_name, created_at, last_seen FROM guests ORDER BY created_at DESC');
  return rows.map((r) => ({ email: r.email, fullName: r.full_name, createdAt: r.created_at, lastSeen: r.last_seen }));
}
