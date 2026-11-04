const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dogmaDesktop', {
  getState: () => ipcRenderer.invoke('dogma:state'),
  connect: () => ipcRenderer.invoke('dogma:connect'),
  disconnect: () => ipcRenderer.invoke('dogma:disconnect'),
  openPortal: () => ipcRenderer.invoke('dogma:open-portal'),
  selectNode: (tag) => ipcRenderer.invoke('dogma:select-node', tag),
  setAutoStart: (value) => ipcRenderer.invoke('dogma:set-autostart', value),
  setAutoConnect: (value) => ipcRenderer.invoke('dogma:set-autoconnect', value),
  logout: () => ipcRenderer.invoke('dogma:logout'),
  getChat: () => ipcRenderer.invoke('dogma:chat'),
  sendChat: (text) => ipcRenderer.invoke('dogma:chat-send', text),
  onStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('dogma:vpn-status', handler);
    return () => ipcRenderer.removeListener('dogma:vpn-status', handler);
  },
});
