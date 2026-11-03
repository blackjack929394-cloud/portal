import dotenv from 'dotenv';

dotenv.config();

// Целое из env с проверкой: кривое значение не должно ронять интервал в 0.
function intFromEnv(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  // Интерфейс прослушивания. За reverse-proxy (Caddy) ставим 127.0.0.1,
  // чтобы порт не был доступен из интернета напрямую.
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*',
  admin: {
    token: process.env.ADMIN_API_TOKEN || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Публичный базовый URL бэкенда для ссылок-подписок (без trailing slash).
  // Нужен, когда клиент (Hiddify) забирает подписку не с localhost, а по внешнему адресу.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  session: {
    secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  },
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.DATABASE_SSL === 'true',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  auth: {
    mode: process.env.AUTH_MODE || 'dev', // dev | oidc
    oidc: {
      issuer: process.env.OIDC_ISSUER || '',
      clientId: process.env.OIDC_CLIENT_ID || '',
      clientSecret: process.env.OIDC_CLIENT_SECRET || '',
      redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:8080/auth/callback',
    },
  },
  vpn: {
    defaultTtlDays: parseInt(process.env.VPN_DEFAULT_TTL_DAYS || '30', 10),
    defaultTrafficLimitGb: process.env.VPN_DEFAULT_TRAFFIC_LIMIT_GB
      ? parseInt(process.env.VPN_DEFAULT_TRAFFIC_LIMIT_GB, 10)
      : null,
    // Секрет для зашифрованного формата подписки (format=enc). Тот же секрет
    // зашит в десктоп-клиент Dogma. Пусто → формат недоступен (501).
    subscriptionEncSecret: process.env.SUBSCRIPTION_ENC_SECRET || '',
    // Фоновое обслуживание подписок: через сколько дней после истечения срока
    // удалять запись совсем, и как часто запускать задачу (мс).
    expiredRetentionDays: intFromEnv('VPN_EXPIRED_RETENTION_DAYS', 30, { min: 0 }),
    maintenanceIntervalMs: intFromEnv('VPN_MAINTENANCE_INTERVAL_MS', 60 * 60 * 1000, { min: 60000 }),
  },
  // VLESS + Reality: второй вход (TCP 443) для клиентов на ядре Xray (Happ).
  // Параметры Reality (публичные) — из env; приватный ключ живёт только на ноде.
  // Пусто (нет publicKey) → vless-ссылка не выдаётся.
  vless: {
    enabled: !!process.env.VLESS_PUBLIC_KEY,
    host: process.env.VLESS_HOST || '',
    port: parseInt(process.env.VLESS_PORT || '443', 10),
    publicKey: process.env.VLESS_PUBLIC_KEY || '',
    shortId: process.env.VLESS_SHORT_ID || '',
    serverName: process.env.VLESS_SNI || 'www.cloudflare.com',
    fingerprint: process.env.VLESS_FP || 'chrome',
    flow: process.env.VLESS_FLOW || 'xtls-rprx-vision',
    // Секрет для эндпоинта синка UUID (нода тянет список активных клиентов).
    syncSecret: process.env.XRAY_SYNC_SECRET || '',
  },
  intermediate: {
    host: process.env.RU_INTERMEDIATE_HOST || '',
    sshPort: parseInt(process.env.RU_INTERMEDIATE_SSH_PORT || '22', 10),
    sshUser: process.env.RU_INTERMEDIATE_SSH_USER || 'root',
    sshKeyPath: process.env.RU_INTERMEDIATE_SSH_KEY_PATH || '',
    sshKeyBase64: process.env.RU_INTERMEDIATE_SSH_KEY_BASE64 || '',
  },
  deployment: {
    hysteriaDockerImage: process.env.HYSTERIA_DOCKER_IMAGE || 'tobyxdd/hysteria:v2',
    wgTunnelNetwork: process.env.WG_TUNNEL_NETWORK || '10.200.200.0/24',
    wgListenPort: parseInt(process.env.WG_LISTEN_PORT || '51820', 10),
  },
};

export default config;