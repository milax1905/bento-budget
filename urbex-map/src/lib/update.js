// Mise à jour de l'app (PWA). iOS garde parfois l'ancien service worker /
// l'ancien app-shell en cache bien après un déploiement : on compare donc la
// version LOCALE (constants) à la version SERVEUR (/api/ping, no-store) et,
// si elles diffèrent, on propose une mise à jour FORCÉE : désinscription des
// service workers + purge des caches (app-shell, PAS les données — spots,
// IndexedDB et réglages sont intacts) + rechargement réseau.

export async function fetchServerVersion(signal) {
  try {
    const r = await fetch('/api/ping', { cache: 'no-store', signal })
    if (!r.ok) return null
    const d = await r.json()
    return typeof d?.version === 'string' ? d.version : null
  } catch {
    return null
  }
}

// Demande aussi au navigateur de re-vérifier le service worker (chemin doux).
export async function checkSwUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.update().catch(() => {})))
  } catch {
    /* SW indisponible (navigation privée…) */
  }
}

// Chemin dur : garantit la prochaine ouverture sur la dernière version.
export async function forceAppUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})))
  } catch {
    /* pas de SW */
  }
  try {
    const keys = (await caches?.keys?.()) || []
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})))
  } catch {
    /* API caches indisponible */
  }
  window.location.reload()
}
