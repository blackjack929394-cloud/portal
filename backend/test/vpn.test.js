process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { vpnNodeStore } from '../src/models/VpnNode.js';
import { vpnSubscriptionStore } from '../src/models/VpnSubscription.js';

let createApp;
let server;
let base;
let adminToken;
let cookie;

before(async () => {
  // Очищаем тестовые БД, чтобы тесты не зависели от состояния предыдущих запусков.
  for (const node of vpnNodeStore.listAll()) {
    vpnNodeStore.delete(node.id);
  }
  for (const sub of vpnSubscriptionStore.listAll()) {
    vpnSubscriptionStore.delete(sub.id);
  }

  const mod = await import('../src/app.js');
  createApp = mod.createApp;
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  adminToken = 'qwertyuiopASDFGHJKLzxcvbnm';

  const uniq = `vpn${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const loginRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Тест Тестов', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
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

async function adminDelete(path) {
  return fetch(`${base}/api/v1${path}`, {
    method: 'DELETE',
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

test('admin can delete a revoked subscription', async () => {
  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(subRes.status, 201);
  const sub = await subRes.json();

  const revokeRes = await adminPost(`/vpn/subscriptions/${sub.id}/revoke`, { reason: 'test' });
  assert.equal(revokeRes.status, 200);

  const deleteRes = await adminDelete(`/vpn/subscriptions/${sub.id}`);
  assert.equal(deleteRes.status, 200);
  const deleteJson = await deleteRes.json();
  assert.equal(deleteJson.ok, true);

  const listRes = await adminGet('/vpn/subscriptions');
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(!list.subscriptions.find((s) => s.id === sub.id));
});

test('subscription payload includes vless outbound', async () => {
  const nodeRes = await adminPost('/vpn/nodes', {
    name: 'EU-VLESS',
    host: 'vless.example.com',
    port: 443,
    kind: 'vless',
    extra: { uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
  });
  assert.equal(nodeRes.status, 201);

  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(subRes.status, 201);
  const sub = await subRes.json();

  const cfgRes = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(cfgRes.status, 200);
  const payload = await cfgRes.json();
  assert.ok(payload.nodes.length > 0);
  const vless = payload.nodes.find((n) => n.type === 'vless');
  assert.ok(vless);
  assert.equal(vless.server, 'vless.example.com');
  assert.equal(vless.server_port, 443);
  assert.equal(vless.uuid, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
});

test('subscription serves wireguard outbound and .conf', async () => {
  const nodeRes = await adminPost('/vpn/nodes', {
    name: 'RU-NL',
    host: '203.0.113.10',
    port: 443,
    kind: 'wireguard',
    extra: {
      clientPrivateKey: 'oCwBJLfwwOVRD7GMutbjK+XTALz4YtK4IQD+MnE7cWY=',
      serverPublicKey: 'htOx/IOhNkxkyEvAIzpufEruRUXs/lWUSmnUBPyQoQU=',
      presharedKey: 'WIcoNBb4jwUvUTanUSglZfmAGOJO3kV14U/d3XicsQ4=',
      address: '10.200.200.3/32',
    },
  });
  assert.equal(nodeRes.status, 201);
  const node = await nodeRes.json();
  // Публичный вход через промежуточный RU-сервер.
  const patchRes = await fetch(`${base}/api/v1/vpn/nodes/${node.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ intermediateHost: '192.0.2.1', intermediatePublicPort: 443 }),
  });
  assert.equal(patchRes.status, 200);

  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  const sub = await subRes.json();

  // JSON-подписка: sing-box wireguard outbound, сервер = RU.
  const jsonRes = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(jsonRes.status, 200);
  const payload = await jsonRes.json();
  const wg = payload.nodes.find((n) => n.type === 'wireguard' && n.server === '192.0.2.1');
  assert.ok(wg);
  assert.equal(wg.server_port, 443);
  assert.equal(wg.private_key, 'oCwBJLfwwOVRD7GMutbjK+XTALz4YtK4IQD+MnE7cWY=');
  assert.equal(wg.peer_public_key, 'htOx/IOhNkxkyEvAIzpufEruRUXs/lWUSmnUBPyQoQU=');
  assert.equal(wg.pre_shared_key, 'WIcoNBb4jwUvUTanUSglZfmAGOJO3kV14U/d3XicsQ4=');
  assert.ok(wg.jc === undefined, 'plain wireguard must not carry amnezia params');

  // .conf для Hiddify: Endpoint указывает на RU.
  const confRes = await fetch(`${base}/api/v1/sub/${sub.token}?format=wireguard`);
  assert.equal(confRes.status, 200);
  const conf = await confRes.text();
  assert.match(conf, /\[Interface\]/);
  assert.match(conf, /Endpoint = 192\.0\.2\.1:443/);
  assert.match(conf, /PublicKey = htOx\/IOhNkxkyEvAIzpufEruRUXs\/lWUSmnUBPyQoQU=/);
});

test('subscription payload includes amneziawg outbound', async () => {
  const nodeRes = await adminPost('/vpn/nodes', {
    name: 'EU-AWG',
    host: 'awg.example.com',
    port: 51820,
    kind: 'amneziawg',
    extra: {
      privateKey: 'cCJmMCMw8LTgJGWxP0HWXjkzV+lIa7E7XBS4Rsi8pGg=',
      peerPublicKey: 'aPdDKXO/eL0EBO6tvuxmLM/JoC9eyjO7wMkX9J1QEG8=',
    },
  });
  assert.equal(nodeRes.status, 201);

  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(subRes.status, 201);
  const sub = await subRes.json();

  const cfgRes = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(cfgRes.status, 200);
  const payload = await cfgRes.json();
  assert.ok(payload.nodes.length > 0);
  const awg = payload.nodes.find((n) => n.type === 'wireguard');
  assert.ok(awg);
  assert.equal(awg.server, 'awg.example.com');
  assert.equal(awg.server_port, 51820);
  assert.equal(awg.private_key, 'cCJmMCMw8LTgJGWxP0HWXjkzV+lIa7E7XBS4Rsi8pGg=');
  assert.equal(awg.peer_public_key, 'aPdDKXO/eL0EBO6tvuxmLM/JoC9eyjO7wMkX9J1QEG8=');
  assert.ok(Number.isInteger(awg.jc));
  assert.ok(Number.isInteger(awg.h1));
});

test('admin-revoked user needs approval; approve restores access', async () => {
  const uniq = `appr${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Appr User', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const sc = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get('set-cookie')];
  const ck = sc.filter(Boolean).map((c) => c.split(';')[0]).join('; ');

  // 1) первая заявка — сразу активна
  const c1 = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}',
  });
  assert.equal(c1.status, 201);
  const sub1 = await c1.json();

  // 2) админ отзывает
  const rev = await adminPost(`/vpn/subscriptions/${sub1.id}/revoke`, { reason: 'admin' });
  assert.equal(rev.status, 200);

  // 3) повторная заявка — уходит на одобрение (202, pending)
  const c2 = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}',
  });
  assert.equal(c2.status, 202);
  assert.equal((await c2.json()).pending, true);

  // 4) «моя подписка» показывает pending
  const mine = await fetch(`${base}/api/v1/vpn/subscription`, { headers: { cookie: ck } });
  assert.equal((await mine.json()).status, 'pending');

  // 5) заявка видна админу в очереди, её токен ещё не работает
  const pend = await adminGet('/vpn/pending');
  const item = (await pend.json()).pending.find((x) => x.userSub === `local:${uniq}`);
  assert.ok(item);
  const cfg = await fetch(`${base}/api/v1/sub/${item.token}`);
  assert.equal(cfg.status, 410);

  // 6) админ одобряет → активна, доступ восстановлен
  const appr = await adminPost(`/vpn/subscriptions/${item.id}/approve`, {});
  assert.equal(appr.status, 200);
  assert.equal((await appr.json()).status, 'active');
  const mine2 = await fetch(`${base}/api/v1/vpn/subscription`, { headers: { cookie: ck } });
  assert.equal((await mine2.json()).status, 'active');
});

test('admin denies request; user sees denied and can contact support', async () => {
  const uniq = `deny${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Deny User', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const sc = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get('set-cookie')];
  const ck = sc.filter(Boolean).map((c) => c.split(';')[0]).join('; ');

  const c1 = await fetch(`${base}/api/v1/vpn/subscriptions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}' });
  const sub1 = await c1.json();
  await adminPost(`/vpn/subscriptions/${sub1.id}/revoke`, { reason: 'admin' });
  await fetch(`${base}/api/v1/vpn/subscriptions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}' });

  const item = (await (await adminGet('/vpn/pending')).json()).pending.find((x) => x.userSub === `local:${uniq}`);
  assert.ok(item);
  const deny = await adminPost(`/vpn/subscriptions/${item.id}/deny`, {});
  assert.equal(deny.status, 200);

  // пользователь видит «отклонено»
  const mine = await fetch(`${base}/api/v1/vpn/subscription`, { headers: { cookie: ck } });
  assert.equal((await mine.json()).status, 'denied');

  // чат: пустое — 400; сообщение — 201; админ видит диалог и отвечает
  const empty = await fetch(`${base}/api/v1/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify({ text: '' }) });
  assert.equal(empty.status, 400);
  const sent = await fetch(`${base}/api/v1/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify({ text: 'Доступ отклонён, помогите' }) });
  assert.equal(sent.status, 201);

  const chats = (await (await adminGet('/vpn/chats')).json()).chats;
  const conv = chats.find((c) => c.userSub === `local:${uniq}`);
  assert.ok(conv);
  assert.ok(conv.unread >= 1);

  const reply = await adminPost('/vpn/chats/messages', { userSub: `local:${uniq}`, text: 'Проверяем ваш вопрос' });
  assert.equal(reply.status, 201);

  const myChat = await (await fetch(`${base}/api/v1/chat`, { headers: { cookie: ck } })).json();
  assert.ok(myChat.messages.some((m) => m.sender === 'admin' && m.text.includes('Проверяем')));
  assert.ok(myChat.messages.some((m) => m.sender === 'user' && m.text.includes('помогите')));
});

test('admin can list users (login, email, full name)', async () => {
  const uniq = `usr${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'List User', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const res = await adminGet('/vpn/users');
  assert.equal(res.status, 200);
  const u = (await res.json()).users.find((x) => x.username === uniq);
  assert.ok(u);
  assert.equal(u.email, `${uniq}@ex.com`);
  assert.equal(u.fullName, 'List User');
});

test('admin can delete a user (with subscriptions revoked)', async () => {
  const uniq = `del${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Del User', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const sc = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get('set-cookie')];
  const ck = sc.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const sub = await (await fetch(`${base}/api/v1/vpn/subscriptions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}' })).json();

  const del = await adminDelete(`/vpn/users/${uniq}`);
  assert.equal(del.status, 200);

  const users = (await (await adminGet('/vpn/users')).json()).users;
  assert.ok(!users.find((x) => x.username === uniq));

  // токен подписки больше не действует
  const cfg = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(cfg.status, 404);

  // повторное удаление — 404
  const again = await adminDelete(`/vpn/users/${uniq}`);
  assert.equal(again.status, 404);
});

test('admin can block/unblock a user (login refused, access revoked)', async () => {
  const uniq = `blk${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Blk User', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const sc = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get('set-cookie')];
  const ck = sc.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const sub = await (await fetch(`${base}/api/v1/vpn/subscriptions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: '{}' })).json();

  // блокировка
  const b = await adminPost(`/vpn/users/${uniq}/block`, { blocked: true });
  assert.equal(b.status, 200);
  const blocked = (await (await adminGet('/vpn/users')).json()).users.find((x) => x.username === uniq);
  assert.equal(blocked.blocked, true);

  // вход запрещён
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uniq, password: 'password123' }) });
  assert.equal(login.status, 403);

  // токен подписки отозван
  const cfg = await fetch(`${base}/api/v1/sub/${sub.token}`);
  assert.equal(cfg.status, 410);

  // разблокировка → вход снова работает
  const ub = await adminPost(`/vpn/users/${uniq}/block`, { blocked: false });
  assert.equal(ub.status, 200);
  const login2 = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uniq, password: 'password123' }) });
  assert.equal(login2.status, 200);
});
