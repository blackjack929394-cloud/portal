import { useEffect, useState } from 'react';
import {
  verifyToken,
  listPasswords,
  getPassword,
  listGuests,
  listEmployees,
  listNodes,
  createNode,
  deleteNode,
  toggleNode,
  deployNode,
  getDeployStatus,
  redeployNode,
  listSubscriptions,
  revokeSubscription,
  getStats,
} from './adminApi.js';

const TABS = [
  { id: 'passwords', label: 'Пароли' },
  { id: 'guests', label: 'Гости' },
  { id: 'employees', label: 'Сотрудники' },
  { id: 'nodes', label: 'Ноды' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'stats', label: 'Статистика' },
];

export default function AdminApp() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [vaultOn, setVaultOn] = useState(true);
  const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState('nodes');

  async function onLogin() {
    setLoginErr('');
    try {
      const s = await verifyToken(token);
      setVaultOn(s.vaultEnabled);
      setAuthed(true);
    } catch (err) {
      setLoginErr(err.status === 401 ? 'Неверный токен' : err.message);
    }
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="aura" aria-hidden="true" />
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">DOGMA</span>
            <span className="brand-tag">Администрирование</span>
          </div>
        </header>
        <main className="stage">
          <section className="panel">
            <h1 className="title" style={{ textAlign: 'center' }}>Вход в админку</h1>
            <p className="lead" style={{ textAlign: 'center' }}>Введите admin-токен.</p>
            <label className="field">
              <span className="field-label">Admin token</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                autoFocus
              />
            </label>
            {loginErr && <p className="note err-text">{loginErr}</p>}
            <button className="btn primary" onClick={onLogin} disabled={!token}>Войти</button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="aura" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DOGMA</span>
          <span className="brand-tag">Администрирование</span>
        </div>
        <button className="user-chip" onClick={() => { setAuthed(false); setToken(''); }}>Выйти</button>
      </header>

      <main className="admin-main">
        <nav className="tabs">
          {TABS.map((tb) => (
            <button key={tb.id} className={tab === tb.id ? 'tab on' : 'tab'} onClick={() => setTab(tb.id)}>
              {tb.label}
            </button>
          ))}
        </nav>

        {tab === 'passwords' && <PasswordsTab token={token} vaultOn={vaultOn} />}
        {tab === 'guests' && <DirectoryTab token={token} loader={listGuests} cols={['fullName', 'email', 'createdAt']} headers={['ФИО', 'Email', 'Создан']} />}
        {tab === 'employees' && <DirectoryTab token={token} loader={listEmployees} cols={['fullName', 'email', 'createdAt']} headers={['ФИО', 'Email', 'Создан']} />}
        {tab === 'nodes' && <NodesTab token={token} />}
        {tab === 'subscriptions' && <SubscriptionsTab token={token} />}
        {tab === 'stats' && <StatsTab token={token} />}
      </main>
    </div>
  );
}

function PasswordsTab({ token, vaultOn }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({});
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!vaultOn) { setErr('Хранилище паролей выключено (нет ADMIN_VAULT_KEY).'); setRows([]); return; }
    listPasswords(token).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  }, [token, vaultOn]);

  async function reveal(id) {
    if (open[id]) { setOpen((o) => ({ ...o, [id]: undefined })); return; }
    try {
      const entry = await getPassword(token, id);
      setOpen((o) => ({ ...o, [id]: entry.password }));
    } catch (e) {
      setErr(e.message);
    }
  }

  function copy(pw, id) {
    navigator.clipboard?.writeText(pw);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  if (err) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;
  if (rows.length === 0) return <p className="admin-msg">Пока нет выданных паролей.</p>;

  return (
    <div className="table-wrap">
      <table className="atable">
        <thead>
          <tr><th>ФИО</th><th>Email</th><th>Файл</th><th>Создан</th><th>Пароль</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.requestId}>
              <td>{r.fullName}</td>
              <td>{r.email || '—'}</td>
              <td className="mono">{r.fileName}</td>
              <td className="dim">{fmt(r.createdAt)}</td>
              <td>
                {open[r.requestId] ? (
                  <span className="pw-row">
                    <code className="key sm">{open[r.requestId]}</code>
                    <button className="btn ghost xs" onClick={() => copy(open[r.requestId], r.requestId)}>
                      {copied === r.requestId ? 'OK' : 'Копир.'}
                    </button>
                    <button className="btn ghost xs" onClick={() => reveal(r.requestId)}>Скрыть</button>
                  </span>
                ) : (
                  <button className="btn ghost xs" onClick={() => reveal(r.requestId)}>Показать</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DirectoryTab({ token, loader, cols, headers }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    loader(token).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  }, [token, loader]);

  if (err) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;
  if (rows.length === 0) return <p className="admin-msg">Записей пока нет.</p>;

  return (
    <div className="table-wrap">
      <table className="atable">
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.email || r.sub || i}>
              {cols.map((c) => <td key={c} className={c === 'createdAt' ? 'dim' : ''}>{c === 'createdAt' ? fmt(r[c]) : (r[c] || '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NodesTab({ token }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    name: '', host: '', port: 443, protocol: 'hysteria2', kind: 'hysteria2', region: '', provider: '',
    sshHost: '', sshPort: 22, sshUser: 'root', sshKey: '',
  });

  async function load() {
    try {
      const data = await listNodes(token);
      setRows(data);
    } catch (e) { setErr(e.message); setRows([]); }
  }

  useEffect(() => { load(); }, [token]);

  async function onCreate() {
    if (!form.name || !form.host) return;
    try {
      await createNode(token, { ...form, sshHost: form.sshHost || form.host });
      setForm({ name: '', host: '', port: 443, protocol: 'hysteria2', kind: 'hysteria2', region: '', provider: '', sshHost: '', sshPort: 22, sshUser: 'root', sshKey: '' });
      load();
    } catch (e) { setErr(e.message); }
  }

  async function onDelete(id) {
    if (!confirm('Удалить ноду?')) return;
    try { await deleteNode(token, id); load(); } catch (e) { setErr(e.message); }
  }

  async function onToggle(id) {
    try { await toggleNode(token, id); load(); } catch (e) { setErr(e.message); }
  }

  async function onDeploy(id) {
    try { await deployNode(token, id); load(); } catch (e) { setErr(e.message); }
  }

  async function onRedeploy(id) {
    if (!confirm('Переразвернуть ноду?')) return;
    try { await redeployNode(token, id); load(); } catch (e) { setErr(e.message); }
  }

  if (err) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;

  return (
    <div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <h3 className="subhead">Добавить ноду</h3>
        <div className="field-row">
          <label className="field"><span className="field-label">Имя</span><input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></label>
          <label className="field"><span className="field-label">Хост (публичный)</span><input value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} /></label>
          <label className="field"><span className="field-label">Порт клиентов</span><input type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} /></label>
          <label className="field"><span className="field-label">Тип</span>
            <select value={form.kind} onChange={(e) => setForm(f => ({ ...f, kind: e.target.value, protocol: e.target.value }))}>
              <option value="hysteria2">Hysteria2</option>
              <option value="sing-box">sing-box</option>
            </select>
          </label>
        </div>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label className="field"><span className="field-label">Регион</span><input value={form.region} onChange={(e) => setForm(f => ({ ...f, region: e.target.value }))} /></label>
          <label className="field"><span className="field-label">Провайдер</span><input value={form.provider} onChange={(e) => setForm(f => ({ ...f, provider: e.target.value }))} /></label>
          <label className="field"><span className="field-label">SSH хост</span><input value={form.sshHost} placeholder={form.host} onChange={(e) => setForm(f => ({ ...f, sshHost: e.target.value }))} /></label>
          <label className="field"><span className="field-label">SSH порт</span><input type="number" value={form.sshPort} onChange={(e) => setForm(f => ({ ...f, sshPort: parseInt(e.target.value) || 22 }))} /></label>
        </div>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label className="field" style={{ flex: 1 }}><span className="field-label">SSH пользователь</span><input value={form.sshUser} onChange={(e) => setForm(f => ({ ...f, sshUser: e.target.value }))} /></label>
          <label className="field" style={{ flex: 3 }}><span className="field-label">Приватный SSH-ключ</span><textarea rows={3} value={form.sshKey} onChange={(e) => setForm(f => ({ ...f, sshKey: e.target.value }))} placeholder="-----BEGIN OPENSSH PRIVATE KEY----- ..." /></label>
          <button className="btn primary" onClick={onCreate} disabled={!form.name || !form.host}>Добавить</button>
        </div>
      </div>

      {rows.length === 0 ? <p className="admin-msg">Нод пока нет.</p> : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>Имя</th><th>Хост</th><th>Порт</th><th>Тип</th><th>Регион</th><th>Статус</th><th>Деплой</th><th>Действия</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono">{r.host}</td>
                  <td>{r.port}</td>
                  <td>{r.kind}</td>
                  <td>{r.region || '—'}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>
                    <span className={`badge ${r.deploymentStatus || 'pending'}`}>{r.deploymentStatus || 'pending'}</span>
                    {r.deploymentError && <div className="note err-text" title={r.deploymentError}>{r.deploymentError.slice(0, 40)}…</div>}
                    {r.wgTunnelIp && <div className="dim mono">WG: {r.wgTunnelIp}</div>}
                  </td>
                  <td>
                    <button className="btn ghost xs" onClick={() => onToggle(r.id)}>{r.status === 'active' ? 'Блокировать' : 'Активировать'}</button>
                    {r.kind === 'hysteria2' && (
                      <>
                        <button className="btn ghost xs" onClick={() => onDeploy(r.id)} disabled={r.deploymentStatus === 'deploying'}>Деплоить</button>
                        <button className="btn ghost xs" onClick={() => onRedeploy(r.id)} disabled={r.deploymentStatus === 'deploying'}>Переразвернуть</button>
                      </>
                    )}
                    <button className="btn ghost xs" onClick={() => onDelete(r.id)}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SubscriptionsTab({ token }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const data = await listSubscriptions(token);
      setRows(data);
    } catch (e) { setErr(e.message); setRows([]); }
  }

  useEffect(() => { load(); }, [token]);

  async function onRevoke(id) {
    if (!confirm('Отозвать подписку?')) return;
    try { await revokeSubscription(token, id, 'admin'); load(); } catch (e) { setErr(e.message); }
  }

  if (err) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;
  if (rows.length === 0) return <p className="admin-msg">Подписок пока нет.</p>;

  return (
    <div className="table-wrap">
      <table className="atable">
        <thead><tr><th>Пользователь</th><th>Email</th><th>Токен</th><th>Статус</th><th>Создан</th><th>Истекает</th><th>Действия</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.userName || '—'}</td>
              <td>{r.userEmail || '—'}</td>
              <td className="mono">{r.token.slice(0, 16)}…</td>
              <td><span className={`badge ${r.status}`}>{r.status}</span></td>
              <td className="dim">{fmt(r.createdAt)}</td>
              <td className="dim">{r.expiresAt ? fmt(r.expiresAt) : '—'}</td>
              <td>
                {r.status === 'active' && (
                  <button className="btn ghost xs" onClick={() => onRevoke(r.id)}>Отозвать</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsTab({ token }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getStats(token).then(setStats).catch((e) => { setErr(e.message); setStats(null); });
  }, [token]);

  if (err) return <p className="admin-msg err-text">{err}</p>;
  if (!stats) return <p className="admin-msg">Загрузка…</p>;

  return (
    <div className="panel">
      <div className="field-row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <div><div className="field-label">Всего нод</div><div className="title" style={{ margin: 0 }}>{stats.totalNodes}</div></div>
        <div><div className="field-label">Активных нод</div><div className="title" style={{ margin: 0 }}>{stats.activeNodes}</div></div>
        <div><div className="field-label">Всего подписок</div><div className="title" style={{ margin: 0 }}>{stats.totalSubscriptions}</div></div>
        <div><div className="field-label">Активных подписок</div><div className="title" style={{ margin: 0 }}>{stats.activeSubscriptions}</div></div>
      </div>
    </div>
  );
}

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}
