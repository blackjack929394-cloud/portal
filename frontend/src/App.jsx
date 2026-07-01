import { useEffect, useState } from 'react';
import { makeT } from './i18n.js';
import {
  apiBase,
  getMe,
  loginUrl,
  logout,
  guestRegister,
  getMySubscription,
  createSubscription,
  revokeMySubscription,
  ApiError,
} from './api.js';
import QRCode from 'qrcode';

const STEP_INDEX = { form: 0, issuing: 1, ready: 2, error: 1 };

export default function App() {
  const [lang, setLang] = useState('ru');
  const t = makeT(lang);

  const [auth, setAuth] = useState(null);
  const [loginView, setLoginView] = useState('choice');

  // guest fields
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [guestErr, setGuestErr] = useState('');
  const guestFullName = [lastName, firstName, middleName].map((s) => s.trim()).filter(Boolean).join(' ');

  // VPN subscription state
  const [phase, setPhase] = useState('form'); // form | issuing | ready | error
  const [sub, setSub] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const fullName = auth && auth !== false ? auth.name : '';

  useEffect(() => {
    getMe().then((u) => setAuth(u || false)).catch(() => setAuth(false));
  }, []);

  useEffect(() => {
    if (!auth || auth === false) return;
    getMySubscription().then((s) => {
      if (s) {
        setSub(s);
        setPhase('ready');
      } else {
        setPhase('form');
      }
    }).catch(() => setPhase('form'));
  }, [auth]);

  async function onGuestRegister() {
    setGuestErr('');
    try {
      const u = await guestRegister({ fullName: guestFullName, email: email.trim() });
      setAuth(u);
    } catch (err) {
      setGuestErr(describeError(err, t));
    }
  }

  async function onCreateSubscription() {
    setErrorMsg('');
    setPhase('issuing');
    try {
      const s = await createSubscription({});
      setSub(s);
      setPhase('ready');
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

  useEffect(() => {
    if (phase === 'ready' && sub?.subscriptionUrl) {
      generateQR(sub.subscriptionUrl);
    }
  }, [phase, sub]);

  function onCopy(url) {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function reset() {
    setPhase('form');
    setSub(null);
    setQrDataUrl('');
    setErrorMsg('');
  }

  async function onLogout() {
    await logout();
    setAuth(false);
    setLoginView('choice');
    setLastName(''); setFirstName(''); setMiddleName(''); setEmail('');
    reset();
  }

  const step = STEP_INDEX[phase];
  const guestValid = lastName.trim().length >= 2 && firstName.trim().length >= 1 && /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="page">
      <div className="aura" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DOGMA</span>
          <span className="brand-tag">{t('brandTag')}</span>
        </div>
        <div className="topbar-right">
          {auth && auth !== false && (
            <button className="user-chip" onClick={onLogout} title={t('logout')}>
              {auth.name} · {t('logout')}
            </button>
          )}
          <div className="lang" role="group" aria-label="Language">
            <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУ</button>
            <span className="lang-sep">/</span>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </header>

      <main className="stage">
        {auth === null && (
          <section className="panel"><div className="center"><div className="pulse" /><p className="lead" style={{ marginTop: 18 }}>{t('authLoading')}</p></div></section>
        )}

        {auth === false && loginView === 'choice' && (
          <section className="panel">
            <h1 className="title" style={{ textAlign: 'center' }}>{t('loginTitle')}</h1>
            <p className="lead" style={{ textAlign: 'center' }}>{t('loginLead')}</p>

            <button className="btn primary" onClick={() => setLoginView('guest')}>
              {t('guestBtn')}
            </button>
            <button className="btn ghost btn-block" onClick={() => { window.location.href = loginUrl(); }}>
              {t('loginBtn')}
            </button>
          </section>
        )}

        {auth === false && loginView === 'guest' && (
          <section className="panel">
            <h1 className="title" style={{ textAlign: 'center' }}>{t('guestTitle')}</h1>
            <p className="lead">{t('guestLead')}</p>
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
              {guestErr && <p className="note err-text">{guestErr}</p>}
              <button className="btn primary" onClick={onGuestRegister} disabled={!guestValid}>
                {t('guestSubmit')}
              </button>
              <button className="btn link" onClick={() => { setGuestErr(''); setLoginView('choice'); }}>
                {t('back')}
              </button>
            </div>
          </section>
        )}

        {auth && auth !== false && (
          <>
            <ol className="rail" aria-label="progress">
              {t('steps').map((label, i) => (
                <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
                  <span className="rail-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rail-label">{label}</span>
                </li>
              ))}
            </ol>

            <section className="panel" key={phase}>
              {phase === 'form' && (
                <div className="center">
                  <h1 className="title">{t('vpnFormTitle')}</h1>
                  <p className="issued-to">
                    {t('vpnForName')} <strong>{fullName}</strong>
                  </p>
                  {auth.kind === 'employee' && <p className="note" style={{ marginTop: 0, marginBottom: 18 }}>{t('corpNote')}</p>}
                  <button className="btn primary" onClick={onCreateSubscription}>{t('getVpn')}</button>
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

              {phase === 'ready' && sub && (
                <div>
                  <div className="report-head">
                    <div className="seal sm" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="22" height="22">
                        <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor"
                          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <h1 className="title" style={{ margin: 0 }}>{t('readyTitle')}</h1>
                      <p className="issued-to" style={{ margin: '4px 0 0' }}>
                        {t('readyForName')} <strong>{fullName}</strong>
                      </p>
                    </div>
                    <Badge state="ok" big>{t('badgeOk')}</Badge>
                  </div>

                  <div className="keybox">
                    <span className="field-label">{t('subUrlLabel')}</span>
                    <div className="key-row">
                      <code className="key">{sub.subscriptionUrl}</code>
                      <button className="btn ghost" onClick={() => onCopy(sub.subscriptionUrl)}>
                        {copied ? t('copied') : t('copy')}
                      </button>
                    </div>
                  </div>

                  {qrDataUrl && (
                    <div className="center" style={{ marginTop: 16 }}>
                      <img src={qrDataUrl} alt="QR Code" style={{ borderRadius: 12, border: '1px solid #e6e8ec' }} />
                      <p className="note">{t('qrHint')}</p>
                    </div>
                  )}

                  <h2 className="subhead">{t('nextSteps')}</h2>
                  <ol className="steps">
                    {t('vpnSteps').map((stepText, i) => (
                      <li key={i}><span className="step-n">{i + 1}</span><span>{stepText}</span></li>
                    ))}
                  </ol>

                  <div className="center" style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn ghost" onClick={onRevoke}>{t('revokeVpn')}</button>
                    <button className="btn link" onClick={reset}>{t('again')}</button>
                  </div>
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
          </>
        )}
      </main>
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

function Badge({ state, big, children }) {
  return <span className={`badge ${state}${big ? ' big' : ''}`}>{children}</span>;
}
