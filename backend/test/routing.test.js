process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain,
  validateProfileInput,
  buildSingboxConfig,
  buildPac,
  defaultProfile,
  PRESETS,
  LOCAL_IP_CIDRS,
  RU_DIRECT_DOMAINS,
} from '../src/services/routingService.js';
import { routingProfileStore } from '../src/models/RoutingProfile.js';
import { vpnNodeStore } from '../src/models/VpnNode.js';
import { vpnSubscriptionStore } from '../src/models/VpnSubscription.js';

// ── normalizeDomain ──────────────────────────────────────────────────────────

test('normalizeDomain: базовые случаи', () => {
  assert.equal(normalizeDomain('Example.COM'), 'example.com');
  assert.equal(normalizeDomain('https://youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeDomain('*.github.com'), 'github.com');
  assert.equal(normalizeDomain('  t.me  '), 't.me');
  assert.equal(normalizeDomain('site.ru:8443'), 'site.ru');
});

test('normalizeDomain: IDN → punycode', () => {
  assert.match(normalizeDomain('кино.рф'), /^xn--.+\.xn--p1ai$/);
});

test('normalizeDomain: мусор отклоняется', () => {
  assert.equal(normalizeDomain(''), null);
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeDomain('localhost'), null); // нет точки
  assert.equal(normalizeDomain('a..b'), null);
  assert.equal(normalizeDomain('-bad.com'), null);
});

// ── validateProfileInput ─────────────────────────────────────────────────────

test('validateProfileInput: нормализует и дедуплицирует', () => {
  const res = validateProfileInput({
    mode: 'selective',
    ruDirect: false,
    presets: ['youtube', 'youtube', 'telegram'],
    proxyDomains: ['Example.com', 'example.com', 'https://x.com/'],
    directDomains: [],
  });
  assert.ok(!res.error, JSON.stringify(res));
  assert.equal(res.profile.mode, 'selective');
  assert.equal(res.profile.ruDirect, false);
  assert.deepEqual(res.profile.presets, ['youtube', 'telegram']);
  assert.deepEqual(res.profile.proxyDomains, ['example.com', 'x.com']);
});

test('validateProfileInput: ошибки', () => {
  assert.equal(validateProfileInput({ mode: 'nope' }).error, 'INVALID_MODE');
  assert.equal(validateProfileInput({ mode: 'global', presets: ['unknown-x'] }).error, 'UNKNOWN_PRESET');
  assert.equal(validateProfileInput({ mode: 'global', directDomains: ['@@@'] }).error, 'INVALID_DOMAIN');
  assert.equal(
    validateProfileInput({ mode: 'global', directDomains: Array.from({ length: 101 }, (_, i) => `d${i}.com`) }).error,
    'TOO_MANY_DOMAINS',
  );
});

// ── buildSingboxConfig ───────────────────────────────────────────────────────

const OUTBOUND = {
  type: 'hysteria2', tag: 'RU-1', server: 'vpn.example.com', server_port: 443,
  password: 'tok', tls: { enabled: true, server_name: 'www.bing.com', insecure: true },
};

test('singbox global: final=proxy, RU и исключения напрямую, DNS через туннель', () => {
  const cfg = buildSingboxConfig({
    profile: { ...defaultProfile(), directDomains: ['bank.com'] },
    outbounds: [OUTBOUND],
    serverHosts: ['vpn.example.com'],
  });
  assert.equal(cfg.route.final, 'proxy');
  assert.equal(cfg.dns.final, 'dns-remote');
  // формат sing-box 1.12+: dns-remote — DoH (type https) через туннель
  const remote = cfg.dns.servers.find((s) => s.tag === 'dns-remote');
  assert.equal(remote.detour, 'proxy');
  assert.equal(remote.type, 'https');
  assert.equal(remote.server, '1.1.1.1');
  // dns-direct — российский Яндекс-DNS без detour (в 1.12 detour на пустой
  // direct = FATAL); его трафик направляется напрямую route-правилом.
  const direct = cfg.dns.servers.find((s) => s.tag === 'dns-direct');
  assert.equal(direct.server, '77.88.8.8');
  assert.equal(direct.detour, undefined);
  assert.ok(cfg.route.rules.some((r) => r.ip_cidr?.includes('77.88.8.8/32') && r.outbound === 'direct'));
  // DNS перехватывается через action hijack-dns (1.12+), без dns-out outbound
  assert.ok(cfg.route.rules.some((r) => r.protocol === 'dns' && r.action === 'hijack-dns'));
  assert.ok(!cfg.outbounds.some((o) => o.type === 'dns' || o.type === 'block'));
  assert.deepEqual(cfg.route.default_domain_resolver, { server: 'dns-direct' });
  // сервер VPN резолвится напрямую (иначе петля)
  assert.ok(cfg.dns.rules.some((r) => r.domain?.includes('vpn.example.com') && r.server === 'dns-direct'));
  // приватные сети напрямую
  assert.ok(cfg.route.rules.some((r) => r.ip_is_private && r.outbound === 'direct'));
  // базовый список локальных CIDR напрямую
  assert.ok(cfg.route.rules.some((r) => r.ip_cidr === LOCAL_IP_CIDRS && r.outbound === 'direct'));
  // RU напрямую
  assert.ok(cfg.route.rules.some((r) => r.domain_suffix?.includes('.ru') && r.outbound === 'direct'));
  // пользовательское исключение
  assert.ok(cfg.route.rules.some((r) => r.domain?.includes('bank.com') && r.outbound === 'direct'));
  // единственная нода — селектор без urltest
  const selector = cfg.outbounds.find((o) => o.tag === 'proxy');
  assert.deepEqual(selector.outbounds, ['RU-1']);
});

test('singbox global ruDirect: не-.ru домены РФ-сервисов идут напрямую (Яндекс/VK)', () => {
  const cfg = buildSingboxConfig({
    profile: { ...defaultProfile(), ruDirect: true },
    outbounds: [OUTBOUND],
    serverHosts: ['vpn.example.com'],
  });
  assert.ok(RU_DIRECT_DOMAINS.includes('yastatic.net'));
  assert.ok(RU_DIRECT_DOMAINS.includes('vk.com'));
  // домен yandex.net резолвится напрямую и роутится напрямую
  assert.ok(cfg.dns.rules.some((r) => r.domain?.includes('yandex.net') && r.server === 'dns-direct'));
  assert.ok(cfg.route.rules.some((r) => r.domain?.includes('yastatic.net') && r.outbound === 'direct'));
});

test('singbox global без ruDirect: нет РФ-правил (ни суффиксов, ни доменов сервисов)', () => {
  const cfg = buildSingboxConfig({
    profile: { ...defaultProfile(), ruDirect: false },
    outbounds: [OUTBOUND],
    serverHosts: ['vpn.example.com'],
  });
  assert.ok(!cfg.route.rules.some((r) => r.domain?.includes('yastatic.net')));
});

test('singbox global без ruDirect: нет RU-правил', () => {
  const cfg = buildSingboxConfig({
    profile: { ...defaultProfile(), ruDirect: false },
    outbounds: [OUTBOUND],
    serverHosts: ['vpn.example.com'],
  });
  assert.ok(!cfg.route.rules.some((r) => r.geoip));
});

test('singbox selective: final=direct, пресеты и домены через proxy', () => {
  const cfg = buildSingboxConfig({
    profile: { ...defaultProfile(), mode: 'selective', presets: ['telegram'], proxyDomains: ['chatgpt.com'] },
    outbounds: [OUTBOUND],
    serverHosts: ['vpn.example.com'],
  });
  assert.equal(cfg.route.final, 'direct');
  assert.equal(cfg.dns.final, 'dns-direct');
  const proxyRule = cfg.route.rules.find((r) => r.outbound === 'proxy' && r.domain);
  assert.ok(proxyRule.domain.includes('t.me'));
  assert.ok(proxyRule.domain.includes('chatgpt.com'));
  assert.ok(proxyRule.domain_suffix.includes('.telegram.org'));
  // Telegram работает по IP — есть ip_cidr-правило
  const tg = PRESETS.find((p) => p.id === 'telegram');
  const ipRule = cfg.route.rules.find((r) => r.ip_cidr && r.outbound === 'proxy');
  assert.deepEqual(ipRule.ip_cidr, tg.ips);
  // DNS выбранных доменов резолвится удалённо (не палим их провайдеру)
  assert.ok(cfg.dns.rules.some((r) => r.domain?.includes('chatgpt.com') && r.server === 'dns-remote'));
});

test('singbox: локальные CIDR напрямую в обоих режимах', () => {
  for (const mode of ['global', 'selective']) {
    const cfg = buildSingboxConfig({
      profile: { ...defaultProfile(), mode },
      outbounds: [OUTBOUND],
      serverHosts: ['vpn.example.com'],
    });
    const rule = cfg.route.rules.find((r) => r.ip_cidr === LOCAL_IP_CIDRS);
    assert.ok(rule && rule.outbound === 'direct', `mode ${mode}`);
    assert.ok(rule.ip_cidr.includes('192.168.0.0/16'));
    assert.ok(rule.ip_cidr.includes('10.0.0.0/8'));
  }
});

test('singbox: несколько нод → urltest + selector', () => {
  const cfg = buildSingboxConfig({
    profile: defaultProfile(),
    outbounds: [OUTBOUND, { ...OUTBOUND, tag: 'NL-1', server: 'vpn2.example.com' }],
    serverHosts: ['vpn.example.com', 'vpn2.example.com'],
  });
  const auto = cfg.outbounds.find((o) => o.tag === 'auto');
  assert.deepEqual(auto.outbounds, ['RU-1', 'NL-1']);
  const selector = cfg.outbounds.find((o) => o.tag === 'proxy');
  assert.equal(selector.default, 'auto');
});

// ── buildPac ─────────────────────────────────────────────────────────────────

test('pac global: по умолчанию PROXY, исключения DIRECT', () => {
  const pac = buildPac({
    profile: { ...defaultProfile(), directDomains: ['bank.com'] },
    proxyAddr: '127.0.0.1:26001',
    serverHosts: ['vpn.example.com'],
  });
  assert.match(pac, /return "PROXY 127\.0\.0\.1:26001";\s*}$/);
  assert.match(pac, /dnsDomainIs\(host, "\.bank\.com"\)/);
  assert.match(pac, /dnsDomainIs\(host, "\.ru"\)/);
  // РФ-сервисы на не-.ru доменах тоже напрямую
  assert.match(pac, /dnsDomainIs\(host, "\.yastatic\.net"\)/);
  assert.match(pac, /host === "vk\.com"/);
  assert.match(pac, /host === "vpn\.example\.com"/);
  assert.match(pac, /isPlainHostName/);
});

test('pac: литеральные локальные IP всегда напрямую (guard + isInNet)', () => {
  const pac = buildPac({ profile: defaultProfile() });
  // guard-регекс на IPv4-литерал
  assert.match(pac, /\/\^\\d\{1,3\}\(\\\.\\d\{1,3\}\)\{3\}\$\/\.test\(host\)/);
  assert.match(pac, /isInNet\(host, "192\.168\.0\.0", "255\.255\.0\.0"\)/);
  assert.match(pac, /isInNet\(host, "10\.0\.0\.0", "255\.0\.0\.0"\)/);
  assert.match(pac, /isInNet\(host, "172\.16\.0\.0", "255\.240\.0\.0"\)/);
  assert.match(pac, /isInNet\(host, "100\.64\.0\.0", "255\.192\.0\.0"\)/);
});

test('pac selective: по умолчанию DIRECT, выбранное PROXY', () => {
  const pac = buildPac({
    profile: { ...defaultProfile(), mode: 'selective', presets: ['youtube'] },
  });
  assert.match(pac, /return "DIRECT";\s*}$/);
  assert.match(pac, /dnsDomainIs\(host, "\.youtube\.com"\) \|\| host === "youtube\.com"/);
});

// ── HTTP endpoints ───────────────────────────────────────────────────────────

let server;
let base;
let cookie;
let token;
const adminToken = 'qwertyuiopASDFGHJKLzxcvbnm';
const adminGet = (path) => fetch(`${base}/api/v1${path}`, { headers: { 'x-admin-token': adminToken } });

before(async () => {
  for (const node of vpnNodeStore.listAll()) vpnNodeStore.delete(node.id);
  for (const sub of vpnSubscriptionStore.listAll()) vpnSubscriptionStore.delete(sub.id);

  const { createApp } = await import('../src/app.js');
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  const uniq = `route${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Роут Тестов', email: `${uniq}@ex.com`, username: uniq, password: 'password123' }),
  });
  const setCookie = reg.headers.getSetCookie ? reg.headers.getSetCookie() : [reg.headers.get('set-cookie')];
  cookie = setCookie.filter(Boolean).map((c) => c.split(';')[0]).join('; ');

  routingProfileStore.delete(`local:${uniq}`);

  // активная hysteria2-нода, чтобы подписка что-то выдавала
  vpnNodeStore.create({
    name: 'TEST-NODE', host: 'node.example.com', port: 443, kind: 'hysteria2',
  });
  const created = vpnNodeStore.listAll().find((n) => n.name === 'TEST-NODE');
  vpnNodeStore.update(created.id, {
    status: 'active',
    deploymentStatus: 'active',
    hysteriaConfig: { password: 'srvpass', sni: 'www.bing.com', insecure: true },
  });

  const subRes = await fetch(`${base}/api/v1/vpn/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  const sub = await subRes.json();
  token = sub.token;
  assert.ok(token, JSON.stringify(sub));
});

after(() => server && server.close());

test('GET /vpn/routing: профиль по умолчанию + каталог пресетов', async () => {
  const res = await fetch(`${base}/api/v1/vpn/routing`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.profile.mode, 'global');
  assert.equal(data.profile.ruDirect, true);
  assert.ok(data.presets.some((p) => p.id === 'youtube' && p.label));
});

test('PUT /vpn/routing: сохранение и влияние на singbox-подписку', async () => {
  const put = await fetch(`${base}/api/v1/vpn/routing`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ mode: 'selective', presets: ['discord'], proxyDomains: ['Example.org'] }),
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.profile.mode, 'selective');
  assert.deepEqual(saved.profile.proxyDomains, ['example.org']);

  const cfgRes = await fetch(`${base}/api/v1/sub/${token}?format=singbox`);
  assert.equal(cfgRes.status, 200);
  assert.match(cfgRes.headers.get('content-type'), /application\/json/);
  const cfg = await cfgRes.json();
  assert.equal(cfg.route.final, 'direct');
  // пароль hysteria2-аутентификации = токен подписки
  const hy = cfg.outbounds.find((o) => o.type === 'hysteria2');
  assert.equal(hy.password, token);
  assert.ok(cfg.route.rules.some((r) => r.domain?.includes('discord.com') && r.outbound === 'proxy'));
});

test('PUT /vpn/routing: невалидный домен → 400', async () => {
  const put = await fetch(`${base}/api/v1/vpn/routing`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ mode: 'global', directDomains: ['???'] }),
  });
  assert.equal(put.status, 400);
  assert.equal((await put.json()).error, 'INVALID_DOMAIN');
});

test('GET /sub/:token?format=sub: заголовок custom-tunnel-config для Happ (полный конфиг с RU-direct)', async () => {
  const res = await fetch(`${base}/api/v1/sub/${token}?format=sub`);
  assert.equal(res.status, 200);
  const hdr = res.headers.get('custom-tunnel-config');
  assert.ok(hdr, 'заголовок custom-tunnel-config должен присутствовать');
  const cfg = JSON.parse(hdr); // одна строка, валидный JSON
  const hy = cfg.outbounds.find((o) => o.type === 'hysteria2');
  assert.ok(hy && hy.password === token, 'конфиг содержит hysteria2-аутбаунд с токеном');
  assert.ok(Array.isArray(cfg.route.rules) && cfg.dns.servers.length, 'полный конфиг с route+dns');
  assert.equal(res.headers.get('routing-enable'), '1');
});

test('GET /sub/:token?format=pac: отдаёт PAC', async () => {
  const res = await fetch(`${base}/api/v1/sub/${token}?format=pac&proxy=127.0.0.1:26001`);
  assert.equal(res.status, 200);
  const pac = await res.text();
  assert.match(pac, /FindProxyForURL/);
  assert.match(pac, /127\.0\.0\.1:26001/);
});

test('GET /sub/:token?format=singbox: чужой токен → 404', async () => {
  const res = await fetch(`${base}/api/v1/sub/nonexistent?format=singbox`);
  assert.equal(res.status, 404);
});

test('format=links включает vless://reality (второй вход)', async () => {
  const res = await fetch(`${base}/api/v1/sub/${token}?format=links`);
  const text = await res.text();
  assert.match(text, /vless:\/\/[0-9a-f-]{36}@test\.example\.com:443\?/);
  assert.match(text, /security=reality/);
  assert.match(text, /sni=www\.cloudflare\.com/);
  assert.match(text, /pbk=dfKqhzN/);
});

test('tokenToUuid детерминирован', async () => {
  const { tokenToUuid } = await import('../src/services/vlessConfig.js');
  assert.equal(tokenToUuid('abc'), tokenToUuid('abc'));
  assert.notEqual(tokenToUuid('abc'), tokenToUuid('abd'));
  assert.match(tokenToUuid(token), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('GET /xray/users: секрет обязателен, отдаёт активные UUID', async () => {
  const bad = await fetch(`${base}/xray/users`);
  assert.equal(bad.status, 403);
  const ok = await fetch(`${base}/xray/users?secret=test-sync-secret`);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.ok(Array.isArray(data.uuids) && data.uuids.length >= 1);
  assert.match(data.uuids[0], /^[0-9a-f-]{36}$/);
  // UUID активной подписки должен присутствовать
  const { tokenToUuid } = await import('../src/services/vlessConfig.js');
  assert.ok(data.uuids.includes(tokenToUuid(token)));
});

test('GET /sub/:token?format=enc: зашифрованный блоб, расшифровывается секретом', async () => {
  const { decryptSubscription } = await import('../src/services/subscriptionCrypto.js');
  const res = await fetch(`${base}/api/v1/sub/${token}?format=enc`);
  assert.equal(res.status, 200);
  const blob = await res.text();
  assert.match(blob, /^DOGMA1:/);
  // в блобе нет читаемого DNS
  assert.ok(!blob.includes('dns-query'));
  const json = JSON.parse(decryptSubscription(blob, token, process.env.SUBSCRIPTION_ENC_SECRET));
  assert.ok(json.dns && json.outbounds);
});

test('PATCH /vpn/subscriptions/:id: продление срока (extendDays)', async () => {
  const list = await (await adminGet('/vpn/subscriptions')).json();
  const sub = list.subscriptions.find((s) => s.token === token);
  const before = sub.expiresAt ? new Date(sub.expiresAt).getTime() : Date.now();
  const res = await fetch(`${base}/api/v1/vpn/subscriptions/${sub.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ extendDays: 10 }),
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.ok(new Date(updated.expiresAt).getTime() > before);
});

test('GET /vpn/users/:username/routing: профиль пользователя для админа', async () => {
  // username извлечём из подписки (userSub = local:<username>)
  const list = await (await adminGet('/vpn/subscriptions')).json();
  const sub = list.subscriptions.find((s) => s.token === token);
  const username = sub.userSub.replace(/^local:/, '');
  const res = await adminGet(`/vpn/users/${username}/routing`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.profile && typeof data.profile.mode === 'string');
});
