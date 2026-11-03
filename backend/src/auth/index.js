import session from 'express-session';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from '../services/auditService.js';
import { registerSchema, loginSchema } from '../validators/authValidators.js';
import { createUser, authenticateUser, upsertEmployee, getEmployeeBySub, isBlocked } from '../store/userDirectory.js';
import { createSessionStore } from '../store/sessionStore.js';

// OIDC-клиент создаётся лениво (динамический импорт), чтобы dev-режим не требовал
// доступного провайдера на старте.
let oidcClient = null;
let generators = null;

async function getOidcClient() {
  if (oidcClient) return oidcClient;
  const mod = await import('openid-client');
  const { Issuer } = mod;
  generators = mod.generators;
  const issuer = await Issuer.discover(config.auth.oidc.issuer);
  oidcClient = new issuer.Client({
    client_id: config.auth.oidc.clientId,
    client_secret: config.auth.oidc.clientSecret,
    redirect_uris: [config.auth.oidc.redirectUri],
    response_types: ['code'],
  });
  return oidcClient;
}

export function mountAuth(app) {
  app.use(
    session({
      name: 'dogma.sid',
      store: createSessionStore(session),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.env === 'production',
        maxAge: 8 * 60 * 60 * 1000, // 8 часов
      },
    }),
  );

  // Кто я сейчас (фронт спрашивает при загрузке)
  app.get('/auth/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const { name, email, kind } = req.session.user;
    return res.json({ name, email, kind });
  });

  // Доступные способы входа (фронт решает, показывать ли кнопку SSO).
  app.get('/auth/config', (req, res) => {
    res.json({ sso: config.auth.mode === 'oidc' });
  });

  // Регистрация аккаунта: ФИО, почта, логин, пароль.
  app.post('/auth/register', async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const { fullName, email, username, password } = parsed.data;
    try {
      await createUser({ username, email, fullName, password });
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN') return res.status(409).json({ error: 'USERNAME_TAKEN' });
      if (err.code === 'EMAIL_TAKEN') return res.status(409).json({ error: 'EMAIL_TAKEN' });
      return next(err);
    }
    req.session.user = { sub: `local:${username}`, name: fullName, email, kind: 'user' };
    audit('auth.register', { username, email });
    return res.status(201).json({ name: fullName, email, kind: 'user' });
  });

  // Вход по логину и паролю.
  app.post('/auth/login', async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR' });
    }
    const { username, password } = parsed.data;
    const user = await authenticateUser(username, password);
    if (!user) {
      audit('auth.login_failed', { username });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (user.blocked) {
      audit('auth.login_blocked', { username });
      return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
    }
    req.session.user = { sub: `local:${user.username}`, name: user.fullName, email: user.email, kind: 'user' };
    audit('auth.login', { mode: 'local', username });
    return res.json({ name: user.fullName, email: user.email, kind: 'user' });
  });

  app.post('/auth/logout', (req, res) => {
    const sub = req.session.user?.sub;
    req.session.destroy(() => {
      audit('auth.logout', { sub });
      res.json({ ok: true });
    });
  });

  // SSO (OIDC) — опциональный альтернативный вход, если настроен провайдер.
  if (config.auth.mode === 'oidc') mountOidc(app);
}

// ── OIDC-режим: реальный провайдер (Authorization Code + PKCE) ───────────────
function mountOidc(app) {
  app.get('/auth/login', async (req, res, next) => {
    try {
      const client = await getOidcClient();
      const state = generators.state();
      const codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      req.session.oidc = { state, codeVerifier };
      const url = client.authorizationUrl({
        scope: 'openid profile email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  });

  app.get('/auth/callback', async (req, res, next) => {
    try {
      const client = await getOidcClient();
      const params = client.callbackParams(req);
      const saved = req.session.oidc || {};
      const tokenSet = await client.callback(config.auth.oidc.redirectUri, params, {
        state: saved.state,
        code_verifier: saved.codeVerifier,
      });
      const claims = tokenSet.claims();
      const name =
        claims.name ||
        [claims.family_name, claims.given_name].filter(Boolean).join(' ') ||
        claims.preferred_username ||
        claims.email;
      await upsertEmployee({ sub: claims.sub, fullName: name, email: claims.email });
      const emp = await getEmployeeBySub(claims.sub);
      if (emp && emp.blocked) {
        audit('auth.login_blocked', { mode: 'oidc', sub: claims.sub });
        return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
      }
      req.session.user = { sub: claims.sub, name, email: claims.email, kind: 'employee' };
      delete req.session.oidc;
      audit('auth.login', { mode: 'oidc', sub: claims.sub });
      res.redirect(`${config.frontendUrl}/`);
    } catch (err) {
      next(err);
    }
  });
}

// Middleware: пускает только аутентифицированных и не заблокированных.
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const { sub, kind } = req.session.user;
  isBlocked(sub, kind)
    .then((blocked) => {
      if (blocked) {
        req.session.destroy(() => {});
        return res.status(403).json({ error: 'ACCOUNT_BLOCKED' });
      }
      next();
    })
    .catch(next);
}
