import dotenv from 'dotenv';

dotenv.config();

function bool(value, def = false) {
  if (value === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*',
  requireApproval: bool(process.env.REQUIRE_APPROVAL, false),
  downloadTokenTtlSeconds: parseInt(process.env.DOWNLOAD_TOKEN_TTL_SECONDS || '900', 10),
  cert: {
    // mock | registration-key | p12
    mode: process.env.CERT_ISSUANCE_MODE || 'mock',
  },
  checkpoint: {
    host: process.env.CP_MGMT_HOST || '',
    port: parseInt(process.env.CP_MGMT_PORT || '443', 10),
    user: process.env.CP_MGMT_USER || '',
    password: process.env.CP_MGMT_PASSWORD || '',
    apiKey: process.env.CP_MGMT_API_KEY || '',
    tlsVerify: bool(process.env.CP_MGMT_TLS_VERIFY, true),
    domain: process.env.CP_MGMT_DOMAIN || '',
    // internal (local DB users) | ldap (use ICA management tool instead)
    userManagement: process.env.CP_USER_MANAGEMENT || 'internal',
    regKeyExpirationDays: parseInt(process.env.CP_REGKEY_EXPIRATION_DAYS || '14', 10),
    certValidityDays: process.env.CP_CERT_VALIDITY_DAYS
      ? parseInt(process.env.CP_CERT_VALIDITY_DAYS, 10)
      : null,
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'DOGMA <no-reply@dogma.local>',
  },
  admin: {
    token: process.env.ADMIN_API_TOKEN || '',
  },
  vault: {
    key: process.env.ADMIN_VAULT_KEY || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  session: {
    secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
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
  },
  intermediate: {
    host: process.env.RU_INTERMEDIATE_HOST || '',
    sshPort: parseInt(process.env.RU_INTERMEDIATE_SSH_PORT || '22', 10),
    sshUser: process.env.RU_INTERMEDIATE_SSH_USER || 'root',
    sshKeyPath: process.env.RU_INTERMEDIATE_SSH_KEY_PATH || '',
    sshKeyBase64: process.env.RU_INTERMEDIATE_SSH_KEY_BASE64 || '',
  },
  deployment: {
    hysteriaDockerImage: process.env.HYSTERIA_DOCKER_IMAGE || 'tobyxdd/hysteria-server:v2',
    wgTunnelNetwork: process.env.WG_TUNNEL_NETWORK || '10.200.200.0/24',
    wgListenPort: parseInt(process.env.WG_LISTEN_PORT || '51820', 10),
  },
};

export default config;
