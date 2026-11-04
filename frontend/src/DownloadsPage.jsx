import { useEffect, useMemo, useState } from 'react';
import { makeT } from './i18n.js';
import { getClients } from './api.js';
import DogmaLogo from './components/DogmaLogo.jsx';

function PlatformIcon({ platform }) {
  if (String(platform).toLowerCase() === 'windows') {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M3 4.5 11 3v8H3V4.5Z" fill="currentColor" opacity="0.9" />
        <path d="M12 2.8 21 1.5V11h-9V2.8Z" fill="currentColor" opacity="0.65" />
        <path d="M3 12h8v8L3 18.5V12Z" fill="currentColor" opacity="0.65" />
        <path d="M12 12h9v9.5L12 20.2V12Z" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M7 10h10v7.2a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 17.2V10Z"
        fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 10 7.2 6.8M15 10l1.8-3.2" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.6" cy="13.2" r="0.9" fill="currentColor" />
      <circle cx="14.4" cy="13.2" r="0.9" fill="currentColor" />
      <path d="M10.2 15.6h3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.8 10.5v5.2M18.2 10.5v5.2" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} ГБ`;
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function ClientCard({ client, t }) {
  const meta = [
    client.version && [t('downloadVersion'), client.version],
    client.sizeBytes && [t('downloadSize'), formatBytes(client.sizeBytes)],
    client.requirements && [t('downloadRequirements'), client.requirements],
  ].filter(Boolean);

  return (
    <article className={`client-card${client.available ? '' : ' unavailable'}`}>
      <div className="client-card-head">
        <span className="client-icon"><PlatformIcon platform={client.platform} /></span>
        <div>
          <span className="client-platform">{client.platform}</span>
          <h2 className="client-name">{client.name}</h2>
        </div>
      </div>
      <p className="client-desc">{client.description}</p>

      <dl className="client-meta">
        {meta.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {client.available ? (
        <a className="btn primary client-download" href={client.downloadUrl}>
          {t('downloadBtn')}
        </a>
      ) : (
        <span className="btn primary client-download disabled">{t('downloadSoon')}</span>
      )}

      {client.fileName && <p className="client-file">{client.fileName}</p>}
      {client.sha256 && (
        <p className="client-file">
          SHA-256: <code>{client.sha256}</code>
        </p>
      )}
    </article>
  );
}

export default function DownloadsPage() {
  const [lang, setLang] = useState('ru');
  const t = useMemo(() => makeT(lang), [lang]);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    getClients()
      .then(setClients)
      .catch(() => setError(true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page download-page">
      <header className="topbar">
        <a className="brand brand-link" href="/">
          <DogmaLogo />
          <span className="brand-tag">{t('brandTag')}</span>
        </a>
        <div className="topbar-right">
          <nav className="topbar-nav" aria-label={t('navLabel')}>
            <a className="topbar-link" href="/">{t('cabinetNav')}</a>
            <a className="topbar-link is-current" href="/download" aria-current="page">{t('downloadNav')}</a>
          </nav>
          <div className="lang" role="group" aria-label="Language">
            <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУ</button>
            <span className="lang-sep">/</span>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </header>

      <main className="stage download-stage">
        <section className="download-hero">
          <span className="eyebrow">{t('downloadEyebrow')}</span>
          <h1 className="title download-title">{t('downloadTitle')}</h1>
          <p className="lead download-lead">{t('downloadLead')}</p>
        </section>

        {error && (
          <section className="panel download-error">
            <p className="note err-text">{t('downloadLoadError')}</p>
            <button className="btn ghost" onClick={load}>{t('retry')}</button>
          </section>
        )}

        {!clients && !error && (
          <div className="download-grid">
            <div className="client-card skeleton" />
            <div className="client-card skeleton" />
          </div>
        )}

        {clients && (
          <div className="download-grid">
            {clients.map((client) => <ClientCard key={client.id} client={client} t={t} />)}
          </div>
        )}

        <section className="download-how">
          <div className="download-how-head">
            <span className="eyebrow">{t('downloadHowEyebrow')}</span>
            <h2 className="subhead">{t('downloadHowTitle')}</h2>
          </div>
          <ol className="download-steps">
            {t('downloadHowSteps').map((step, i) => (
              <li key={i}><span className="step-n">{i + 1}</span><span>{step}</span></li>
            ))}
          </ol>
          <a className="btn ghost download-portal-btn" href="/">{t('cabinetNav')}</a>
        </section>
      </main>
    </div>
  );
}
