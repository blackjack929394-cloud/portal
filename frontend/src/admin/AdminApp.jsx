import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import {
  verifyToken,
  listNodes,
  createNode,
  updateNode,
  deleteNode,
  toggleNode,
  deployNode,
  redeployNode,
  listSubscriptions,
  updateSubscription,
  listPending,
  approveSubscription,
  denySubscription,
  revokeSubscription,
  deleteSubscription,
  listChats,
  getChatMessages,
  sendChatMessage,
  listUsers,
  getUserRouting,
  deleteUser,
  setUserBlocked,
  getStats,
} from './adminApi.js';

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'nodes', label: 'Ноды' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'users', label: 'Пользователи' },
  { id: 'requests', label: 'Заявки' },
  { id: 'chat', label: 'Чат' },
];

const REFRESH_MS = 15000;
const ADMIN_TOKEN_KEY = 'dogma_admin_token';

function usePolling(loader, deps = [], intervalMs = REFRESH_MS) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);
  const alive = useRef(true);

  async function reload() {
    try {
      const d = await loader();
      if (!alive.current) return;
      setData(d);
      setErr('');
    } catch (e) {
      if (!alive.current) return;
      setErr(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    reload();
    if (intervalMs) timer.current = setInterval(reload, intervalMs);
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, err, loading, reload };
}

// Короткие всплывающие уведомления (вместо alert).
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, notify };
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

// Один формат чисел: целые без дробной части, дробные через запятую.
function fmtGb(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

const NODE_STATUS = { active: 'активна', blocked: 'заблокирована' };
const DEPLOY_STATUS = {
  active: 'развёрнута',
  deployed: 'развёрнута',
  deploying: 'идёт деплой',
  failed: 'ошибка',
  pending: 'ожидает',
};

function copy(text, notify) {
  const done = () => notify && notify('Скопировано');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    done && done();
  } catch { /* ignore */ }
}

const subUrl = (token, format) => `${window.location.origin}/api/v1/sub/${token}${format ? `?format=${format}` : ''}`;

export default function AdminApp() {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
  });
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState('overview');
  const { toasts, notify } = useToasts();

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    verifyToken(token)
      .then(() => setAuthed(true))
      .catch((err) => {
        // 401 — токен правда неверный, его можно забыть. Любая другая ошибка
        // (429, сеть) не должна выкидывать админа из панели.
        if (err?.status === 401) {
          try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ }
          setToken('');
        } else {
          setLoginErr('Не удалось проверить токен: ' + (err?.message || 'сеть'));
        }
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: pendingRows } = usePolling(
    () => (authed && token ? listPending(token) : Promise.resolve([])),
    [token, authed],
  );
  const pendingCount = Array.isArray(pendingRows) ? pendingRows.length : 0;

  const { data: chatRows } = usePolling(
    () => (authed && token ? listChats(token) : Promise.resolve([])),
    [token, authed],
  );
  const chatUnread = Array.isArray(chatRows) ? chatRows.reduce((n, c) => n + (c.unread || 0), 0) : 0;

  const TAB_BADGE = { requests: pendingCount, chat: chatUnread };

  async function onLogin() {
    setLoginErr('');
    try {
      await verifyToken(token);
      try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* ignore */ }
      setAuthed(true);
    } catch (err) {
      setLoginErr(err.status === 401 ? 'Неверный токен' : err.message);
    }
  }

  function onLogout() {
    try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ }
    setAuthed(false); setToken('');
  }

  if (checking) {
    return (
      <div className="page">
        <main className="stage"><section className="panel"><div className="center"><div className="pulse" /></div></section></main>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">
            <AdminGlyph />
            <span className="brand-mark">DOGMA</span>
            <span className="brand-tag">Администрирование</span>
          </div>
        </header>
        <main className="stage">
          <section className="panel auth-panel">
            <h1 className="title">Вход в панель управления</h1>
            <p className="lead">Введите токен администратора</p>
            <label className="field">
              <span className="field-label">Токен администратора</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onLogin()} autoFocus />
            </label>
            {loginErr && <p className="note err-text">{loginErr}</p>}
            <button className="btn primary" onClick={onLogin} disabled={!token}>Войти</button>
          </section>
        </main>
      </div>
    );
  }

  const currentTab = TABS.find((t) => t.id === tab);

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <AdminGlyph />
          <div>
            <div className="brand-mark">DOGMA</div>
            <div className="brand-tag">Администрирование</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Разделы">
          {TABS.map((tb) => (
            <button key={tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)}>
              <span>{tb.label}</span>
              {TAB_BADGE[tb.id] > 0 && <span className="nav-count">{TAB_BADGE[tb.id]}</span>}
            </button>
          ))}
        </nav>

        <div className="admin-side-foot">
          <span className="live-dot" title="Данные обновляются автоматически">● онлайн</span>
          <button className="user-chip" onClick={onLogout}>Выйти</button>
        </div>
      </aside>

      <main className="admin-content">
        <h1 className="page-title">{currentTab?.label}</h1>
        {tab === 'overview' && <OverviewTab token={token} pendingCount={pendingCount} chatUnread={chatUnread} goTo={setTab} />}
        {tab === 'nodes' && <NodesTab token={token} notify={notify} />}
        {tab === 'subscriptions' && <SubscriptionsTab token={token} notify={notify} />}
        {tab === 'users' && <UsersTab token={token} notify={notify} />}
        {tab === 'requests' && <PendingTab token={token} notify={notify} />}
        {tab === 'chat' && <ChatTab token={token} />}
      </main>

      <div className="toast-host">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </div>
  );
}

// Знак продукта — тот же маршрут из двух узлов, что и в клиенте.
function AdminGlyph() {
  return (
    <svg className="brand-glyph" viewBox="0 0 24 12" aria-hidden="true">
      <path d="M2 9h6l3-3h11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2" cy="9" r="1.6" fill="currentColor" />
      <circle cx="22" cy="6" r="1.6" fill="var(--gold)" />
    </svg>
  );
}

// ── Обзор ────────────────────────────────────────────────────────────────────
function OverviewTab({ token, pendingCount, chatUnread, goTo }) {
  const { data: stats } = usePolling(() => getStats(token), [token]);
  const { data: users } = usePolling(() => listUsers(token), [token], 10000);
  const { data: subs } = usePolling(() => listSubscriptions(token), [token]);

  const usersTotal = Array.isArray(users) ? users.length : null;
  const usersBlocked = Array.isArray(users) ? users.filter((u) => u.blocked).length : 0;
  const subsActive = Array.isArray(subs) ? subs.filter((s) => (s.effectiveStatus || s.status) === 'active').length : 0;

  const cards = [
    { label: 'Ноды', value: stats ? `${stats.activeNodes}/${stats.totalNodes}` : '…', hint: 'активны / всего', to: 'nodes' },
    { label: 'Подписки', value: stats ? `${subsActive}/${stats.totalSubscriptions}` : '…', hint: 'активны / всего', to: 'subscriptions' },
    { label: 'Пользователи', value: usersTotal ?? '…', hint: usersBlocked ? `${usersBlocked} заблокировано` : 'все активны', to: 'users' },
    { label: 'Заявки', value: pendingCount, hint: 'ждут одобрения', to: 'requests', warn: pendingCount > 0 },
    { label: 'Непрочитанные', value: chatUnread, hint: 'в чате', to: 'chat', warn: chatUnread > 0 },
  ];

  return (
    <div className="stats">
      {cards.map((c) => (
        <button key={c.label} className={`stat${c.warn ? ' warn' : ''}`} onClick={() => goTo(c.to)}>
          <span className="stat-value">{c.value}</span>
          <span className="stat-label">{c.label}</span>
          <span className="stat-hint">{c.hint}</span>
        </button>
      ))}
    </div>
  );
}

// ── Ноды ─────────────────────────────────────────────────────────────────────
const EMPTY_NODE = { name: '', host: '', port: 443, protocol: 'hysteria2', kind: 'hysteria2', region: '', provider: '', sshHost: '', sshPort: 22, sshUser: 'root', sshKey: '' };

function NodesTab({ token, notify }) {
  const { data: rows, err, reload } = usePolling(() => listNodes(token), [token]);
  const [form, setForm] = useState(EMPTY_NODE);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  async function onCreate() {
    if (!form.name || !form.host) return;
    try {
      await createNode(token, { ...form, sshHost: form.sshHost || form.host });
      setForm(EMPTY_NODE); setShowForm(false); reload(); notify('Нода добавлена');
    } catch (e) { notify(e.message, 'err'); }
  }

  function startEdit(r) {
    setEditId(r.id);
    setEdit({ name: r.name, host: r.host, port: r.port, region: r.region || '', provider: r.provider || '' });
  }

  async function saveEdit() {
    try { await updateNode(token, editId, edit); setEditId(null); reload(); notify('Сохранено'); }
    catch (e) { notify(e.message, 'err'); }
  }

  const act = (fn, msg, confirmMsg) => async (id) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await fn(token, id); reload(); if (msg) notify(msg); } catch (e) { notify(e.message, 'err'); }
  };
  const onDelete = act(deleteNode, 'Нода удалена', 'Удалить ноду?');
  const onToggle = act(toggleNode);
  const onDeploy = act(deployNode, 'Деплой запущен');
  const onRedeploy = act(redeployNode, 'Переразвёртывание запущено', 'Переразвернуть ноду?');

  if (err && !rows) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn primary sm" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Скрыть форму' : '+ Добавить ноду'}</button>
        <span className="dim">Всего: {rows.length}</span>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <h3 className="subhead">Новая нода (европейская выходная точка)</h3>
          <div className="field-row">
            <label className="field"><span className="field-label">Имя</span><input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></label>
            <label className="field"><span className="field-label">Хост (публичный)</span><input value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} /></label>
            <label className="field"><span className="field-label">Порт</span><input type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} /></label>
            <label className="field"><span className="field-label">Тип</span>
              <select value={form.kind} onChange={(e) => setForm(f => ({ ...f, kind: e.target.value, protocol: e.target.value }))}>
                <option value="hysteria2">Hysteria2</option><option value="vless">VLESS</option>
                <option value="amneziawg">AmneziaWG</option><option value="sing-box">sing-box</option>
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
      )}

      {rows.length === 0 ? <p className="admin-msg">Нод пока нет.</p> : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>Имя</th><th>Хост</th><th>Порт</th><th>Тип</th><th>Регион</th><th>Статус</th><th>Деплой</th><th>Действия</th></tr></thead>
            <tbody>
              {rows.map((r) => editId === r.id ? (
                <tr key={r.id} className="edit-row">
                  <td><input value={edit.name} onChange={(e) => setEdit(x => ({ ...x, name: e.target.value }))} /></td>
                  <td><input value={edit.host} onChange={(e) => setEdit(x => ({ ...x, host: e.target.value }))} /></td>
                  <td><input type="number" style={{ width: 70 }} value={edit.port} onChange={(e) => setEdit(x => ({ ...x, port: parseInt(e.target.value) || r.port }))} /></td>
                  <td>{r.kind}</td>
                  <td><input value={edit.region} onChange={(e) => setEdit(x => ({ ...x, region: e.target.value }))} /></td>
                  <td colSpan={2} className="dim">Провайдер: <input value={edit.provider} onChange={(e) => setEdit(x => ({ ...x, provider: e.target.value }))} /></td>
                  <td><button className="btn primary xs" onClick={saveEdit}>Сохранить</button><button className="btn ghost xs" onClick={() => setEditId(null)}>Отмена</button></td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="nowrap">{r.name}</td>
                  <td className="mono">{r.host} <button className="linkbtn" title="Копировать хост" onClick={() => copy(r.host, notify)}>копир.</button></td>
                  <td>{r.port}</td>
                  <td>{r.kind}</td>
                  <td>{r.region || '—'}</td>
                  <td><span className={`badge ${r.effectiveStatus || r.status}`}>{NODE_STATUS[r.effectiveStatus || r.status] || r.effectiveStatus || r.status}</span></td>
                  <td>
                    <span className={`badge ${r.deploymentStatus || 'pending'}`}>{DEPLOY_STATUS[r.deploymentStatus] || 'ожидает'}</span>
                    {r.deploymentError && <div className="note err-text" title={r.deploymentError}>{r.deploymentError.slice(0, 40)}…</div>}
                    {r.wgTunnelIp && <div className="dim mono">WG: {r.wgTunnelIp}</div>}
                  </td>
                  <td className="row-actions">
                    <button className="btn ghost xs" onClick={() => startEdit(r)}>Изменить</button>
                    <button className="btn ghost xs" onClick={() => onToggle(r.id)}>{(r.effectiveStatus || r.status) === 'active' ? 'Блок' : 'Актив'}</button>
                    {r.kind === 'hysteria2' && (
                      <>
                        <button className="btn ghost xs" onClick={() => onDeploy(r.id)} disabled={r.deploymentStatus === 'deploying'}>Деплой</button>
                        <button className="btn ghost xs" onClick={() => onRedeploy(r.id)} disabled={r.deploymentStatus === 'deploying'}>Переразвернуть</button>
                      </>
                    )}
                    <button className="btn ghost xs danger" onClick={() => onDelete(r.id)}>Удалить</button>
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

// ── Подписки ─────────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'pending', label: 'Ожидают' },
  { id: 'revoked', label: 'Отозванные' },
  { id: 'expired', label: 'Просроченные' },
  { id: 'exhausted', label: 'Лимит трафика' },
];

const STATUS_LABELS = {
  active: 'активна',
  pending: 'ожидает',
  revoked: 'отозвана',
  expired: 'истекла',
  exhausted: 'лимит',
};

function SubscriptionsTab({ token, notify }) {
  const { data: rows, err, reload } = usePolling(() => listSubscriptions(token), [token]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  const [days, setDays] = useState(30);
  const [limit, setLimit] = useState('');

  const act = (fn, msg, confirmMsg) => async (id) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await fn(token, id); reload(); if (msg) notify(msg); } catch (e) { notify(e.message, 'err'); }
  };
  const onRevoke = act((t, id) => revokeSubscription(t, id, 'admin'), 'Отозвано', 'Отозвать подписку?');
  const onDelete = act(deleteSubscription, 'Удалено', 'Удалить подписку?');

  function startEdit(r) {
    setEditId(r.id); setDays(30); setLimit(r.trafficLimitGb ?? '');
  }
  async function saveEdit(id) {
    const patch = {};
    if (days) patch.extendDays = parseInt(days, 10);
    patch.trafficLimitGb = limit === '' ? null : parseInt(limit, 10);
    try { await updateSubscription(token, id, patch); setEditId(null); reload(); notify('Сохранено'); }
    catch (e) { notify(e.message, 'err'); }
  }

  if (err && !rows) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => (filter === 'all' || (r.effectiveStatus || r.status) === filter)
    && (!needle || [r.userName, r.userEmail, r.token].some((v) => (v || '').toLowerCase().includes(needle))));

  return (
    <div>
      <div className="toolbar">
        <div className="segmented">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <input className="search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dim">{filtered.length} из {rows.length}</span>
      </div>

      {filtered.length === 0 ? <p className="admin-msg">Ничего не найдено.</p> : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>Пользователь</th><th>Токен</th><th>Статус</th><th>Трафик</th><th>Создан</th><th>Действия</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="user-cell">
                      <div>{r.userName || '—'}</div>
                      {r.userEmail && <div className="cell-sub">{r.userEmail}</div>}
                    </td>
                    <td className="mono">{r.token.slice(0, 12)}… <button className="linkbtn" title="Копировать токен" onClick={() => copy(r.token, notify)}>копир.</button></td>
                    <td><span className={`badge ${r.effectiveStatus || r.status}`}>{STATUS_LABELS[r.effectiveStatus || r.status] || r.effectiveStatus || r.status}</span></td>
                    <td className="dim num">{fmtGb(r.trafficUsedGb)} / {r.trafficLimitGb ? `${r.trafficLimitGb} ГБ` : '∞'}</td>
                    <td className="dim">{fmtDate(r.createdAt)}</td>
                    <td className="row-actions">
                      {(r.effectiveStatus || r.status) === 'active' && (
                        <>
                          <button className="btn ghost xs" title="Умная ссылка с маршрутизацией — для Hiddify и телефона" onClick={() => copy(subUrl(r.token, 'singbox'), notify)}>Hiddify</button>
                          <button className="btn ghost xs" title="Зашифрованная ссылка — открывается только в приложении Dogma" onClick={() => copy(subUrl(r.token, 'enc'), notify)}>Dogma</button>
                          <button className="btn ghost xs" onClick={() => startEdit(r)}>Изменить</button>
                          <button className="btn ghost xs danger" onClick={() => onRevoke(r.id)}>Отозвать</button>
                        </>
                      )}
                      {['revoked', 'expired', 'exhausted'].includes(r.effectiveStatus || r.status) && <button className="btn ghost xs danger" onClick={() => onDelete(r.id)}>Удалить</button>}
                    </td>
                  </tr>
                  {editId === r.id && (
                    <tr className="edit-row edit-row-open"><td colSpan={6}>
                      <div className="inline-edit">
                        <label className="field inline"><span className="field-label">Продлить на (дней)</span><input type="number" value={days} onChange={(e) => setDays(e.target.value)} /></label>
                        <label className="field inline"><span className="field-label">Лимит трафика, ГБ (пусто = ∞)</span><input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
                        <button className="btn primary sm" onClick={() => saveEdit(r.id)}>Сохранить</button>
                        <button className="btn ghost sm" onClick={() => setEditId(null)}>Отмена</button>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Пользователи ─────────────────────────────────────────────────────────────
function UsersTab({ token, notify }) {
  const { data: rows, err, reload } = usePolling(() => listUsers(token), [token], 10000);
  const [q, setQ] = useState('');
  const [routingFor, setRoutingFor] = useState(null);
  const [routing, setRouting] = useState(null);

  async function onDelete(u) {
    if (!confirm(`Удалить пользователя ${u.fullName || u.username}? Его подписки и переписка будут удалены, доступ отключится.`)) return;
    try { await deleteUser(token, u.username); reload(); notify('Пользователь удалён'); } catch (e) { notify(e.message, 'err'); }
  }
  async function onToggleBlock(u) {
    const next = !u.blocked;
    if (next && !confirm(`Заблокировать ${u.fullName || u.username}? Он не сможет войти, VPN-доступ отключится.`)) return;
    try { await setUserBlocked(token, u.username, next); reload(); notify(next ? 'Заблокирован' : 'Разблокирован'); } catch (e) { notify(e.message, 'err'); }
  }
  async function onRouting(u) {
    if (routingFor === u.username) { setRoutingFor(null); return; }
    setRoutingFor(u.username); setRouting(null);
    try { setRouting(await getUserRouting(token, u.username)); } catch (e) { notify(e.message, 'err'); }
  }

  if (err && !rows) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((u) => !needle || [u.username, u.fullName, u.email].some((v) => (v || '').toLowerCase().includes(needle)));

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dim">{filtered.length} из {rows.length}</span>
      </div>
      {filtered.length === 0 ? <p className="admin-msg">Ничего не найдено.</p> : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>Логин</th><th>Пользователь</th><th>Статус</th><th>Регистрация</th><th>Последний вход</th><th>Действия</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <Fragment key={u.username}>
                  <tr>
                    <td className="mono login-cell" title={u.username}>{u.username}</td>
                    <td className="user-cell">
                      <div>{u.fullName || '—'}</div>
                      {u.email && <div className="cell-sub">{u.email}</div>}
                    </td>
                    <td><span className={`badge ${u.blocked ? 'fail' : 'active'}`}>{u.blocked ? 'заблокирован' : 'активен'}</span></td>
                    <td className="dim">{fmtDate(u.createdAt)}</td>
                    <td className="dim">{u.lastLogin ? fmt(u.lastLogin) : '—'}</td>
                    <td className="row-actions">
                      <button className="btn ghost xs" onClick={() => onRouting(u)}>{routingFor === u.username ? 'Скрыть' : 'Маршруты'}</button>
                      <button className="btn ghost xs" onClick={() => onToggleBlock(u)}>{u.blocked ? 'Разблок.' : 'Блок'}</button>
                      <button className="btn ghost xs danger" onClick={() => onDelete(u)}>Удалить</button>
                    </td>
                  </tr>
                  {routingFor === u.username && (
                    <tr className="edit-row"><td colSpan={6}>
                      {!routing ? <span className="dim">Загрузка…</span> : <RoutingSummary p={routing} />}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoutingSummary({ p }) {
  return (
    <div className="routing-summary">
      <span className="badge active">{p.mode === 'selective' ? 'Только выбранное' : 'Весь трафик'}</span>
      {p.mode === 'global' && <span className="dim">RU напрямую: {p.ruDirect ? 'да' : 'нет'}</span>}
      {(p.presets || []).length > 0 && <span className="dim">Сервисы: {p.presets.join(', ')}</span>}
      {(p.proxyDomains || []).length > 0 && <span className="dim">Через VPN: {p.proxyDomains.join(', ')}</span>}
      {(p.directDomains || []).length > 0 && <span className="dim">Напрямую: {p.directDomains.join(', ')}</span>}
    </div>
  );
}

// ── Заявки ───────────────────────────────────────────────────────────────────
function PendingTab({ token, notify }) {
  const { data: rows, err, reload } = usePolling(() => listPending(token), [token]);

  async function onApprove(id) {
    try { await approveSubscription(token, id); reload(); notify('Заявка одобрена'); } catch (e) { notify(e.message, 'err'); }
  }
  async function onDeny(id) {
    if (!confirm('Отклонить заявку?')) return;
    try { await denySubscription(token, id, 'denied'); reload(); notify('Заявка отклонена'); } catch (e) { notify(e.message, 'err'); }
  }

  if (err && !rows) return <p className="admin-msg err-text">{err}</p>;
  if (!rows) return <p className="admin-msg">Загрузка…</p>;
  if (rows.length === 0) return <p className="admin-msg">Заявок на одобрение нет.</p>;

  return (
    <div>
      <p className="lead" style={{ marginTop: 0 }}>Эти пользователи были отозваны и подали новую заявку. Одобрите — им станет доступна ссылка.</p>
      <div className="table-wrap">
        <table className="atable">
          <thead><tr><th>Пользователь</th><th>Email</th><th>Подана</th><th>Действия</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.userName || '—'}</td>
                <td>{r.userEmail || '—'}</td>
                <td className="dim">{fmt(r.createdAt)}</td>
                <td className="row-actions">
                  <button className="btn primary xs" onClick={() => onApprove(r.id)}>Одобрить</button>
                  <button className="btn ghost xs danger" onClick={() => onDeny(r.id)}>Отклонить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Чат ──────────────────────────────────────────────────────────────────────
function ChatTab({ token }) {
  const { data: chats } = usePolling(() => listChats(token), [token]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bodyRef = useRef(null);

  async function loadMessages(userSub) {
    try { setMessages(await getChatMessages(token, userSub)); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!selected) return undefined;
    loadMessages(selected);
    const iv = setInterval(() => loadMessages(selected), 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  async function onSend() {
    const val = text.trim();
    if (!val || !selected) return;
    setText('');
    try { const m = await sendChatMessage(token, selected, val); setMessages((p) => [...p, m]); } catch { /* ignore */ }
  }

  const list = chats || [];
  const current = list.find((c) => c.userSub === selected);

  return (
    <div className="chat-admin">
      <aside className="chat-list">
        {list.length === 0 && <p className="admin-msg" style={{ padding: 12 }}>Диалогов пока нет.</p>}
        {list.map((c) => (
          <button key={c.userSub} className={`chat-list-item ${c.userSub === selected ? 'on' : ''}`} onClick={() => setSelected(c.userSub)}>
            <div className="chat-list-name">
              {c.userName || c.userSub}
              {c.unread > 0 && <span className="badge pending" style={{ marginLeft: 6 }}>{c.unread}</span>}
            </div>
            <div className="chat-list-last">{c.lastSender === 'admin' ? 'Вы: ' : ''}{c.lastText}</div>
          </button>
        ))}
      </aside>
      <div className="chat-conv">
        {!selected && <p className="admin-msg">Выберите диалог слева.</p>}
        {selected && (
          <>
            <div className="chat-conv-head">{current?.userName || selected} <span className="dim">· {current?.userEmail || ''}</span></div>
            <div className="chat-conv-body" ref={bodyRef}>
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.sender === 'admin' ? 'me' : 'them'}`}><div className="chat-bubble">{m.text}</div></div>
              ))}
            </div>
            <div className="chat-input">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }} placeholder="Ответить…" />
              <button className="btn primary" onClick={onSend} disabled={!text.trim()}>Отправить</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
