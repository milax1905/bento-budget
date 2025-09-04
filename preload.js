// preload.js — expose la version + events d'auto-update
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bento', {
  // Récupérer les infos de l'app (version, plateforme…)
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo')
  },

  // Permet d'écouter les événements liés aux mises à jour
  onUpdateEvent: (callback) => {
    ipcRenderer.on('update:event', (_event, data) => callback(data));
  },

  // Actions déclenchées depuis le renderer
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
  }
});