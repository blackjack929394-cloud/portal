// Тонкий клиент к бэкенду.
// В проде фронт и бэкенд на одном домене (Caddy → backend), поэтому базовый
// адрес пустой — все запросы идут относительно текущего origin (same-origin).
// Для локальной разработки (фронт на :5173, бэкенд на :8080) адрес задаётся
// через VITE_API_URL в .env.development.
const API = import.meta.env.VITE_API_URL ?? '';

export const apiBase = API || window.location.origin;

const opts = (extra = {}) => ({ credentials: 'include', ...extra });

// ── Аутентификация ──────────────────────────────────────────────────────────
export function loginUrl() {
  return `${API}/auth/login`;
}

export async function getMe() {
  const res = await fetch(`${API}/auth/me`, opts());
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(res.status, {});
  return res.json(); // { name, email }
}

export async function logout() {
  await fetch(`${API}/auth/logout`, opts({ method: 'POST' }));
}

// Доступные способы входа: { sso: boolean }.
export async function getAuthConfig() {
  try {
    const res = await fetch(`${API}/auth/config`, opts());
    if (!res.ok) return { sso: false };
    return res.json();
  } catch {
    return { sso: false };
  }
}

// Регистрация аккаунта: ФИО, email, логин, пароль. Возвращает { name, email, kind }.
export async function register({ fullName, email, username, password }) {
  const res = await fetch(`${API}/auth/register`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, username, password }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Вход по логину и паролю. Возвращает { name, email, kind }.
export async function login({ username, password }) {
  const res = await fetch(`${API}/auth/login`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ── VPN (подписки) ───────────────────────────────────────────────────────────
export async function getMySubscription() {
  const res = await fetch(`${API}/api/v1/vpn/subscription`, opts());
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json();
}

export async function createSubscription(body = {}) {
  const res = await fetch(`${API}/api/v1/vpn/subscriptions`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function revokeMySubscription() {
  const res = await fetch(`${API}/api/v1/vpn/subscription/revoke`, opts({ method: 'POST' }));
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json();
}

// ── Маршрутизация (split tunneling) ───────────────────────────────────────────
// Возвращает { profile, presets }.
export async function getRouting() {
  const res = await fetch(`${API}/api/v1/vpn/routing`, opts());
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json();
}

export async function saveRouting(profile) {
  const res = await fetch(`${API}/api/v1/vpn/routing`, opts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ── Чат с поддержкой (пользователь ↔ администратор) ──────────────────────────
export async function getMyChat() {
  const res = await fetch(`${API}/api/v1/chat`, opts());
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json(); // { messages }
}

export async function getMyChatUnread() {
  try {
    const res = await fetch(`${API}/api/v1/chat/unread`, opts());
    if (!res.ok) return 0;
    return (await res.json()).unread || 0;
  } catch {
    return 0;
  }
}

export async function sendMyChatMessage(text) {
  const res = await fetch(`${API}/api/v1/chat`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}
