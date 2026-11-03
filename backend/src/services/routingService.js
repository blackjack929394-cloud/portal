import { routingProfileStore } from '../models/RoutingProfile.js';

// Гибкая маршрутизация (split tunneling) для подписки.
//
// Режимы:
//  - global    — весь трафик через VPN; локальная сеть, исключения и (опц.)
//                российские ресурсы идут напрямую;
//  - selective — напрямую всё, через VPN только выбранные пресеты и домены.
//
// Профиль пользователя компилируется в:
//  - полный sing-box конфиг (format=singbox) — Hiddify/sing-box: правила
//    маршрутизации + DNS через туннель (без утечки DNS провайдеру);
//  - PAC-файл (format=pac) — для десктоп-клиента с системным прокси.

// ── Каталог пресетов ─────────────────────────────────────────────────────────
// domains — суффиксы (без ведущей точки), ips — CIDR для сервисов,
// работающих по IP в обход DNS (Telegram).
export const PRESETS = [
  { id: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com'] },
  { id: 'google', label: 'Google', domains: ['google.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', 'gmail.com', 'goo.gl', 'g.co'] },
  { id: 'instagram', label: 'Instagram', domains: ['instagram.com', 'cdninstagram.com', 'ig.me'] },
  { id: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.com', 'fbcdn.net', 'messenger.com'] },
  { id: 'twitter', label: 'X (Twitter)', domains: ['twitter.com', 'x.com', 'twimg.com', 't.co'] },
  { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com', 'ibytedtos.com'] },
  {
    id: 'telegram',
    label: 'Telegram',
    domains: ['telegram.org', 'telegram.me', 't.me', 'telegra.ph', 'tdesktop.com', 'telesco.pe'],
    ips: ['91.108.4.0/22', '91.108.8.0/21', '91.108.16.0/21', '91.108.56.0/22', '149.154.160.0/20', '185.76.151.0/24'],
  },
  { id: 'discord', label: 'Discord', domains: ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net', 'discord.media', 'discordsays.com'] },
  { id: 'openai', label: 'ChatGPT / OpenAI', domains: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com'] },
  { id: 'anthropic', label: 'Claude / Anthropic', domains: ['anthropic.com', 'claude.ai', 'claude.com', 'anthropic.io'] },
  { id: 'github', label: 'GitHub', domains: ['github.com', 'githubusercontent.com', 'githubassets.com', 'ghcr.io', 'github.io'] },
  { id: 'netflix', label: 'Netflix', domains: ['netflix.com', 'nflxvideo.net', 'nflximg.net', 'nflxso.net', 'nflxext.com'] },
  { id: 'spotify', label: 'Spotify', domains: ['spotify.com', 'scdn.co', 'spotifycdn.com', 'pscdn.co'] },
  { id: 'twitch', label: 'Twitch', domains: ['twitch.tv', 'ttvnw.net', 'jtvnw.net', 'twitchcdn.net'] },
  { id: 'linkedin', label: 'LinkedIn', domains: ['linkedin.com', 'licdn.com'] },
  { id: 'notion', label: 'Notion', domains: ['notion.so', 'notion.site', 'notion.com'] },
];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export const MODES = ['global', 'selective'];
const MAX_DOMAINS = 100;

// Суффиксы «российских» зон для режима «RU напрямую» (xn--p1ai = .рф).
const RU_DOMAIN_SUFFIXES = ['.ru', '.su', '.xn--p1ai'];
// Крупные российские сервисы, у которых часть доменов НЕ в .ru-зоне.
// При включённом «RU напрямую» их тоже гоним напрямую, иначе сессия рвётся
// между российским и заграничным IP и антифрод (Яндекс, VK) блокирует вход.
export const RU_DIRECT_DOMAINS = [
  // Яндекс
  'yandex.net', 'yandex.com', 'yastatic.net', 'yandexcloud.net', 'yandex.st', 'ya.cc',
  // VK / Mail.ru Group
  'vk.com', 'vk.me', 'vk-cdn.net', 'vkuser.net', 'vkuservideo.net', 'userapi.com', 'mycdn.me', 'my.com',
  // Прочее (Тинькофф/Т-Банк, Госуслуги CDN, Сбер)
  'tinkoff.ru', 'tbank.ru', 'cdn-tinkoff.ru', 'gosuslugi.ru', 'sber.ru', 'sberbank.ru',
];
// Локальные/служебные зоны — всегда напрямую.
const LOCAL_DOMAIN_SUFFIXES = ['.local', '.lan', '.internal', '.home.arpa'];

// Базовый список подсетей локальной сети, которые ВСЕГДА идут напрямую
// (роутер, принтеры, NAS, шлюз, соседние устройства) — в обоих режимах.
// Обращения к таким IP не должны заворачиваться в VPN, иначе локальные
// ресурсы становятся недоступны.
export const LOCAL_IP_CIDRS = [
  '10.0.0.0/8',        // частная сеть (RFC1918)
  '172.16.0.0/12',     // частная сеть (RFC1918)
  '192.168.0.0/16',    // частная сеть (RFC1918)
  '127.0.0.0/8',       // loopback
  '169.254.0.0/16',    // link-local (APIPA)
  '100.64.0.0/10',     // CGNAT (RFC6598) — часто у провайдеров/корп. сетей
  'fc00::/7',          // IPv6 ULA (локальные)
  'fe80::/10',         // IPv6 link-local
  '::1/128',           // IPv6 loopback
];

// IPv4-подсети из списка в форме { ip, mask } для PAC (isInNet работает по IPv4).
function localIPv4Subnets() {
  return LOCAL_IP_CIDRS
    .filter((c) => c.includes('.'))
    .map((c) => {
      const [ip, bitsStr] = c.split('/');
      const bits = parseInt(bitsStr, 10);
      const maskNum = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      const mask = [24, 16, 8, 0].map((s) => (maskNum >>> s) & 0xff).join('.');
      return { ip, mask };
    });
}

export function defaultProfile() {
  return {
    mode: 'global',
    ruDirect: true,
    presets: [],
    proxyDomains: [],
    directDomains: [],
  };
}

// ── Валидация ────────────────────────────────────────────────────────────────

// Нормализует пользовательский ввод домена: убирает схему/путь/порт,
// приводит IDN (кириллицу) к punycode. Возвращает null, если это не домен.
export function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  s = s.split(/[/?#]/)[0]; // path
  s = s.replace(/:\d+$/, ''); // port
  s = s.replace(/^\*\.?/, ''); // wildcard prefix
  s = s.replace(/^\.+/, '').replace(/\.+$/, '');
  if (!s || s.length > 253) return null;
  // URL приводит IDN к punycode и валидирует hostname.
  let host;
  try {
    host = new URL(`http://${s}`).hostname;
  } catch {
    return null;
  }
  if (host !== s && !/^[a-z0-9.-]+$/.test(s)) {
    // ввод был IDN — берём punycode-форму
    s = host;
  }
  if (host !== s) return null; // URL «починил» ввод (порт, user@ и т.п.) — считаем невалидным
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  return s;
}

// Проверяет и нормализует профиль из тела запроса.
// Возвращает { profile } либо { error, details }.
export function validateProfileInput(body) {
  const b = body || {};
  const mode = MODES.includes(b.mode) ? b.mode : null;
  if (!mode) return { error: 'INVALID_MODE', details: `mode must be one of: ${MODES.join(', ')}` };

  const ruDirect = b.ruDirect === undefined ? true : !!b.ruDirect;

  const presets = [];
  if (b.presets !== undefined) {
    if (!Array.isArray(b.presets)) return { error: 'INVALID_PRESETS', details: 'presets must be an array of preset ids' };
    for (const id of b.presets) {
      if (!PRESET_BY_ID.has(id)) return { error: 'UNKNOWN_PRESET', details: String(id) };
      if (!presets.includes(id)) presets.push(id);
    }
  }

  const lists = {};
  for (const key of ['proxyDomains', 'directDomains']) {
    const raw = b[key] === undefined ? [] : b[key];
    if (!Array.isArray(raw)) return { error: 'INVALID_DOMAIN_LIST', details: `${key} must be an array` };
    if (raw.length > MAX_DOMAINS) return { error: 'TOO_MANY_DOMAINS', details: `${key}: max ${MAX_DOMAINS}` };
    const out = [];
    for (const item of raw) {
      const d = normalizeDomain(item);
      if (!d) return { error: 'INVALID_DOMAIN', details: String(item).slice(0, 120) };
      if (!out.includes(d)) out.push(d);
    }
    lists[key] = out;
  }

  return { profile: { mode, ruDirect, presets, proxyDomains: lists.proxyDomains, directDomains: lists.directDomains } };
}

// ── Доступ к профилю ─────────────────────────────────────────────────────────

export async function getProfile(userSub) {
  return (await routingProfileStore.get(userSub)) || { userSub, ...defaultProfile() };
}

export async function saveProfile(userSub, input) {
  const res = validateProfileInput(input);
  if (res.error) return res;
  return { profile: await routingProfileStore.upsert(userSub, res.profile) };
}

// ── Компиляция профиля в правила ─────────────────────────────────────────────

// Домены/CIDR, идущие через VPN в режиме selective (пресеты + свои).
function selectiveTargets(profile) {
  const domains = [];
  const ips = [];
  for (const id of profile.presets || []) {
    const p = PRESET_BY_ID.get(id);
    if (!p) continue;
    domains.push(...p.domains);
    if (p.ips) ips.push(...p.ips);
  }
  for (const d of profile.proxyDomains || []) {
    if (!domains.includes(d)) domains.push(d);
  }
  return { domains: [...new Set(domains)], ips: [...new Set(ips)] };
}

const asSuffixes = (domains) => domains.map((d) => `.${d}`);
// domain_suffix ".x.com" не матчит сам x.com — добавляем и точную форму.
const domainRule = (domains) => ({ domain: domains, domain_suffix: asSuffixes(domains) });

// Полный sing-box конфиг: outbounds по активным нодам + маршрутизация + DNS.
// serverHosts — адреса самих VPN-серверов (их резолвим напрямую, иначе петля).
export function buildSingboxConfig({ profile, outbounds, serverHosts }) {
  const p = { ...defaultProfile(), ...(profile || {}) };
  const nodeTags = outbounds.map((o) => o.tag);
  const multi = nodeTags.length > 1;

  const allOutbounds = [
    ...(multi ? [{ type: 'urltest', tag: 'auto', outbounds: nodeTags, url: 'https://www.gstatic.com/generate_204', interval: '3m' }] : []),
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: multi ? ['auto', ...nodeTags] : nodeTags,
      default: multi ? 'auto' : nodeTags[0],
    },
    ...outbounds,
    { type: 'direct', tag: 'direct' },
  ];

  // DNS: удалённый резолвер ходит DoH через туннель — провайдер не видит
  // запросов (нет утечки DNS). Прямые домены резолвим локальным DNS.
  const dnsRules = [
    { domain: serverHosts, server: 'dns-direct' },
    { domain_suffix: LOCAL_DOMAIN_SUFFIXES, server: 'dns-direct' },
  ];
  const routeRules = [
    // Определяем протокол (для перехвата DNS) и перехватываем DNS-запросы.
    { action: 'sniff' },
    { protocol: 'dns', action: 'hijack-dns' },
    // Трафик самого прямого DNS-резолвера (77.88.8.8) — всегда напрямую,
    // иначе он ушёл бы в туннель (final=proxy) и RU-домены резолвились бы из-за границы.
    { ip_cidr: ['77.88.8.8/32'], outbound: 'direct' },
    // Локальная сеть всегда напрямую: и по флагу приватных диапазонов,
    // и явным списком CIDR (базовые исключения).
    { ip_is_private: true, outbound: 'direct' },
    { ip_cidr: LOCAL_IP_CIDRS, outbound: 'direct' },
    { domain_suffix: LOCAL_DOMAIN_SUFFIXES, outbound: 'direct' },
  ];

  if (p.mode === 'selective') {
    const { domains, ips } = selectiveTargets(p);
    if (domains.length) {
      dnsRules.push({ ...domainRule(domains), server: 'dns-remote' });
      routeRules.push({ ...domainRule(domains), outbound: 'proxy' });
    }
    if (ips.length) {
      routeRules.push({ ip_cidr: ips, outbound: 'proxy' });
    }
  } else {
    // global: исключения → напрямую
    if (p.ruDirect) {
      dnsRules.push({ domain_suffix: RU_DOMAIN_SUFFIXES, server: 'dns-direct' });
      dnsRules.push({ ...domainRule(RU_DIRECT_DOMAINS), server: 'dns-direct' });
      routeRules.push({ domain_suffix: RU_DOMAIN_SUFFIXES, outbound: 'direct' });
      routeRules.push({ ...domainRule(RU_DIRECT_DOMAINS), outbound: 'direct' });
    }
    if (p.directDomains.length) {
      dnsRules.push({ ...domainRule(p.directDomains), server: 'dns-direct' });
      routeRules.push({ ...domainRule(p.directDomains), outbound: 'direct' });
    }
  }

  return {
    log: { level: 'warn' },
    // Формат sing-box 1.12+ (Hiddify/актуальные ядра). Старый формат DNS
    // (address-строки) ядро 1.12+ отвергает с FATAL и соединение не поднимается.
    dns: {
      // Две зоны резолвинга:
      //  - dns-remote (трафик через VPN): DoH на 1.1.1.1 ВНУТРИ туннеля
      //    (detour proxy). Запросы видит только выходная нода, провайдер — нет.
      //  - dns-direct (RU/локальные домены, идущие напрямую): обычный Яндекс-DNS
      //    77.88.8.8. ТСПУ РКН душит зарубежные DoH на прямом канале, а простой
      //    Яндекс-DNS в РФ работает всегда. Эти домены и так идут напрямую.
      // dns-remote — detour через туннель; dns-direct — без detour (в 1.12 detour
      // на пустой direct-outbound = FATAL). Прямой выход резолвера обеспечивает
      // route-правило ниже (ip_cidr 77.88.8.8 → direct).
      servers: [
        { type: 'https', tag: 'dns-remote', server: '1.1.1.1', detour: 'proxy' },
        { type: 'udp', tag: 'dns-direct', server: '77.88.8.8' },
      ],
      rules: dnsRules,
      final: p.mode === 'selective' ? 'dns-direct' : 'dns-remote',
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        address: ['172.19.0.1/30'],
        mtu: 9000,
        auto_route: true,
        strict_route: false,
        stack: 'mixed',
      },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
    ],
    outbounds: allOutbounds,
    route: {
      rules: routeRules,
      final: p.mode === 'selective' ? 'direct' : 'proxy',
      auto_detect_interface: true,
      // 1.12+: резолвер для доменов в dial-полях (адреса серверов и т.п.).
      default_domain_resolver: { server: 'dns-direct' },
    },
  };
}

// Полный sing-box конфиг в формате, совместимом со старыми ядрами (Happ).
// Отличается от buildSingboxConfig:
//   - DNS-серверы заданы строками address + detour (не объектами type/server).
//   - route.rules используют outbound, а не action: sniff/hijack-dns.
//   - Есть outbound dns-out.
//   - tun inbound использует inet4_address и sniff.
export function buildHappConfig({ profile, outbounds, serverHosts }) {
  const p = { ...defaultProfile(), ...(profile || {}) };
  const nodeTags = outbounds.map((o) => o.tag);
  const multi = nodeTags.length > 1;

  const allOutbounds = [
    ...(multi ? [{ type: 'urltest', tag: 'auto', outbounds: nodeTags, url: 'https://www.gstatic.com/generate_204', interval: '3m' }] : []),
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: multi ? ['auto', ...nodeTags] : nodeTags,
      default: multi ? 'auto' : nodeTags[0],
    },
    ...outbounds,
    { type: 'direct', tag: 'direct' },
    { type: 'dns', tag: 'dns-out' },
  ];

  const dnsRules = [
    { domain: serverHosts, server: 'dns-direct' },
    { domain_suffix: LOCAL_DOMAIN_SUFFIXES, server: 'dns-direct' },
  ];
  const routeRules = [
    { protocol: 'dns', outbound: 'dns-out' },
    { ip_is_private: true, outbound: 'direct' },
    { ip_cidr: LOCAL_IP_CIDRS, outbound: 'direct' },
    { domain_suffix: LOCAL_DOMAIN_SUFFIXES, outbound: 'direct' },
  ];

  if (p.mode === 'selective') {
    const { domains, ips } = selectiveTargets(p);
    if (domains.length) {
      dnsRules.push({ ...domainRule(domains), server: 'dns-remote' });
      routeRules.push({ ...domainRule(domains), outbound: 'proxy' });
    }
    if (ips.length) {
      routeRules.push({ ip_cidr: ips, outbound: 'proxy' });
    }
  } else {
    if (p.ruDirect) {
      dnsRules.push({ domain_suffix: RU_DOMAIN_SUFFIXES, server: 'dns-direct' });
      dnsRules.push({ ...domainRule(RU_DIRECT_DOMAINS), server: 'dns-direct' });
      routeRules.push({ domain_suffix: RU_DOMAIN_SUFFIXES, outbound: 'direct' });
      routeRules.push({ ...domainRule(RU_DIRECT_DOMAINS), outbound: 'direct' });
    }
    if (p.directDomains.length) {
      dnsRules.push({ ...domainRule(p.directDomains), server: 'dns-direct' });
      routeRules.push({ ...domainRule(p.directDomains), outbound: 'direct' });
    }
  }

  return {
    log: { level: 'warn' },
    dns: {
      servers: [
        { tag: 'dns-remote', address: 'https://1.1.1.1/dns-query', strategy: 'prefer_ipv4', detour: 'proxy' },
        { tag: 'dns-direct', address: '77.88.8.8', strategy: 'prefer_ipv4', detour: 'direct' },
      ],
      rules: dnsRules,
      final: p.mode === 'selective' ? 'dns-direct' : 'dns-remote',
      independent_cache: true,
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        inet4_address: '172.19.0.1/30',
        mtu: 9000,
        auto_route: true,
        strict_route: false,
        stack: 'mixed',
        sniff: true,
      },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080, sniff: true },
    ],
    outbounds: allOutbounds,
    route: {
      rules: routeRules,
      final: p.mode === 'selective' ? 'direct' : 'proxy',
      auto_detect_interface: true,
    },
  };
}

// PAC-файл для клиентов с системным прокси (десктоп-клиент Dogma VPN).
// proxyAddr — host:port локального HTTP-прокси клиента.
export function buildPac({ profile, proxyAddr = '127.0.0.1:2080', serverHosts = [] }) {
  const p = { ...defaultProfile(), ...(profile || {}) };
  const PROXY = `PROXY ${proxyAddr}`;

  const cond = (domains) => domains
    .map((d) => `dnsDomainIs(host, ".${d}") || host === "${d}"`)
    .join(' || ');

  // Литеральные IP локальной сети — всегда напрямую. isInNet резолвит имена
  // через DNS, поэтому вызываем его только для IPv4-литералов (guard-регексом).
  const localIpCond = localIPv4Subnets()
    .map((s) => `isInNet(host, "${s.ip}", "${s.mask}")`)
    .join(' || ');

  const lines = [];
  lines.push('function FindProxyForURL(url, host) {');
  lines.push('  host = host.toLowerCase();');
  lines.push('  if (isPlainHostName(host)) return "DIRECT";');
  // Базовые исключения локальной сети (роутер, принтеры, NAS и т.п.).
  lines.push(`  if (/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(host) && (${localIpCond})) return "DIRECT";`);
  lines.push(`  if (${cond(LOCAL_DOMAIN_SUFFIXES.map((s) => s.slice(1)))}) return "DIRECT";`);
  if (serverHosts.length) {
    lines.push(`  if (${serverHosts.map((h) => `host === "${h}"`).join(' || ')}) return "DIRECT";`);
  }
  if (p.mode === 'selective') {
    const { domains } = selectiveTargets(p);
    if (domains.length) {
      lines.push(`  if (${cond(domains)}) return "${PROXY}";`);
    }
    lines.push('  return "DIRECT";');
  } else {
    if (p.ruDirect) {
      lines.push(`  if (${cond(RU_DOMAIN_SUFFIXES.map((s) => s.slice(1)))}) return "DIRECT";`);
      lines.push(`  if (${cond(RU_DIRECT_DOMAINS)}) return "DIRECT";`);
    }
    if (p.directDomains.length) {
      lines.push(`  if (${cond(p.directDomains)}) return "DIRECT";`);
    }
    lines.push(`  return "${PROXY}";`);
  }
  lines.push('}');
  return lines.join('\n');
}
