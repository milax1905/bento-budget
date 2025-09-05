// preload.js — expose uniquement ce qui est nécessaire au renderer
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Petit helper: invoke sécurisé (évite de planter le renderer si ça throw côté main)
 */
async function safeInvoke(channel, payload) {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

contextBridge.exposeInMainWorld("bento", {
  // Infos application (version, plateforme, etc.)
  app: {
    getInfo: () => safeInvoke("app:getInfo"),
  },

  /**
   * Écoute les événements d'auto-update envoyés par le main:
   *  - checking / available / none / progress / downloaded / error
   *
   * @param {(evt: {type:string, [key:string]:any}) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onUpdateEvent: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, data) => {
      try {
        callback(data);
      } catch (err) {
        // ne bloque jamais le thread UI
        console.error("[bento.onUpdateEvent] callback error:", err);
      }
    };
    ipcRenderer.on("update:event", handler);
    // renvoie une fonction pour se désabonner (important pour éviter les doublons)
    return () => ipcRenderer.removeListener("update:event", handler);
  },

  // Actions d’auto-update déclenchées depuis le renderer
  update: {
    check: () => safeInvoke("update:check"),
    download: () => safeInvoke("update:download"),
    install: () => safeInvoke("update:install"), // ne redémarre que quand l'UI le demande
  },
});