// Изолирует тестовые БД (storage-test/) от рабочих (storage/).
// В ESM статические импорты вычисляются до исполнения модуля, поэтому app.js
// импортируется динамически внутри before(), когда переменная окружения уже установлена.
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Runs against the in-process app on an ephemeral port using global fetch.
// AUTH_MODE=dev is assumed (login is simulated); cert issuance is mock.
let createApp;
let server;
let base;
let cookie;

before(async () => {
  const mod = await import('../src/app.js');
  createApp = mod.createApp;
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  // dev-login: capture the session cookie (do not follow the redirect)
  const loginRes = await fetch(`${base}/auth/login`, { redirect: 'manual' });
  const setCookie = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get('set-cookie')];
  cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
});

after(() => server && server.close());

test('GET /health returns ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
});

test('POST without auth is rejected (401)', async () => {
  const res = await fetch(`${base}/api/v1/certificate-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 401);
});

test('GET /auth/me returns the dev user when authenticated', async () => {
  const res = await fetch(`${base}/auth/me`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const me = await res.json();
  assert.ok(me.name);
});

test('authenticated issuance flow: create -> ISSUED -> one-time download', async () => {
  const create = await fetch(`${base}/api/v1/certificate-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: '{}',
  });
  assert.equal(create.status, 202);
  const { id } = await create.json();
  assert.ok(id);

  let status;
  let token;
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(`${base}/api/v1/certificate-requests/${id}`);
    const json = await res.json();
    status = json.status;
    if (status === 'ISSUED') {
      token = json.delivery.downloadToken;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(status, 'ISSUED');
  assert.ok(token);

  const dl = await fetch(`${base}/api/v1/download/${token}`);
  assert.equal(dl.status, 200);

  const reuse = await fetch(`${base}/api/v1/download/${token}`);
  assert.equal(reuse.status, 404);
});

test('unknown request id returns 404', async () => {
  const res = await fetch(`${base}/api/v1/certificate-requests/nope`);
  assert.equal(res.status, 404);
});

test('approve endpoint requires admin token', async () => {
  const res = await fetch(`${base}/api/v1/certificate-requests/nope/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 401);
});
