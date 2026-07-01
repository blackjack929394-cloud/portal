// Тонкий клиент к бэкенду. Базовый адрес — из VITE_API_URL.
// credentials:'include' обязателен, чтобы браузер слал сессионную cookie.
const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const apiBase = API;

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

// Гостевая регистрация (ФИО + email). Возвращает { name, email, kind }.
export async function guestRegister({ fullName, email }) {
  const res = await fetch(`${API}/auth/guest`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email }),
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

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}
