const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const PORTAL_URL = process.env.DOGMA_PORTAL_URL || 'https://192-144-56-63.sslip.io';
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 2080;
const IS_WIN = process.platform === 'win32';

let mainWindow = null;
let tray = null;
let singbox = null;
let connecting = false;
let trayStatus = 'Отключено';

const userData = () => app.getPath('userData');
const configPath = () => path.join(userData(), 'sing-box.json');
const logPath = () => path.join(userData(), 'sing-box.log');
const proxyBackupPath = () => path.join(userData(), 'proxy-backup.json');

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
  const ses = mainWindow ? mainWindow.webContents.session : session.defaultSession;
  const res = await ses.fetch(`${PORTAL_URL}${pathname}`, { credentials: 'include' });
  if (!res.ok) {
    const err = new Error(res.status === 401 ? 'Сначала войдите в личный кабинет' : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function buildConfig() {
  const sub = await portalJson('/api/v1/vpn/subscription');
  if (!sub || !sub.smartSubscriptionUrl) {
    throw new Error('В подписке нет ссылки с маршрутизацией');
  }
  const ses = mainWindow ? mainWindow.webContents.session : session.defaultSession;
  const res = await ses.fetch(sub.smartSubscriptionUrl, { credentials: 'include' });
  if (!res.ok) throw new Error(`Не удалось получить конфиг: HTTP ${res.status}`);
  const config = await res.json();

  // В Windows-приложении используем локальный mixed-прокси и системный прокси,
  // чтобы не требовать прав администратора для TUN/wintun.
  config.inbounds = (config.inbounds || []).filter((inbound) => inbound.type !== 'tun');
  if (!config.inbounds.some((inbound) => inbound.type === 'mixed')) {
    config.inbounds.push({ type: 'mixed', tag: 'mixed-in', listen: PROXY_HOST, listen_port: PROXY_PORT });
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
        { label: 'Состояние: обновляется', enabled: false, id: 'status' },
      ],
    },
    {
      label: 'Аккаунт',
      submenu: [
        { label: 'Личный кабинет', click: () => mainWindow?.loadURL(PORTAL_URL) },
        { label: 'Скачать Android-клиент', click: () => shell.openExternal(`${PORTAL_URL}/download`) },
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
    { label: 'Открыть личный кабинет', click: () => mainWindow?.show() },
    { label: 'Выход', click: () => app.quit() },
  ]));
  tray.on('click', () => mainWindow?.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
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

  mainWindow.loadURL(PORTAL_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(PORTAL_URL) && !url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

ipcMain.handle('dogma:connect', () => connect());
ipcMain.handle('dogma:disconnect', () => disconnect());
ipcMain.handle('dogma:status', () => ({ connected: !!singbox, status: trayStatus }));

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
    createMenu();
    createTray();
    setStatus('Отключено');
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
