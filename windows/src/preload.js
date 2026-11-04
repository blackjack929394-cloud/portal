const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dogmaDesktop', {
  getState: () => ipcRenderer.invoke('dogma:state'),
  connect: () => ipcRenderer.invoke('dogma:connect'),
  disconnect: () => ipcRenderer.invoke('dogma:disconnect'),
  openPortal: () => ipcRenderer.invoke('dogma:open-portal'),
  openGoogle: () => ipcRenderer.invoke('dogma:open-google'),
  login: (email, password) => ipcRenderer.invoke('dogma:login', { email, password }),
  loginKey: (code) => ipcRenderer.invoke('dogma:login-key', code),
  selectNode: (tag) => ipcRenderer.invoke('dogma:select-node', tag),
  setAutoStart: (value) => ipcRenderer.invoke('dogma:set-autostart', value),
  setAutoConnect: (value) => ipcRenderer.invoke('dogma:set-autoconnect', value),
  logout: () => ipcRenderer.invoke('dogma:logout'),
  getChat: () => ipcRenderer.invoke('dogma:chat'),
  sendChat: (text) => ipcRenderer.invoke('dogma:chat-send', text),
  getRouting: () => ipcRenderer.invoke('dogma:routing'),
  saveRouting: (profile) => ipcRenderer.invoke('dogma:routing-save', profile),
  onStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('dogma:vpn-status', handler);
    return () => ipcRenderer.removeListener('dogma:vpn-status', handler);
  },
});
