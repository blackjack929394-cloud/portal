process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

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
  const uniq = `api${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Тест Тестов', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const setCookie = reg.headers.getSetCookie
    ? reg.headers.getSetCookie()
    : [reg.headers.get('set-cookie')];
  cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
});

after(() => server && server.close());

test('GET /health returns ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
});

test('GET /auth/me works after registration', async () => {
  const res = await fetch(`${base}/auth/me`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const me = await res.json();
  assert.ok(me.email);
  assert.equal(me.kind, 'user');
});

test('register validation rejects short password / bad username', async () => {
  const bad = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Иван Иванов', email: 'x@y.com', username: 'ab', password: '123' }),
  });
  assert.equal(bad.status, 400);
});

test('duplicate username is rejected (409); login works', async () => {
  const uniq = `dup${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const body = { fullName: 'Пётр Петров', email: `${uniq}@ex.com`, username: uniq, password: 'password123' };
  const first = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(first.status, 201);
  const dup = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, email: `${uniq}b@ex.com` }) });
  assert.equal(dup.status, 409);

  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uniq, password: 'password123' }) });
  assert.equal(login.status, 200);
  const badLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uniq, password: 'wrong' }) });
  assert.equal(badLogin.status, 401);
});

test('creating a subscription without auth is rejected (401)', async () => {
  const res = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test('authenticated subscription flow: create -> get -> revoke', async () => {
  const create = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(create.status, 201);
  const sub = await create.json();
  assert.ok(sub.token);
  assert.ok(sub.subscriptionUrl.includes(sub.token));

  const get = await fetch(`${base}/api/v1/vpn/subscription`, { headers: { cookie } });
  assert.equal(get.status, 200);
  const mine = await get.json();
  assert.equal(mine.status, 'active');
  assert.equal(typeof mine.activeNodeCount, 'number');

  const revoke = await fetch(`${base}/api/v1/vpn/subscription/revoke`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(revoke.status, 200);
});

test('admin API is protected', async () => {
  const res = await fetch(`${base}/api/v1/admin/session`);
  assert.ok([401, 503].includes(res.status));
});