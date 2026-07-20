import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { idbGet, idbSet } from './lib/localdb'
import { registerSW } from 'virtual:pwa-register'

// Mise à jour de la PWA : en plus du contrôle au chargement, on revérifie à
// chaque retour au premier plan (iOS met souvent l'app en veille sans
// re-vérifier) et toutes les minutes. En mode autoUpdate, la nouvelle version
// s'installe et la page se recharge automatiquement dès qu'elle est détectée.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => {})
    }
    setInterval(check, 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

// Filet de sécurité : si l'app plante (donnée corrompue, bug…), on affiche un
// écran de récupération au lieu d'une page noire, avec de quoi sauvegarder
// ses spots avant toute réinitialisation.
class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  exportLocal = async () => {
    try {
      let spots = null
      try {
        spots = await idbGet('urbex-atlas:spots')
      } catch {
        /* IndexedDB indisponible : repli localStorage */
      }
      const raw = Array.isArray(spots)
        ? JSON.stringify(spots)
        : localStorage.getItem('urbex-atlas:spots') || '[]'
      const blob = new Blob([raw], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'urbex-atlas-sauvegarde.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* rien à sauvegarder */
    }
  }

  resetLocal = async () => {
    try {
      await idbSet('urbex-atlas:spots', [])
    } catch {
      /* IndexedDB indisponible */
    }
    localStorage.removeItem('urbex-atlas:spots')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
        <span className="text-4xl">😵</span>
        <h1 className="text-lg font-bold">Oups, l'app a rencontré un problème</h1>
        <p className="max-w-md break-words text-xs text-zinc-500">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950"
          >
            Recharger
          </button>
          <button
            onClick={this.exportLocal}
            className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200"
          >
            Sauvegarder mes spots (JSON)
          </button>
          <button
            onClick={this.resetLocal}
            className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-rose-300"
          >
            Réinitialiser les données locales
          </button>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
