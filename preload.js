const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bento', {
  onUpdateEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  }
});