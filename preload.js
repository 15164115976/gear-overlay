const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  boot: () => ipcRenderer.invoke('boot'),
  save: (s) => ipcRenderer.send('state:save', s),
  setFocusable: (v) => ipcRenderer.send('win:focusable', v),
  setZoom: (z) => ipcRenderer.send('win:zoom', z),
  collapse: (v) => ipcRenderer.send('win:collapse', v),
  dragStart: (x, y) => ipcRenderer.send('win:dragStart', { x, y }),
  inputPing: () => ipcRenderer.send('win:input'),
  dragEnd: () => ipcRenderer.send('win:dragEnd'),
  quit: () => ipcRenderer.send('app:quit'),
  onCollapsed: (cb) => ipcRenderer.on('ui:collapsed', (e, v) => cb(v))
});
