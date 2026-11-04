process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/postgres.js';

let createApp;
let server;
let base;
let cookie;
let canRun = true;

before(async () => {
  try {
    const { rows } = await query("SELECT to_regclass('public.app_login_sessions') AS table_name");
    canRun = !!rows[0]?.table_name;
  } catch {
    canRun = false;
  }
  if (!canRun) return;

  const mod = await import('../src/app.js');
  createApp = mod.createApp;
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  const uniq = `qr${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'QR Тестов',
      email: `${uniq}@ex.com`,
      username: uniq,
      password: 'password123',
    }),
  });
  const setCookie = reg.headers.getSetCookie
    ? reg.headers.getSetCookie()
    : [reg.headers.get('set-cookie')];
  cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
});

after(() => server && server.close());

test('QR login: website -> app scan -> website confirm -> bearer token', async (t) => {
  if (!canRun) return t.skip('migration 004_app_auth.sql is not applied');

  // 1. Сайт создаёт QR-сессию.
  const start = await fetch(`${base}/auth/qr/start`, { method: 'POST', headers: { cookie } });
  assert.equal(start.status, 200);
  const session = await start.json();
  assert.ok(session.id);
  assert.ok(session.code);
  assert.ok(session.qrPayload.includes('code='));

  // 2. Приложение сканирует QR.
  const scan = await fetch(`${base}/auth/app/qr/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: session.code, deviceName: 'Pixel 8', platform: 'android', appVersion: '1.0.0' }),
  });
  assert.equal(scan.status, 200);
  const scanned = await scan.json();
  assert.equal(scanned.status, 'scanned');
  assert.equal(scanned.deviceName, 'Pixel 8');
  assert.equal(scanned.user.email.endsWith('@ex.com'), true);

  // 3. Сайт видит устройство и подтверждает вход.
  const poll = await fetch(`${base}/auth/qr/${session.id}`, { headers: { cookie } });
  assert.equal(poll.status, 200);
  assert.equal((await poll.json()).status, 'scanned');

  const confirm = await fetch(`${base}/auth/qr/${session.id}/confirm`, { method: 'POST', headers: { cookie } });
  assert.equal(confirm.status, 200);
  assert.equal((await confirm.json()).status, 'confirmed');

  // 4. Приложение забирает Bearer-токен.
  const claim = await fetch(`${base}/auth/app/qr/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: session.code }),
  });
  assert.equal(claim.status, 200);
  const auth = await claim.json();
  assert.ok(auth.token);
  assert.equal(auth.tokenType, 'Bearer');
  assert.equal(auth.user.email.endsWith('@ex.com'), true);

  // 5. Токен работает как обычная авторизация.
  const me = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${auth.token}` } });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.via, 'app');
  assert.equal(meBody.email.endsWith('@ex.com'), true);

  const sub = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({}),
  });
  assert.equal(sub.status, 201);

  // 6. Повторный claim невозможен, выход отзывает токен.
  const again = await fetch(`${base}/auth/app/qr/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: session.code }),
  });
  assert.equal(again.status, 409);

  const logout = await fetch(`${base}/auth/app/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(logout.status, 200);

  const afterLogout = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${auth.token}` } });
  assert.equal(afterLogout.status, 401);
});
