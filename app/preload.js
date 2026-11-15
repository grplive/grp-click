const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('click', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  onSnapshot: (fn) => ipcRenderer.on('snapshot', (_e, s) => fn(s)),
  setOpenAtLogin: (on) => ipcRenderer.send('set-open-at-login', on),
  openPermissions: () => ipcRenderer.send('open-permissions'),
  openDownload: () => ipcRenderer.send('open-download'),
  quit: () => ipcRenderer.send('quit'),
})
