process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let createApp;
let server;
let base;
let adminToken;
let cookie;

before(async () => {
  const mod = await import('../src/app.js');
  createApp = mod.createApp;
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  adminToken = 'qwertyuiopASDFGHJKLzxcvbnm';

  const loginRes = await fetch(`${base}/auth/login`, { redirect: 'manual' });
  const setCookie = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get('set-cookie')];
  cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
});

after(() => server && server.close());

async function adminPost(path, body) {
  return fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify(body),
  });
}

async function adminGet(path) {
  return fetch(`${base}/api/v1${path}`, {
    headers: { 'x-admin-token': adminToken },
  });
}

test('admin can create a hysteria2 node', async () => {
  const res = await adminPost('/vpn/nodes', {
    name: 'EU-1',
    host: 'eu1.example.com',
    port: 8443,
    kind: 'hysteria2',
    region: 'Europe',
    provider: 'Test',
    sshHost: 'eu1-ssh.example.com',
    sshPort: 22,
    sshUser: 'root',
    sshKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
  });
  assert.equal(res.status, 201);
  const node = await res.json();
  assert.equal(node.name, 'EU-1');
  assert.equal(node.kind, 'hysteria2');
  assert.equal(node.deploymentStatus, 'pending');
});

test('subscription payload skips undeployed hysteria node', async () => {
  // Создаём пользовательскую подписку
  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(subRes.status, 201);
  const sub = await subRes.json();

  // Запрашиваем конфиг подписки публично
  const cfgRes = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(cfgRes.status, 410);
  const payload = await cfgRes.json();
  assert.equal(payload.error, 'NO_NODES_AVAILABLE');
});

test('deploy endpoint returns 202 without blocking', async () => {
  const create = await adminPost('/vpn/nodes', {
    name: 'EU-2',
    host: 'eu2.example.com',
    kind: 'hysteria2',
    sshHost: 'eu2.example.com',
    sshKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
  });
  const node = await create.json();

  const res = await adminPost(`/vpn/nodes/${node.id}/deploy`, {});
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'deploying');

  // Даём фоновому деплою время записать ошибку (SSH не настроен, поэтому будет failed)
  await new Promise((r) => setTimeout(r, 500));
  const statusRes = await adminGet(`/vpn/nodes/${node.id}/deploy-status`);
  assert.equal(statusRes.status, 200);
  const status = await statusRes.json();
  assert.ok(['deploying', 'failed'].includes(status.deploymentStatus));
});
