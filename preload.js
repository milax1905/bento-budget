// preload.js — expose uniquement ce qui est nécessaire au renderer
const { contextBridge, ipcRenderer } = require("electron");

// Helper: invoke sécurisé (retourne {ok:false,error} si ça throw côté main)
async function safeInvoke(channel, payload) {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// --- API principale Bento ---
contextBridge.exposeInMainWorld("bento", {
  // Infos application (version, plateforme, etc.)
  app: {
    getInfo: () => safeInvoke("app:getInfo"),
  },

  // Événements d'auto-update envoyés par le main :
  // checking / available / none / progress / downloaded / error
  onUpdateEvent: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, data) => {
      try { callback(data); } catch (err) {
        console.error("[bento.onUpdateEvent] callback error:", err);
      }
    };
    ipcRenderer.on("update:event", handler);
    // unsubscribe pour éviter les doublons
    return () => ipcRenderer.removeListener("update:event", handler);
  },

  // Actions d’auto-update déclenchées depuis le renderer
  update: {
    getState: () => safeInvoke("update:getState"),
    check:     () => safeInvoke("update:check"),
    download:  () => safeInvoke("update:download"),
    install:   () => safeInvoke("update:install"), // l’app redémarre quand l’UI le demande
  },
});

// --- API Google Drive (Cloud) ---
contextBridge.exposeInMainWorld("cloud", {
  signIn: () => safeInvoke("cloud:signIn"),
  signOut: () => safeInvoke("cloud:signOut"),
  save: (filename, json) => safeInvoke("cloud:save", { filename, json }),
  load: (filename) => safeInvoke("cloud:load", { filename }),
});