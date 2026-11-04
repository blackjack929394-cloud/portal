const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dogmaDesktop', {
  connect: () => ipcRenderer.invoke('dogma:connect'),
  disconnect: () => ipcRenderer.invoke('dogma:disconnect'),
  status: () => ipcRenderer.invoke('dogma:status'),
  onStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('dogma:vpn-status', handler);
    return () => ipcRenderer.removeListener('dogma:vpn-status', handler);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dogma-desktop-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'dogma-desktop-bar';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span id="dogma-dot" style="width:7px;height:7px;border-radius:50%;background:#8a847a;flex:none;"></span>
      <span style="font:500 12px/1.2 'Segoe UI',Arial,sans-serif;color:#efe9de;white-space:nowrap;">Dogma Web</span>
      <span id="dogma-status" style="font:12px/1.2 'Segoe UI',Arial,sans-serif;color:#aaa398;white-space:nowrap;">Отключено</span>
    </div>
    <div style="display:flex;gap:6px;margin-left:12px;">
      <button id="dogma-connect" style="height:30px;padding:0 12px;border-radius:7px;border:1px solid #efe9de;background:#efe9de;color:#14120f;font:600 11px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Подключиться</button>
      <button id="dogma-disconnect" style="height:30px;padding:0 12px;border-radius:7px;border:1px solid rgba(239,233,222,.14);background:transparent;color:#efe9de;font:500 11px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Отключиться</button>
    </div>
  `;
  Object.assign(bar.style, {
    position: 'fixed',
    left: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: '12px',
    background: '#1b1917',
    border: '1px solid rgba(239,233,222,.12)',
    boxShadow: '0 8px 24px rgba(0,0,0,.45)',
    fontFamily: "'Segoe UI', Arial, sans-serif",
  });
  document.body.appendChild(bar);

  const dot = bar.querySelector('#dogma-dot');
  const status = bar.querySelector('#dogma-status');
  const apply = (payload) => {
    if (!payload) return;
    status.textContent = payload.status || (payload.connected ? 'Подключено' : 'Отключено');
    dot.style.background = payload.connected ? '#63b184' : '#8a847a';
  };

  bar.querySelector('#dogma-connect').addEventListener('click', async () => {
    status.textContent = 'Подключение…';
    const res = await window.dogmaDesktop.connect();
    if (res && res.ok === false) {
      status.textContent = res.error || 'Ошибка';
      dot.style.background = '#d9776e';
    }
  });
  bar.querySelector('#dogma-disconnect').addEventListener('click', async () => {
    await window.dogmaDesktop.disconnect();
  });

  window.dogmaDesktop.onStatus(apply);
  window.dogmaDesktop.status().then(apply).catch(() => {});
});
