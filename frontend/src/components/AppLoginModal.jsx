import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  startQrLogin,
  getQrLogin,
  confirmQrLogin,
  cancelQrLogin,
  ApiError,
} from '../api.js';

const ACTIVE = new Set(['pending', 'scanned', 'confirmed']);

function platformLabel(platform) {
  if (!platform) return '';
  const map = { android: 'Android', windows: 'Windows', ios: 'iOS', macos: 'macOS', linux: 'Linux' };
  return map[String(platform).toLowerCase()] || platform;
}

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Модальное окно «Вход в приложении по QR».
// Сайт создаёт одноразовый код, приложение сканирует его и ждёт подтверждения.
// Пользователь видит устройство и подтверждает вход — только после этого
// приложение получает Bearer-токен.
export default function AppLoginModal({ t, onClose }) {
  const [qr, setQr] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  // Номер запуска: StrictMode монтирует эффект дважды, а «Обновить» может
  // нажать раньше ответа. Устаревший ответ отбрасываем и гасим его QR-сессию.
  const runId = useRef(0);

  const status = qr?.status || 'loading';

  const start = useCallback(async () => {
    const current = ++runId.current;
    setError('');
    setQr(null);
    setQrDataUrl('');
    try {
      const session = await startQrLogin();
      if (!alive.current || runId.current !== current) {
        cancelQrLogin(session.id).catch(() => {});
        return;
      }
      setQr({ ...session, status: 'pending' });
    } catch (err) {
      if (!alive.current || runId.current !== current) return;
      if (err instanceof ApiError && err.status === 401) {
        onClose();
        return;
      }
      setError(t('appQrError'));
      setQr({ status: 'error' });
    }
  }, [onClose, t]);

  useEffect(() => {
    alive.current = true;
    start();
    return () => {
      alive.current = false;
      runId.current += 1;
    };
  }, [start]);

  // QR-картинка.
  useEffect(() => {
    if (!qr?.qrPayload) return;
    let cancelled = false;
    QRCode.toDataURL(qr.qrPayload, {
      width: 240,
      margin: 1,
      color: { dark: '#131210', light: '#ffffff' },
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { /* QR не критичен — ниже есть код для ручного ввода */ });
    return () => { cancelled = true; };
  }, [qr?.qrPayload]);

  // Опрос статуса, пока сессия активна.
  useEffect(() => {
    if (!qr?.id || !ACTIVE.has(status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await getQrLogin(qr.id);
        if (alive.current) setQr((prev) => ({ ...prev, ...next }));
      } catch (err) {
        if (!alive.current) return;
        if (err instanceof ApiError && [404, 410].includes(err.status)) {
          setQr((prev) => ({ ...prev, status: 'expired' }));
        } else if (err instanceof ApiError && [401, 403].includes(err.status)) {
          setQr((prev) => ({ ...prev, status: 'error' }));
        }
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [qr?.id, status]);

  // Обратный отсчёт.
  useEffect(() => {
    if (!qr?.expiresAt) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setQr((prev) => (prev && ACTIVE.has(prev.status) ? { ...prev, status: 'expired' } : prev));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [qr?.expiresAt]);

  const close = useCallback(() => {
    if (qr?.id && ACTIVE.has(qr.status)) {
      cancelQrLogin(qr.id).catch(() => {});
    }
    onClose();
  }, [qr?.id, qr?.status, onClose]);

  // Новый QR: старую сессию закрываем, чтобы она не висела до истечения.
  function refresh() {
    if (qr?.id && ACTIVE.has(qr.status)) {
      cancelQrLogin(qr.id).catch(() => {});
    }
    start();
  }

  // Esc закрывает окно, фон не прокручивается.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  function copyCode() {
    if (!qr?.code) return;
    const done = () => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(qr.code).then(done).catch(done);
      return;
    }
    try {
      const field = document.createElement('textarea');
      field.value = qr.code;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    } catch {
      // если браузер запретил копирование, код всё равно виден на экране
    }
    done();
  }

  async function onConfirm() {
    if (!qr?.id) return;
    setBusy(true);
    setError('');
    try {
      const next = await confirmQrLogin(qr.id);
      if (alive.current) setQr((prev) => ({ ...prev, ...next }));
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.body?.error === 'EXPIRED') {
        setQr((prev) => ({ ...prev, status: 'expired' }));
      } else {
        setError(t('appQrConfirmError'));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const device = [qr?.deviceName, platformLabel(qr?.platform)].filter(Boolean).join(' · ');

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="app-qr-title">
        <button className="modal-x" onClick={close} aria-label={t('close')}>×</button>
        <h2 className="modal-title" id="app-qr-title">{t('appQrTitle')}</h2>
        <p className="lead">{t('appQrLead')}</p>

        {status === 'loading' && (
          <div className="center qr-state">
            <div className="pulse" />
            <p className="note">{t('appQrLoading')}</p>
          </div>
        )}

        {status === 'pending' && (
          <>
            <div className="qr-modal-qr">
              {qrDataUrl
                ? <img src={qrDataUrl} alt={t('appQrTitle')} />
                : <div className="qr-placeholder" />}
            </div>
            <p className="note qr-scan-hint">{t('appQrScanHint')}</p>
            {qr?.code && (
              <div className="qr-manual">
                <span className="field-label">{t('appQrManual')}</span>
                <div className="qr-code-row">
                  <code className="qr-code">{qr.code}</code>
                  <button className="btn ghost qr-copy" onClick={copyCode}>
                    {codeCopied ? t('appQrCopied') : t('appQrCopy')}
                  </button>
                </div>
              </div>
            )}
            <div className="qr-meta">
              <span>{t('appQrExpires')} {clock(remaining)}</span>
              <button className="btn link qr-refresh" onClick={refresh}>{t('appQrRefresh')}</button>
            </div>
          </>
        )}

        {status === 'scanned' && (
          <div className="center qr-state">
            <div className="seal sm" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="qr-state-title">{t('appQrScannedTitle')}</h3>
            <p className="lead">{t('appQrScannedLead')}</p>
            <p className="qr-device">{device || t('appQrDeviceUnknown')}</p>
            <p className="note">{t('appQrAutoConfirm')}</p>
            {error && <p className="note err-text">{error}</p>}
            <div className="qr-actions">
              <button className="btn ghost" onClick={close}>{t('cancel')}</button>
            </div>
          </div>
        )}

        {status === 'confirmed' && (
          <div className="center qr-state">
            <div className="pulse" />
            <h3 className="qr-state-title">{t('appQrConfirmedTitle')}</h3>
            <p className="lead">{t('appQrConfirmedLead')}</p>
          </div>
        )}

        {status === 'approved' && (
          <div className="center qr-state">
            <div className="seal sm" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="qr-state-title">{t('appQrApprovedTitle')}</h3>
            <p className="lead">{t('appQrApprovedLead')}</p>
            <div className="qr-actions">
              <button className="btn primary" onClick={close}>{t('appQrDone')}</button>
            </div>
          </div>
        )}

        {(status === 'expired' || status === 'cancelled') && (
          <div className="center qr-state">
            <div className="seal err" aria-hidden="true">!</div>
            <h3 className="qr-state-title">{t('appQrExpiredTitle')}</h3>
            <p className="lead">{t('appQrExpiredLead')}</p>
            <div className="qr-actions">
              <button className="btn primary" onClick={refresh}>{t('appQrNew')}</button>
              <button className="btn ghost" onClick={close}>{t('close')}</button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="center qr-state">
            <div className="seal err" aria-hidden="true">!</div>
            <h3 className="qr-state-title">{t('appQrErrorTitle')}</h3>
            <p className="lead err-text">{error || t('appQrError')}</p>
            <div className="qr-actions">
              <button className="btn primary" onClick={refresh}>{t('retry')}</button>
              <button className="btn ghost" onClick={close}>{t('close')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
