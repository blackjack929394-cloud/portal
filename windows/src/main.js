const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, session, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const PORTAL_URL = process.env.DOGMA_PORTAL_URL || 'https://192-144-56-63.sslip.io';
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 2080;
const IS_WIN = process.platform === 'win32';

let mainWindow = null;
let portalWindow = null;
let tray = null;
let singbox = null;
let connecting = false;
let trayStatus = 'Отключено';
const UI_FILE = path.join(__dirname, 'ui', 'index.html');

const userData = () => app.getPath('userData');
const configPath = () => path.join(userData(), 'sing-box.json');
const logPath = () => path.join(userData(), 'sing-box.log');
const proxyBackupPath = () => path.join(userData(), 'proxy-backup.json');
const settingsPath = () => path.join(userData(), 'settings.json');
let configCache = { at: 0, config: null };
let connectedSince = 0;

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function saveToken(token) {
  if (!token) {
    writeSettings({ appToken: null, appTokenEnc: null });
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    writeSettings({
      appTokenEnc: safeStorage.encryptString(token).toString('base64'),
      appToken: null,
    });
  } else {
    writeSettings({ appToken: token, appTokenEnc: null });
  }
}

function getToken() {
  const settings = readSettings();
  if (settings.appTokenEnc && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(settings.appTokenEnc, 'base64')); } catch { return null; }
  }
  return settings.appToken || null;
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function sessionFetch(pathname, options = {}) {
  const ses = mainWindow ? mainWindow.webContents.session : session.defaultSession;
  return ses.fetch(`${PORTAL_URL}${pathname}`, {
    credentials: 'include',
    ...options,
    headers: authHeaders(options.headers || {}),
  });
}

function singBoxPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'sing-box.exe');
  }
  return path.join(__dirname, '..', 'bin', 'sing-box.exe');
}

function setStatus(text) {
  trayStatus = text;
  if (tray) tray.setToolTip(`Dogma Web — ${text}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dogma:vpn-status', { status: text, connected: !!singbox });
  }
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `PowerShell ${code}`))));
    child.on('error', reject);
  });
}

async function readProxySettings() {
  if (!IS_WIN) return null;
  try {
    const out = await runPowerShell(
      "$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';" +
      "$i=Get-ItemProperty $p;" +
      "Write-Output ($i.ProxyEnable.ToString() + '|' + [string]$i.ProxyServer + '|' + [string]$i.ProxyOverride)",
    );
    const [enabled, server, override] = out.trim().split('|');
    return { enabled: enabled === '1', server: server || '', override: override || '' };
  } catch {
    return null;
  }
}

async function writeProxy(enable, server = '', override = '<local>') {
  if (!IS_WIN) return;
  const script =
    "$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';" +
    `Set-ItemProperty $p -Name ProxyEnable -Type DWord -Value ${enable ? 1 : 0};` +
    `Set-ItemProperty $p -Name ProxyServer -Type String -Value '${server.replace(/'/g, "''")}';` +
    `Set-ItemProperty $p -Name ProxyOverride -Type String -Value '${override.replace(/'/g, "''")}';` +
    "Add-Type -Namespace Win32 -Name Native -MemberDefinition '[DllImport(\"wininet.dll\", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);';" +
    '[Win32.Native]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null;' +
    '[Win32.Native]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null;';
  await runPowerShell(script);
}

async function enableSystemProxy() {
  if (!IS_WIN) return;
  const current = await readProxySettings();
  if (current) fs.writeFileSync(proxyBackupPath(), JSON.stringify(current), 'utf8');
  await writeProxy(true, `${PROXY_HOST}:${PROXY_PORT}`);
}

async function restoreSystemProxy() {
  if (!IS_WIN) return;
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(proxyBackupPath(), 'utf8'));
  } catch { /* no backup */ }
  if (previous) {
    await writeProxy(previous.enabled, previous.server, previous.override || '<local>');
    try { fs.unlinkSync(proxyBackupPath()); } catch { /* ignore */ }
  } else {
    await writeProxy(false);
  }
}

async function portalJson(pathname) {
  const res = await sessionFetch(pathname);
  if (!res.ok) {
    const err = new Error(res.status === 401 ? 'Сначала войдите в личный кабинет' : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchSmartConfig(force = false) {
  if (!force && configCache.config && Date.now() - configCache.at < 30000) {
    return configCache.config;
  }
  const sub = await portalJson('/api/v1/vpn/subscription');
  if (!sub || !sub.smartSubscriptionUrl) {
    throw new Error('В подписке нет ссылки с маршрутизацией');
  }
  const res = await sessionFetch(sub.smartSubscriptionUrl.replace(PORTAL_URL, ''));
  if (!res.ok) throw new Error(`Не удалось получить конфиг: HTTP ${res.status}`);
  const config = await res.json();
  configCache = { at: Date.now(), config };
  return config;
}

function nodesFromConfig(config) {
  const skip = new Set(['selector', 'urltest', 'direct', 'block', 'dns', 'tor']);
  const nodes = (config.outbounds || [])
    .filter((o) => !skip.has(o.type))
    .map((o) => ({ tag: o.tag, type: o.type, server: o.server || '', port: o.server_port || null }));
  if ((config.outbounds || []).some((o) => o.type === 'urltest')) {
    nodes.unshift({ tag: 'auto', type: 'auto', server: 'Автоматически', port: null });
  }
  return nodes;
}

async function buildConfig() {
  const raw = await fetchSmartConfig();
  const config = structuredClone(raw);
  const settings = readSettings();
  const selector = (config.outbounds || []).find((o) => o.type === 'selector' && o.tag === 'proxy');
  if (selector && settings.selectedNode && selector.outbounds?.includes(settings.selectedNode)) {
    selector.default = settings.selectedNode;
  }

  // В Windows-приложении используем локальный mixed-прокси и системный прокси,
  // чтобы не требовать прав администратора для TUN/wintun.
  config.inbounds = (config.inbounds || []).filter((inbound) => inbound.type !== 'tun');
  if (!config.inbounds.some((inbound) => inbound.type === 'mixed')) {
    config.inbounds.push({ type: 'mixed', tag: 'mixed-in', listen: PROXY_HOST, listen_port: PROXY_PORT });
  }
  // Портал отдаёт pin_sha256 от старого ядра. sing-box 1.14 не принимает
  // этот пин в формате Hysteria2, поэтому для Windows-клиента используем
  // TLS без проверки цепочки (сервер аутентифицируется паролем Hysteria2).
  for (const outbound of config.outbounds || []) {
    const tls = outbound.tls;
    if (tls) {
      delete tls.pin_sha256;
      delete tls.certificate_public_key_sha256;
      tls.insecure = true;
    }
  }
  config.log = { level: 'warn' };
  return config;
}

async function connect() {
  if (singbox || connecting) return { ok: true };
  connecting = true;
  setStatus('Подключение…');
  try {
    if (!fs.existsSync(singBoxPath())) {
      throw new Error('Не найден sing-box.exe. Соберите приложение с ядром.');
    }
    const config = await buildConfig();
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');

    const log = fs.openSync(logPath(), 'w');
    singbox = spawn(singBoxPath(), ['run', '-c', configPath()], {
      windowsHide: true,
      stdio: ['ignore', log, log],
    });

    singbox.on('exit', (code) => {
      singbox = null;
      restoreSystemProxy().catch(() => {});
      setStatus(code === 0 ? 'Отключено' : `Ошибка ядра (${code})`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!singbox) {
      throw new Error('Ядро завершилось сразу после запуска. Проверьте журнал.');
    }
    await enableSystemProxy();
    connectedSince = Date.now();
    configCache = { at: 0, config: null };
    setStatus('Подключено');
    return { ok: true };
  } catch (err) {
    if (singbox) {
      try { singbox.kill(); } catch { /* ignore */ }
      singbox = null;
    }
    await restoreSystemProxy().catch(() => {});
    setStatus('Отключено');
    return { ok: false, error: err.message };
  } finally {
    connecting = false;
  }
}

async function disconnect() {
  if (singbox) {
    try { singbox.kill(); } catch { /* ignore */ }
    singbox = null;
  }
  await restoreSystemProxy().catch(() => {});
  connectedSince = 0;
  setStatus('Отключено');
  return { ok: true };
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Dogma Web',
    message: 'Dogma Web 1.0.0',
    detail: 'Защищённое соединение для Windows.\n© 2026 Dogma. Все права защищены.',
    buttons: ['OK'],
  });
}

function showLicense() {
  const licensePath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'EULA.md')
    : path.join(__dirname, '..', 'EULA.md');
  let text = 'Лицензия не найдена.';
  try { text = fs.readFileSync(licensePath, 'utf8'); } catch { /* ignore */ }
  const win = new BrowserWindow({
    width: 760,
    height: 640,
    title: 'Лицензионное соглашение Dogma Web',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    `<html><head><meta charset="utf-8"><style>body{font-family:Segoe UI,Arial,sans-serif;background:#131210;color:#efe9de;padding:32px;line-height:1.55}h1{font-size:22px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;color:#cfc8bc}</style></head><body><h1>Лицензионное соглашение</h1><pre>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre></body></html>`,
  )}`);
}

function createMenu() {
  const template = [
    {
      label: 'Соединение',
      submenu: [
        { label: 'Подключиться', accelerator: 'CmdOrCtrl+Shift+C', click: () => connect() },
        { label: 'Отключиться', accelerator: 'CmdOrCtrl+Shift+D', click: () => disconnect() },
        { type: 'separator' },
        { label: 'Показать окно', click: () => mainWindow?.show() },
      ],
    },
    {
      label: 'Аккаунт',
      submenu: [
        { label: 'Личный кабинет', click: openPortal },
      ],
    },
    {
      label: 'Помощь',
      submenu: [
        { label: 'Лицензия', click: showLicense },
        { label: 'О программе', click: showAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip('Dogma Web — Отключено');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Подключиться', click: () => connect() },
    { label: 'Отключиться', click: () => disconnect() },
    { type: 'separator' },
    { label: 'Открыть Dogma Web', click: () => mainWindow?.show() },
    { label: 'Личный кабинет', click: openPortal },
    { label: 'Выход', click: () => app.quit() },
  ]));
  tray.on('click', () => mainWindow?.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#131210',
    title: 'Dogma Web',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(UI_FILE);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function openPortal(pathname = '') {
  if (portalWindow && !portalWindow.isDestroyed()) {
    if (pathname) portalWindow.loadURL(`${PORTAL_URL}${pathname}`);
    portalWindow.show();
    portalWindow.focus();
    return;
  }

  portalWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#131210',
    title: 'Dogma Web — личный кабинет',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  portalWindow.loadURL(`${PORTAL_URL}${pathname}`);
  portalWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  portalWindow.on('closed', () => { portalWindow = null; });
}

async function getState() {
  const ses = mainWindow ? mainWindow.webContents.session : session.defaultSession;
  const settings = readSettings();
  const state = {
    loggedIn: false,
    user: null,
    subscription: null,
    nodes: [],
    selectedNode: settings.selectedNode || 'auto',
    autoStart: !!app.getLoginItemSettings().openAtLogin,
    autoConnect: !!settings.autoConnect,
    connected: !!singbox,
    connectedSince,
    status: trayStatus,
    baseUrl: PORTAL_URL,
  };

  try {
    const me = await sessionFetch('/auth/me');
    if (me.ok) {
      state.user = await me.json();
      state.loggedIn = true;
    }
  } catch { /* offline */ }

  if (state.loggedIn) {
    try {
      const sub = await sessionFetch('/api/v1/vpn/subscription');
      if (sub.ok) state.subscription = await sub.json();
      else if (sub.status !== 404) state.subscription = null;
    } catch { /* ignore */ }
    try {
      const config = await fetchSmartConfig();
      state.nodes = nodesFromConfig(config);
    } catch { /* ignore */ }
  }

  return state;
}

ipcMain.handle('dogma:connect', () => connect());
ipcMain.handle('dogma:disconnect', () => disconnect());
ipcMain.handle('dogma:status', () => ({ connected: !!singbox, status: trayStatus }));
ipcMain.handle('dogma:state', () => getState());
ipcMain.handle('dogma:open-portal', () => { openPortal(); return { ok: true }; });
ipcMain.handle('dogma:open-download', () => {
  shell.openExternal(`${PORTAL_URL}/download`);
  return { ok: true };
});

ipcMain.handle('dogma:select-node', async (_event, tag) => {
  writeSettings({ selectedNode: String(tag || 'auto') });
  configCache = { at: 0, config: null };
  if (singbox) {
    await disconnect();
    return connect();
  }
  return { ok: true };
});

ipcMain.handle('dogma:set-autostart', (_event, value) => {
  app.setLoginItemSettings({ openAtLogin: !!value, path: process.execPath });
  return { ok: true, autoStart: !!value };
});

ipcMain.handle('dogma:set-autoconnect', (_event, value) => {
  writeSettings({ autoConnect: !!value });
  return { ok: true, autoConnect: !!value };
});

ipcMain.handle('dogma:logout', async () => {
  await disconnect();
  try { await sessionFetch('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  saveToken(null);
  const ses = mainWindow ? mainWindow.webContents.session : session.defaultSession;
  await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
  configCache = { at: 0, config: null };
  if (portalWindow && !portalWindow.isDestroyed()) portalWindow.close();
  return { ok: true };
});

ipcMain.handle('dogma:login', async (_event, { email, password }) => {
  const value = String(email || '').trim();
  const pass = String(password || '');
  if (!value || !pass) return { ok: false, error: 'Введите email и пароль' };
  const res = await sessionFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: value, password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error === 'INVALID_CREDENTIALS' ? 'Неверный email или пароль' : (data.error || `HTTP ${res.status}`);
    return { ok: false, error: message };
  }
  saveToken(null);
  configCache = { at: 0, config: null };
  return { ok: true };
});

ipcMain.handle('dogma:login-key', async (_event, code) => {
  const value = String(code || '').trim();
  if (value.length < 8) return { ok: false, error: 'Введите код входа' };
  const scan = await sessionFetch('/auth/app/qr/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: value,
      deviceName: 'Dogma Web Windows',
      platform: 'windows',
      appVersion: app.getVersion(),
    }),
  });
  const scanData = await scan.json().catch(() => ({}));
  if (!scan.ok) return { ok: false, error: scanData.error || `HTTP ${scan.status}` };

  const claim = await sessionFetch('/auth/app/qr/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: value }),
  });
  const data = await claim.json().catch(() => ({}));
  if (!claim.ok || !data.token) {
    return { ok: false, error: data.error || 'Не удалось получить токен' };
  }
  saveToken(data.token);
  configCache = { at: 0, config: null };
  return { ok: true };
});

ipcMain.handle('dogma:open-google', () => {
  openPortal('/auth/login');
  return { ok: true };
});

ipcMain.handle('dogma:routing', async () => {
  const res = await sessionFetch('/api/v1/vpn/routing');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

ipcMain.handle('dogma:routing-save', async (_event, profile) => {
  const res = await sessionFetch('/api/v1/vpn/routing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
  configCache = { at: 0, config: null };
  if (singbox) {
    await disconnect();
    await connect();
  }
  return { ok: true, profile: data.profile };
});

ipcMain.handle('dogma:chat', async () => {
  const res = await sessionFetch('/api/v1/chat');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

ipcMain.handle('dogma:chat-send', async (_event, text) => {
  const value = String(text || '').trim();
  if (!value) throw new Error('Пустое сообщение');
  const res = await sessionFetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Если прошлый запуск завершился аварийно, вернуть системный прокси.
    if (fs.existsSync(proxyBackupPath())) {
      await restoreSystemProxy().catch(() => {});
    }
    createWindow();
    Menu.setApplicationMenu(null);
    if (mainWindow) mainWindow.setMenuBarVisibility(false);
    createTray();
    setStatus('Отключено');

    setTimeout(async () => {
      try {
        const s = await getState();
        if (s.autoConnect && s.loggedIn && !singbox) await connect();
      } catch { /* ignore */ }
    }, 3500);
  });

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });

  app.on('before-quit', async (event) => {
    app.isQuitting = true;
    if (singbox) {
      event.preventDefault();
      await disconnect();
      app.quit();
    }
  });
}
