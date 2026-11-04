import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { makeT } from './i18n.js';
import {
  apiBase,
  getMe,
  loginUrl,
  logout,
  register,
  login,
  getAuthConfig,
  getMySubscription,
  createSubscription,
  revokeMySubscription,
  getMyChat,
  getMyChatUnread,
  sendMyChatMessage,
  getRouting,
  saveRouting,
  getAppDevices,
  revokeAppDevice,
  ApiError,
} from './api.js';
import QRCode from 'qrcode';
import DogmaLogo from './components/DogmaLogo.jsx';
import AppLoginModal from './components/AppLoginModal.jsx';

const STEP_INDEX = { form: 0, denied: 0, issuing: 1, pending: 1, routing: 2, ready: 3, error: 1 };

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  ));
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

export default function App() {
  const [lang, setLang] = useState('ru');
  const t = useMemo(() => makeT(lang), [lang]);

  const [auth, setAuth] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [loginView, setLoginView] = useState('login'); // login | register
  const [ssoAvailable, setSsoAvailable] = useState(false);

  // registration fields
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authErr, setAuthErr] = useState('');
  const regFullName = [lastName, firstName, middleName].map((s) => s.trim()).filter(Boolean).join(' ');

  // VPN subscription state
  const [phase, setPhase] = useState('form'); // form | issuing | pending | denied | routing | ready | error
  const [sub, setSub] = useState(null);
  const [format, setFormat] = useState('singbox'); // singbox | sub | link
  const [errorMsg, setErrorMsg] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const fullName = auth && auth !== false ? auth.name : '';
  const closeQrModal = useCallback(() => setQrOpen(false), []);

  // 401 — это «не авторизован». Любая другая ошибка (429, сеть) не должна
  // выглядеть как выход из аккаунта, поэтому показываем отдельное состояние.
  function loadMe() {
    setBootError(false);
    getMe()
      .then((u) => setAuth(u || false))
      .catch((err) => {
        setAuth(false);
        if (err instanceof ApiError && err.status === 401) return;
        setBootError(true);
      });
  }

  useEffect(() => {
    loadMe();
    getAuthConfig().then((c) => setSsoAvailable(!!c.sso)).catch(() => {});
  }, []);

  function authErrorText(err) {
    if (err instanceof ApiError) {
      if (err.body?.error === 'USERNAME_TAKEN') return t('errUsernameTaken');
      if (err.body?.error === 'EMAIL_TAKEN') return t('errEmailTaken');
      if (err.body?.error === 'INVALID_CREDENTIALS') return t('errInvalidCreds');
      if (err.body?.error === 'ACCOUNT_BLOCKED') return t('errBlocked');
    }
    return describeError(err, t);
  }

  useEffect(() => {
    if (!auth || auth === false) return;
    getMySubscription().then((s) => {
      if (s && s.status === 'pending') {
        setPhase('pending');
      } else if (s && s.status === 'denied') {
        setPhase('denied');
      } else if (s) {
        setSub(s);
        setPhase('ready');
      } else {
        setPhase('form');
      }
    }).catch(() => setPhase('form'));
  }, [auth]);

  async function onRegister() {
    setAuthErr('');
    try {
      const u = await register({
        fullName: regFullName,
        email: email.trim(),
        username: username.trim(),
        password,
      });
      setAuth(u);
    } catch (err) {
      setAuthErr(authErrorText(err));
    }
  }

  async function onLogin() {
    setAuthErr('');
    try {
      const u = await login({ username: loginUsername.trim(), password: loginPassword });
      setAuth(u);
    } catch (err) {
      setAuthErr(authErrorText(err));
    }
  }

  async function onCreateSubscription() {
    setErrorMsg('');
    setPhase('issuing');
    try {
      const s = await createSubscription({});
      if (s && (s.pending || s.status === 'pending')) {
        setPhase('pending');
        return;
      }
      setSub(s);
      // Сначала шаг «Маршрутизация» (настройки + выбор формата),
      // затем пользователь получает ссылку и QR на шаге «Готово».
      setPhase('routing');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setAuth(false); return; }
      setErrorMsg(describeError(err, t));
      setPhase('error');
    }
  }

  async function onRevoke() {
    try {
      await revokeMySubscription();
      setSub(null);
      setQrDataUrl('');
      setPhase('form');
    } catch (err) {
      setErrorMsg(describeError(err, t));
      setPhase('error');
    }
  }

  async function generateQR(url) {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch (e) {
      // ignore QR generation errors
    }
  }

  // Выбранный на шаге «Маршрутизация» формат подписки определяет,
  // какую ссылку/QR показываем на шаге «Готово».
  //  - singbox: «умная подписка» (sing-box конфиг с правилами + защита DNS);
  //  - sub:     base64-подписка со списком серверов (без правил);
  //  - link:    прямая hysteria2://-ссылка (без правил).
  const base64SubUrl = sub?.subscriptionUrl
    ? `${sub.subscriptionUrl}${sub.subscriptionUrl.includes('?') ? '&' : '?'}format=sub`
    : '';
  function urlForFormat(fmt) {
    if (!sub) return '';
    if (fmt === 'enc') return sub.secureSubscriptionUrl || sub.smartSubscriptionUrl || '';
    if (fmt === 'link') return sub.configLink || base64SubUrl;
    if (fmt === 'sub') return base64SubUrl || sub.configLink || '';
    return sub.smartSubscriptionUrl || sub.configLink || base64SubUrl;
  }
  const importUrl = urlForFormat(format);

  useEffect(() => {
    if (phase === 'ready' && importUrl) {
      generateQR(importUrl);
    }
  }, [phase, importUrl]);

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function onCopy(url) {
    // navigator.clipboard доступен только в secure context (https/localhost);
    // портал по http — используем fallback через execCommand.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function reset() {
    setPhase('form');
    setSub(null);
    setQrDataUrl('');
    setErrorMsg('');
  }

  async function refreshStatus() {
    try {
      const s = await getMySubscription();
      if (s && s.status === 'pending') setPhase('pending');
      else if (s && s.status === 'denied') setPhase('denied');
      else if (s) { setSub(s); setPhase('ready'); }
      else setPhase('form');
    } catch { /* ignore */ }
  }


  async function onLogout() {
    await logout();
    setAuth(false);
    setLoginView('login');
    setLastName(''); setFirstName(''); setMiddleName(''); setEmail('');
    setUsername(''); setPassword(''); setLoginUsername(''); setLoginPassword(''); setAuthErr('');
    reset();
  }

  // ── личный кабинет ─────────────────────────────────────────────────────────
  const [cabinetTab, setCabinetTab] = useState('overview');
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState('');
  const [routingProfile, setRoutingProfile] = useState(null);
  const [routingPresets, setRoutingPresets] = useState([]);
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [mobileSection, setMobileSection] = useState(null);

  useEffect(() => {
    if (!isMobile || !auth || auth === false || phase !== 'ready') setMobileSection(null);
  }, [isMobile, auth, phase]);

  function loadDevices() {
    setDevicesLoading(true);
    setDevicesError('');
    getAppDevices()
      .then(setDevices)
      .catch(() => setDevicesError(t('devicesLoadError')))
      .finally(() => setDevicesLoading(false));
  }

  useEffect(() => {
    if (!auth || auth === false || phase !== 'ready') return;
    loadDevices();
    getRouting().then((d) => {
      setRoutingProfile(d.profile);
      setRoutingPresets(d.presets || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, phase]);

  async function onRevokeDevice(id) {
    try {
      await revokeAppDevice(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setDevicesError(t('devicesRevokeError'));
    }
  }

  const step = STEP_INDEX[phase];
  const regValid = lastName.trim().length >= 2
    && firstName.trim().length >= 1
    && /^\S+@\S+\.\S+$/.test(email.trim())
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(username.trim())
    && password.length >= 8;
  const loginValid = loginUsername.trim().length >= 1 && loginPassword.length >= 1;

  return (
    <div className="page">
      <header className="topbar">
        {isMobile && auth && auth !== false && phase === 'ready' && mobileSection && (
          <button className="topbar-back" onClick={() => setMobileSection(null)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
            <span>{t('cabinetBack')}</span>
          </button>
        )}
        <div className="brand">
          <DogmaLogo />
          <span className="brand-tag">{t('brandTag')}</span>
        </div>
        <div className="topbar-right">
          <nav className="topbar-nav" aria-label={t('navLabel')}>
            {!(isMobile && mobileSection) && (
              <a className="topbar-link is-current" href="/" aria-current="page">{t('cabinetNav')}</a>
            )}
            <a className="topbar-link" href="/download">{t('downloadNav')}</a>
          </nav>
          {auth && auth !== false && (
            <button className="user-chip" onClick={onLogout} title={t('logout')}>
              <span className="user-name">{auth.name} · </span>{t('logout')}
            </button>
          )}
          <div className="lang" role="group" aria-label="Language">
            <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУ</button>
            <span className="lang-sep">/</span>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </header>

      <main className={`stage${auth && auth !== false && phase === 'ready' && sub ? ' stage-cabinet' : ''}`}>
        {auth === null && (
          <section className="panel"><div className="center"><div className="pulse" /><p className="lead" style={{ marginTop: 18 }}>{t('authLoading')}</p></div></section>
        )}

        {auth === false && bootError && (
          <section className="panel">
            <h1 className="title">{t('bootErrorTitle')}</h1>
            <p className="lead">{t('bootErrorLead')}</p>
            <button className="btn primary cta" onClick={loadMe}>{t('retry')}</button>
          </section>
        )}

        {auth === false && !bootError && (
          <div className="auth-split">
            <aside className="auth-side">
              <RouteDiagram t={t} />
              <h2 className="auth-side-title">{t('authSideTitle')}</h2>
              <p className="auth-side-lead">{t('authSideLead')}</p>
            </aside>

            <section className="panel auth-panel" key={loginView}>
              {loginView === 'login' ? (
                <>
                  <h1 className="title">{t('signInTitle')}</h1>
                  <p className="lead">{t('signInLead')}</p>
                  <div className="guest-form">
                    <label className="field">
                      <span className="field-label">{t('username')}</span>
                      <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder={t('usernamePh')} autoFocus />
                    </label>
                    <label className="field">
                      <span className="field-label">{t('password')}</span>
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && loginValid) onLogin(); }} />
                    </label>
                    {authErr && <p className="note err-text">{authErr}</p>}
                    <button className="btn primary" onClick={onLogin} disabled={!loginValid}>{t('signInBtn')}</button>
                    {ssoAvailable && (
                      <button className="btn ghost btn-block" onClick={() => { window.location.href = loginUrl(); }}>{t('ssoBtn')}</button>
                    )}
                    <button className="btn link" onClick={() => { setAuthErr(''); setLoginView('register'); }}>{t('toRegister')}</button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="title">{t('regTitle')}</h1>
                  <p className="lead">{t('regLead')}</p>
                  <div className="guest-form">
                    <label className="field">
                      <span className="field-label">{t('lastName')}</span>
                      <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('lastNamePh')} autoFocus />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">{t('firstName')}</span>
                        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('firstNamePh')} />
                      </label>
                      <label className="field">
                        <span className="field-label">{t('middleName')}</span>
                        <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder={t('middleNamePh')} />
                      </label>
                    </div>
                    <label className="field">
                      <span className="field-label">{t('email')}</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPh')} />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">{t('username')}</span>
                        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePh')} />
                      </label>
                      <label className="field">
                        <span className="field-label">{t('password')}</span>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('passwordPh')} />
                      </label>
                    </div>
                    {authErr && <p className="note err-text">{authErr}</p>}
                    <button className="btn primary" onClick={onRegister} disabled={!regValid}>{t('registerBtn')}</button>
                    {ssoAvailable && (
                      <button className="btn ghost btn-block" onClick={() => { window.location.href = loginUrl(); }}>{t('ssoBtn')}</button>
                    )}
                    <button className="btn link" onClick={() => { setAuthErr(''); setLoginView('login'); }}>{t('toSignIn')}</button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {auth && auth !== false && phase === 'ready' && sub && (
          <Cabinet
            t={t}
            auth={auth}
            sub={sub}
            format={format}
            onFormat={setFormat}
            importUrl={importUrl}
            qrDataUrl={qrDataUrl}
            copied={copied}
            onCopy={onCopy}
            onRevoke={onRevoke}
            onOpenQr={() => setQrOpen(true)}
            tab={cabinetTab}
            onTab={setCabinetTab}
            devices={devices}
            devicesLoading={devicesLoading}
            devicesError={devicesError}
            onReloadDevices={loadDevices}
            onRevokeDevice={onRevokeDevice}
            routingProfile={routingProfile}
            routingPresets={routingPresets}
            onRoutingSaved={setRoutingProfile}
            lang={lang}
            isMobile={isMobile}
            mobileSection={mobileSection}
            onMobileSection={(section) => {
              setCabinetTab(section);
              setMobileSection(section);
            }}
          />
        )}

        {auth && auth !== false && phase !== 'ready' && (
          <div className="client">
            <ol className="rail" aria-label="progress">
              {t('steps').map((label, i) => (
                <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
                  <span className="rail-num" aria-hidden="true" />
                  <span className="rail-label">{label}</span>
                </li>
              ))}
            </ol>

            <section className="panel" key={phase}>
              {phase === 'form' && (
                <div>
                  <h1 className="title">{t('vpnFormTitle')}</h1>
                  <p className="lead">{t('formLead')}</p>
                  <p className="issued-to">
                    {t('vpnForName')} <strong>{fullName}</strong>
                  </p>
                  {auth.kind === 'employee' && <p className="note" style={{ marginTop: 0 }}>{t('corpNote')}</p>}
                  <button className="btn primary cta" onClick={onCreateSubscription}>{t('getVpn')}</button>
                </div>
              )}

              {phase === 'issuing' && (
                <div>
                  <h1 className="title" style={{ textAlign: 'center' }}>{t('issuingTitle')}</h1>
                  <ul className="checklist">
                    <li><span className="chk-label">{t('progAuth')}</span><Badge state="ok">{t('badgeOk')}</Badge></li>
                    <li><span className="chk-label">{t('progRequest')}</span><Badge state="ok">{t('badgeOk')}</Badge></li>
                    <li><span className="chk-label">{t('progIssue')}</span><Badge state="pending">{t('badgePending')}</Badge></li>
                  </ul>
                </div>
              )}

              {phase === 'pending' && (
                <div className="center">
                  <div className="seal sm" aria-hidden="true" style={{ margin: '0 auto 8px' }}>
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                  <h1 className="title">{t('pendingTitle')}</h1>
                  <p className="lead">{t('pendingLead')}</p>
                  <button className="btn primary" onClick={refreshStatus}>{t('pendingRefresh')}</button>
                </div>
              )}

              {phase === 'denied' && (
                <div className="center">
                  <div className="seal err" aria-hidden="true">!</div>
                  <h1 className="title">{t('deniedTitle')}</h1>
                  <p className="lead">{t('deniedLead')}</p>
                  <button className="btn primary" onClick={onCreateSubscription}>{t('newRequest')}</button>
                </div>
              )}

              {phase === 'routing' && sub && (
                <div>
                  <h1 className="title">{t('routingStepTitle')}</h1>
                  <p className="lead">{t('routingStepLead')}</p>

                  <h2 className="subhead" style={{ marginTop: 24 }}>{t('fmtTitle')}</h2>
                  <div className="fmt-list" role="radiogroup">
                    {[...(sub.secureSubscriptionUrl ? ['enc'] : []), 'singbox', 'sub', 'link'].map((f) => (
                      <label key={f} className={`fmt-opt${format === f ? ' on' : ''}`}>
                        <input type="radio" name="sub-format" checked={format === f} onChange={() => setFormat(f)} />
                        <span className="fmt-opt-title">{t(`fmt_${f}`)}</span>
                        <span className="fmt-opt-hint">{t(`fmt_${f}_hint`)}</span>
                      </label>
                    ))}
                  </div>

                  <RoutingPanel
                    t={t}
                    disabled={format !== 'singbox' && format !== 'enc'}
                    primaryLabel={t('routingContinue')}
                    onSaved={() => setPhase('ready')}
                  />
                </div>
              )}

              {phase === 'error' && (
                <div className="center">
                  <div className="seal err" aria-hidden="true">!</div>
                  <h1 className="title">{t('errorTitle')}</h1>
                  {errorMsg && <p className="lead err-text">{errorMsg}</p>}
                  <button className="btn primary" onClick={reset}>{t('retry')}</button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {auth && auth !== false && <ChatWidget t={t} />}
      {qrOpen && auth && auth !== false && (
        <AppLoginModal t={t} onClose={closeQrModal} />
      )}
    </div>
  );
}

function describeError(err, t) {
  if (err instanceof ApiError) {
    if (err.body?.details?.length) return err.body.details[0].message;
    return err.message;
  }
  return t('networkError') + apiBase;
}

// RU → EU: единственный «богатый» элемент на экране входа. Не декор,
// а схема того, как устроен доступ: клиент → релей → выход.
function RouteDiagram({ t }) {
  return (
    <figure className="route-card">
      <div className="route-head">
        <span className="route-title">{t('routeTitle')}</span>
        <span className="route-path">RU → EU</span>
      </div>
      <svg className="route-diagram" viewBox="0 0 320 56" aria-hidden="true">
        <line x1="16" y1="20" x2="160" y2="20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="160" y1="20" x2="304" y2="20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx="16" cy="20" r="4" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="160" cy="20" r="4" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="304" cy="20" r="8" fill="none" stroke="var(--gold)" strokeOpacity="0.3" strokeWidth="1" />
        <circle cx="304" cy="20" r="4" fill="var(--gold)" />
        <text x="16" y="44" textAnchor="middle" className="route-label">RU</text>
        <text x="160" y="44" textAnchor="middle" className="route-label">RELAY</text>
        <text x="304" y="44" textAnchor="middle" className="route-label">EU</text>
      </svg>
      <figcaption className="route-note">{t('routeNote')}</figcaption>
    </figure>
  );
}

function Badge({ state, big, children }) {
  return <span className={`badge ${state}${big ? ' big' : ''}`}>{children}</span>;
}

// Панель маршрутизации (split tunneling): что идёт через VPN, что напрямую.
// Настройки сохраняются на сервере и встраиваются в «умную подписку».
// disabled — выбран формат без правил (маршрутизация не применится);
// onSaved — вызвать после успешного сохранения (переход к шагу «Готово»);
// primaryLabel — надпись на основной кнопке.
// ── Полноценный личный кабинет ───────────────────────────────────────────────

const CABINET_TABS = [
  ['overview', 'cabinetOverview', 'grid'],
  ['subscription', 'cabinetSubscription', 'key'],
  ['routing', 'cabinetRouting', 'route'],
  ['devices', 'cabinetDevices', 'devices'],
  ['instructions', 'cabinetInstructions', 'book'],
];

const CABINET_ICONS = {
  grid: (
    <>
      <rect x="3" y="3" width="6.5" height="6.5" rx="1" />
      <rect x="12.5" y="3" width="6.5" height="6.5" rx="1" />
      <rect x="3" y="12.5" width="6.5" height="6.5" rx="1" />
      <rect x="12.5" y="12.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="14" r="3.5" />
      <path d="m10 11.5 7-7M14.5 7l2.5 2.5" />
    </>
  ),
  route: (
    <>
      <circle cx="5" cy="5.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
      <path d="M7 5.5h5a3 3 0 0 1 0 6h-1a3 3 0 0 0 0 6h4" />
    </>
  ),
  devices: (
    <>
      <rect x="3" y="4" width="11" height="8" rx="1.5" />
      <rect x="15" y="8" width="5" height="10" rx="1.5" />
      <path d="M6 15.5h5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4z" />
      <path d="M20 4.5h-4a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20z" />
    </>
  ),
};

function CabinetIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CABINET_ICONS[name]}
    </svg>
  );
}

function formatDay(value, lang) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatTraffic(used, limit, t) {
  if (!limit) return t('cabinetNoLimit');
  const u = Number(used || 0);
  return `${u.toFixed(1)} / ${limit} GB`;
}

function Cabinet({
  t, auth, sub, format, onFormat, importUrl, qrDataUrl, copied, onCopy,
  onRevoke, onOpenQr, tab, onTab,
  devices, devicesLoading, devicesError, onReloadDevices, onRevokeDevice,
  routingProfile, routingPresets, onRoutingSaved, lang,
  isMobile, mobileSection, onMobileSection,
}) {
  const initial = (auth.name || auth.email || '?').trim().charAt(0).toUpperCase();
  const expires = formatDay(sub.expiresAt, lang);
  const presetLabels = (routingProfile?.presets || [])
    .map((id) => routingPresets.find((p) => p.id === id)?.label)
    .filter(Boolean);
  const currentTitle = {
    overview: t('cabinetOverviewTitle'),
    subscription: t('cabinetSubscriptionTitle'),
    routing: t('routingTitle'),
    devices: t('cabinetDevicesTitle'),
    instructions: t('instructionsTitle'),
  }[tab];

  if (isMobile && !mobileSection) {
    const hints = {
      overview: t('mhomeOverviewHint'),
      subscription: t('mhomeSubscriptionHint'),
      routing: t('mhomeRoutingHint'),
      devices: t('mhomeDevicesHint'),
      instructions: t('mhomeInstructionsHint'),
    };
    return (
      <div className="cabinet cabinet-mobile-home">
        <div className="mhome">
          <div className="mhome-user">
            <span className="cabinet-avatar">{initial}</span>
            <div className="mhome-user-copy">
              <div className="mhome-name">{auth.name || auth.email}</div>
              {auth.name && auth.email && <div className="mhome-mail">{auth.email}</div>}
            </div>
          </div>

          <div className="mhome-status">
            <span className="cabinet-side-label">{t('cabinetSubscription')}</span>
            <span className="cabinet-status"><span className="status-dot" />{t('subActive')}</span>
            <span className="cabinet-side-meta">
              {expires ? `${t('cabinetUntil')} ${expires}` : t('cabinetNoExpiry')}
            </span>
          </div>

          <nav className="mhome-list" aria-label={t('cabinetTitle')}>
            {CABINET_TABS.map(([id, label, icon]) => (
              <button key={id} className="mhome-item" onClick={() => onMobileSection(id)}>
                <span className="mhome-icon"><CabinetIcon name={icon} /></span>
                <span className="mhome-copy">
                  <span className="mhome-title">{t(label)}</span>
                  <span className="mhome-hint">{hints[id]}</span>
                </span>
                {id === 'devices' && devices.length > 0 && (
                  <span className="mhome-badge">{devices.length}</span>
                )}
                <span className="mhome-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    );
  }

  return (
    <div className={`cabinet${isMobile ? ' cabinet-mobile-section' : ''}`}>
      <aside className="cabinet-side">
        <div className="cabinet-user">
          <span className="cabinet-avatar">{initial}</span>
          <div>
            <div className="cabinet-user-name">{auth.name || auth.email}</div>
            {auth.name && auth.email && <div className="cabinet-user-mail">{auth.email}</div>}
          </div>
        </div>

        <nav className="cabinet-nav" aria-label={t('cabinetTitle')}>
          {CABINET_TABS.map(([id, label, icon]) => (
            <button
              key={id}
              className={`cabinet-nav-item${tab === id ? ' on' : ''}`}
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <CabinetIcon name={icon} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>

        <div className="cabinet-side-status">
          <span className="cabinet-side-label">{t('cabinetSubscription')}</span>
          <span className="cabinet-status"><span className="status-dot" />{t('subActive')}</span>
          <span className="cabinet-side-meta">
            {expires ? `${t('cabinetUntil')} ${expires}` : t('cabinetNoExpiry')}
          </span>
        </div>

      </aside>

      <div className="cabinet-main">
        <header className="cabinet-head">
          <div>
            <span className="eyebrow">{t('cabinetTitle')}</span>
            <h1 className="cabinet-title">{currentTitle}</h1>
          </div>
          <span className="status"><span className="status-dot" />{t('subActive')}</span>
        </header>

        {tab === 'overview' && (
          <div className="cabinet-grid">
            <section className="cabinet-hero">
              <div className="cabinet-hero-top">
                <div>
                  <span className="cabinet-kicker">{t('cabinetSubscription')}</span>
                  <div className="cabinet-hero-status">{t('subActive')}</div>
                </div>
              </div>

              <dl className="cabinet-stats">
                <div>
                  <dt>{t('cabinetUntil')}</dt>
                  <dd>{expires || t('cabinetNoExpiry')}</dd>
                </div>
                <div>
                  <dt>{t('cabinetTraffic')}</dt>
                  <dd>{formatTraffic(sub.trafficUsedGb, sub.trafficLimitGb, t)}</dd>
                </div>
                <div>
                  <dt>{t('cabinetServers')}</dt>
                  <dd>{sub.activeNodeCount ?? '—'}</dd>
                </div>
              </dl>

              <div className="keybox cabinet-keybox">
                <span className="field-label">{t('cabinetKey')}</span>
                <div className="key-row">
                  <code className="key">{importUrl}</code>
                  <button className="btn ghost" onClick={() => onCopy(importUrl)}>
                    {copied ? t('copied') : t('copy')}
                  </button>
                </div>
              </div>

              <div className="cabinet-hero-foot">
                <button className="btn primary" onClick={() => onTab('subscription')}>{t('cabinetOpenSub')}</button>
              </div>
            </section>

            <div className="cabinet-side-col">
              <section className="cabinet-card">
                <span className="cabinet-kicker">{t('appCardKicker')}</span>
                <h2 className="cabinet-card-title">{t('appCardTitle')}</h2>
                <p className="cabinet-card-lead">{t('appCardLead')}</p>
                <div className="cabinet-card-actions">
                  <a className="btn ghost" href="/download">{t('downloadNav')}</a>
                  <button className="btn primary" onClick={onOpenQr}>{t('appQrOpen')}</button>
                </div>
              </section>

              <section className="cabinet-card">
                <span className="cabinet-kicker">{t('routingTitle')}</span>
                <h2 className="cabinet-card-title">
                  {routingProfile?.mode === 'selective' ? t('routingModeSelective') : t('routingModeGlobal')}
                </h2>
                <p className="cabinet-card-lead">
                  {routingProfile?.mode === 'selective'
                    ? (presetLabels.length ? presetLabels.slice(0, 4).join(' · ') : t('cabinetRoutingNone'))
                    : t('routingModeGlobalHint')}
                </p>
                <div className="cabinet-card-actions">
                  <button className="btn ghost" onClick={() => onTab('routing')}>{t('cabinetEdit')}</button>
                </div>
              </section>
            </div>

            <section className="cabinet-card cabinet-wide">
              <details className="instructions cabinet-instructions">
                <summary>
                  <span className="instructions-title">{t('instructionsTitle')}</span>
                  <span className="instructions-hint">{t('instructionsHint')}</span>
                </summary>
                <ol className="steps">
                  {t('vpnSteps').map((stepText, i) => (
                    <li key={i}><span className="step-n">{i + 1}</span><span>{stepText}</span></li>
                  ))}
                </ol>
              </details>
            </section>
          </div>
        )}

        {tab === 'subscription' && (
          <div className="cabinet-grid">
            <section className="cabinet-hero">
              <span className="cabinet-kicker">{t('cabinetFormat')}</span>
              <div className="fmt-list cabinet-formats" role="radiogroup">
                {[...(sub.secureSubscriptionUrl ? ['enc'] : []), 'singbox', 'sub', 'link'].map((f) => (
                  <label key={f} className={`fmt-opt${format === f ? ' on' : ''}`}>
                    <input type="radio" name="cabinet-format" checked={format === f} onChange={() => onFormat(f)} />
                    <span className="fmt-opt-title">{t(`fmt_${f}`)}</span>
                    <span className="fmt-opt-hint">{t(`fmt_${f}_hint`)}</span>
                  </label>
                ))}
              </div>

              <div className="keybox cabinet-keybox">
                <span className="field-label">{t('cabinetKey')}</span>
                <div className="key-row">
                  <code className="key">{importUrl}</code>
                  <button className="btn ghost" onClick={() => onCopy(importUrl)}>
                    {copied ? t('copied') : t('copy')}
                  </button>
                </div>
                <p className="note">{t('cabinetLinkHint')}</p>
              </div>

              <div className="center" style={{ marginTop: 20 }}>
                <button className="btn ghost" onClick={onRevoke}>{t('revokeVpn')}</button>
              </div>
            </section>

            <section className="cabinet-card cabinet-qr-card">
              <span className="cabinet-kicker">{t('qrHint')}</span>
              {qrDataUrl
                ? <img className="cabinet-qr" src={qrDataUrl} alt={t('qrHint')} />
                : <div className="cabinet-qr-placeholder" />}
            </section>
          </div>
        )}

        {tab === 'routing' && (
          <section className="cabinet-card cabinet-wide">
            <RoutingPanel
              t={t}
              primaryLabel={t('routingSave')}
              onSaved={onRoutingSaved}
              showHeading={false}
            />
          </section>
        )}

        {tab === 'devices' && (
          <section className="cabinet-card cabinet-wide">
            <div className="cabinet-section-head">
              <div>
                <h2 className="cabinet-card-title">{t('cabinetDevicesListTitle')}</h2>
                <p className="cabinet-card-lead">{t('cabinetDevicesLead')}</p>
              </div>
              <button className="btn ghost" onClick={onReloadDevices}>{t('cabinetRefresh')}</button>
            </div>

            {devicesError && <p className="note err-text">{devicesError}</p>}
            {devicesLoading && <p className="note">{t('authLoading')}</p>}

            {!devicesLoading && !devicesError && devices.length === 0 && (
              <div className="cabinet-empty">
                <p className="cabinet-card-title">{t('cabinetDevicesEmpty')}</p>
                <p className="cabinet-card-lead">{t('cabinetDevicesEmptyLead')}</p>
                <button className="btn primary" onClick={onOpenQr}>{t('appQrOpen')}</button>
              </div>
            )}

            {devices.length > 0 && (
              <ul className="device-list">
                {devices.map((device) => (
                  <li key={device.id} className="device-row">
                    <span className="device-mark" aria-hidden="true">
                      {String(device.platform || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="device-info">
                      <span className="device-name">
                        {device.deviceName || device.platform || t('cabinetDeviceAdded')}
                      </span>
                      <span className="device-meta">
                        {[
                          device.platform,
                          device.appVersion && `v${device.appVersion}`,
                          device.lastUsedAt && `${t('cabinetDeviceLastUsed')} ${formatDay(device.lastUsedAt, lang)}`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button className="btn link device-revoke" onClick={() => onRevokeDevice(device.id)}>
                      {t('cabinetRevokeDevice')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'instructions' && (
          <section className="cabinet-card cabinet-wide">
            <p className="cabinet-card-lead">{t('cabinetInstructionLead')}</p>
            <ol className="steps">
              {t('vpnSteps').map((stepText, i) => (
                <li key={i}><span className="step-n">{i + 1}</span><span>{stepText}</span></li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

function RoutingPanel({ t, disabled = false, primaryLabel, onSaved, showHeading = true }) {
  const [presets, setPresets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState('global');
  const [ruDirect, setRuDirect] = useState(true);
  const [selected, setSelected] = useState([]);
  const [proxyDomains, setProxyDomains] = useState('');
  const [directDomains, setDirectDomains] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getRouting().then((d) => {
      setPresets(d.presets || []);
      setMode(d.profile.mode || 'global');
      setRuDirect(d.profile.ruDirect !== false);
      setSelected(d.profile.presets || []);
      setProxyDomains((d.profile.proxyDomains || []).join('\n'));
      setDirectDomains((d.profile.directDomains || []).join('\n'));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const parseDomains = (text) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

  function togglePreset(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function onSave() {
    // Формат без правил маршрутизации — просто идём дальше, не сохраняя профиль.
    if (disabled) { onSaved?.(); return; }
    setSaving(true);
    setErr('');
    setSaved(false);
    try {
      const { profile } = await saveRouting({
        mode,
        ruDirect,
        presets: selected,
        proxyDomains: parseDomains(proxyDomains),
        directDomains: parseDomains(directDomains),
      });
      // Показ нормализованных значений (punycode, без дублей).
      setProxyDomains((profile.proxyDomains || []).join('\n'));
      setDirectDomains((profile.directDomains || []).join('\n'));
      onSaved?.(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 6000);
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === 'INVALID_DOMAIN') {
        setErr(t('routingInvalidDomain') + (e.body.details || ''));
      } else {
        setErr(t('routingError') + (e.message || ''));
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="routing">
      {showHeading && (
        <>
          <h2 className="subhead">{t('routingTitle')}</h2>
          <p className="note" style={{ marginTop: 0 }}>{t('routingLead')}</p>
        </>
      )}

      {disabled && <p className="note routing-na">{t('routingNotApplied')}</p>}

      <fieldset className={`routing-fields${disabled ? ' dim' : ''}`} disabled={disabled}>
      <div className="routing-modes" role="radiogroup">
        <label className={`routing-mode${mode === 'global' ? ' on' : ''}`}>
          <input type="radio" name="routing-mode" checked={mode === 'global'} onChange={() => setMode('global')} />
          <span className="routing-mode-title">{t('routingModeGlobal')}</span>
          <span className="routing-mode-hint">{t('routingModeGlobalHint')}</span>
        </label>
        <label className={`routing-mode${mode === 'selective' ? ' on' : ''}`}>
          <input type="radio" name="routing-mode" checked={mode === 'selective'} onChange={() => setMode('selective')} />
          <span className="routing-mode-title">{t('routingModeSelective')}</span>
          <span className="routing-mode-hint">{t('routingModeSelectiveHint')}</span>
        </label>
      </div>

      {mode === 'global' && (
        <>
          <label className="routing-check">
            <input type="checkbox" checked={ruDirect} onChange={(e) => setRuDirect(e.target.checked)} />
            <span>{t('routingRuDirect')}</span>
          </label>
          <label className="field" style={{ marginTop: 10 }}>
            <span className="field-label">{t('routingDirectDomains')}</span>
            <textarea
              rows={3}
              value={directDomains}
              onChange={(e) => setDirectDomains(e.target.value)}
              placeholder={t('routingDomainsPh')}
            />
          </label>
        </>
      )}

      {mode === 'selective' && (
        <>
          <span className="field-label" style={{ display: 'block', marginTop: 12 }}>{t('routingPresetsLabel')}</span>
          <div className="chips">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip${selected.includes(p.id) ? ' on' : ''}`}
                onClick={() => togglePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            <span className="field-label">{t('routingProxyDomains')}</span>
            <textarea
              rows={3}
              value={proxyDomains}
              onChange={(e) => setProxyDomains(e.target.value)}
              placeholder={t('routingDomainsPh')}
            />
          </label>
        </>
      )}

      <p className="note dns-note">{t('routingDnsNote')}</p>
      <p className="note dns-note">{t('routingLocalNote')}</p>
      </fieldset>

      {err && <p className="note err-text">{err}</p>}
      {saved && <p className="note saved-text">{t('routingSaved')}</p>}
      <button className="btn primary" onClick={onSave} disabled={saving}>
        {saving ? t('routingSaving') : (primaryLabel || t('routingSave'))}
      </button>
    </div>
  );
}

// Плавающий чат с поддержкой (всегда в углу, пока пользователь авторизован).
function ChatWidget({ t }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const bodyRef = useRef(null);

  async function loadUnread() {
    setUnread(await getMyChatUnread());
  }
  async function loadMessages() {
    try {
      const { messages: m } = await getMyChat();
      setMessages(m || []);
      setUnread(0);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (open) loadMessages(); else loadUnread();
    const iv = setInterval(() => { if (open) loadMessages(); else loadUnread(); }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  async function onSend() {
    const val = text.trim();
    if (!val) return;
    setText('');
    try {
      const msg = await sendMyChatMessage(val);
      setMessages((prev) => [...prev, msg]);
    } catch { /* ignore */ }
  }

  return (
    <div className="chat-fab-wrap">
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <span>{t('chatTitle')}</span>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="close">×</button>
          </div>
          <div className="chat-body" ref={bodyRef}>
            {messages.length === 0 && <p className="chat-empty">{t('chatEmpty')}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.sender === 'user' ? 'me' : 'them'}`}>
                <div className="chat-bubble">{m.text}</div>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
              placeholder={t('chatPh')}
            />
            <button className="btn primary" onClick={onSend} disabled={!text.trim()}>{t('chatSend')}</button>
          </div>
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} title={t('chatTitle')}>
        {open ? (
          <span className="chat-fab-x">×</span>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        )}
        {!open && unread > 0 && <span className="chat-fab-badge">{unread}</span>}
      </button>
    </div>
  );
}
