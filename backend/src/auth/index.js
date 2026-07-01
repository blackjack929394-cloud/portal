import session from 'express-session';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from '../services/auditService.js';
import { upsertEmployee, registerGuest } from '../store/userDirectory.js';
import { guestRegisterSchema } from '../validators/certificateRequest.js';

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

  // Гостевая регистрация (без SSO): сохраняем в guests, дедуп по почте.
  app.post('/auth/guest', (req, res) => {
    const parsed = guestRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const { fullName, email } = parsed.data;
    const g = registerGuest({ fullName, email });
    req.session.user = { sub: `guest:${email}`, name: fullName, email, kind: 'guest' };
    audit('auth.guest_register', { email, isNew: g.isNew });
    return res.json({ name: fullName, email, kind: 'guest' });
  });

  app.post('/auth/logout', (req, res) => {
    const sub = req.session.user?.sub;
    req.session.destroy(() => {
      audit('auth.logout', { sub });
      res.json({ ok: true });
    });
  });

  if (config.auth.mode === 'oidc') mountOidc(app);
  else mountDev(app);
}

// ── DEV-режим: вход имитируется (только не в production) ─────────────────────
function mountDev(app) {
  if (config.env === 'production') {
    throw new Error('AUTH_MODE=dev is not allowed in production.');
  }
  logger.warn('AUTH_MODE=dev — вход имитируется, реального провайдера нет.');
  app.get('/auth/login', (req, res) => {
    const name = req.query.name || 'Иван Разработчиков';
    const email = req.query.email || 'dev@dogma.local';
    const sub = `dev:${email}`;
    upsertEmployee({ sub, fullName: name, email });
    req.session.user = { sub, name, email, kind: 'employee' };
    audit('auth.login', { mode: 'dev', email });
    res.redirect(`${config.frontendUrl}/`);
  });
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
      req.session.user = { sub: claims.sub, name, email: claims.email, kind: 'employee' };
      upsertEmployee({ sub: claims.sub, fullName: name, email: claims.email });
      delete req.session.oidc;
      audit('auth.login', { mode: 'oidc', sub: claims.sub });
      res.redirect(`${config.frontendUrl}/`);
    } catch (err) {
      next(err);
    }
  });
}

// Middleware: пускает только аутентифицированных.
export function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'UNAUTHENTICATED' });
}
