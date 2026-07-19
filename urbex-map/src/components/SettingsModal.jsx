import { useState } from 'react'
import { X, Cloud, CloudOff, ExternalLink } from 'lucide-react'
import { useStore } from '../lib/store'
import { getConfig, saveStoredConfig, clearStoredConfig } from '../lib/supabase'

export default function SettingsModal({ onClose }) {
  const { mode, user, profileName, showToast } = useStore()
  const config = getConfig()
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')

  const activate = () => {
    const u = url.trim().replace(/\/+$/, '')
    const k = anonKey.trim()
    if (!/^https:\/\/.+\.supabase\.co$/.test(u)) {
      showToast('URL invalide — elle ressemble à https://xxxx.supabase.co', 'error')
      return
    }
    if (k.length < 30) {
      showToast('Clé invalide — copie la clé « anon / public »', 'error')
      return
    }
    saveStoredConfig(u, k)
    window.location.reload()
  }

  const deactivate = () => {
    clearStoredConfig()
    window.location.reload()
  }

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          {mode === 'cloud' ? (
            <Cloud size={18} className="text-emerald-400" />
          ) : (
            <CloudOff size={18} className="text-amber-400" />
          )}
          <h2 className="flex-1 text-base font-bold text-zinc-100">Synchro & collaboration</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-zinc-300">
          {mode === 'cloud' ? (
            <>
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">
                ✅ Synchro active — les spots sont partagés en temps réel entre tous les comptes.
              </p>
              {user && (
                <p className="text-xs text-zinc-500">
                  Connecté en tant que <span className="font-medium text-zinc-300">{profileName}</span> ({user.email})
                </p>
              )}
              <p className="text-xs leading-relaxed text-zinc-500">
                Pour inviter ton cousin : envoie-lui le lien de l'app{config?.source === 'app' ? ' ainsi que l\'URL et la clé Supabase ci-dessous à coller dans ses réglages' : ''}, il crée son compte et voit
                instantanément la même carte.
              </p>
              {config?.source === 'app' && (
                <>
                  <div className="rounded-xl bg-zinc-800/60 p-3 font-mono text-[10px] text-zinc-400">
                    <p className="break-all">URL : {config.url}</p>
                    <p className="mt-1 break-all">Clé : {config.anonKey.slice(0, 24)}…</p>
                  </div>
                  <button
                    onClick={deactivate}
                    className="w-full rounded-xl bg-zinc-800/70 py-2.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15"
                  >
                    Désactiver la synchro (repasser en local)
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-zinc-400">
                L'app fonctionne actuellement en <span className="font-semibold text-amber-300">mode local</span> :
                les spots sont enregistrés uniquement dans ce navigateur. Pour collaborer avec ton cousin en temps
                réel, active la synchro (gratuit, ~10 min) :
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-zinc-400">
                <li>
                  Crée un projet gratuit sur{' '}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-amber-300 underline"
                  >
                    supabase.com <ExternalLink size={10} />
                  </a>
                </li>
                <li>
                  Dans l'éditeur SQL du projet, exécute le script{' '}
                  <code className="rounded bg-zinc-800 px-1 py-0.5 text-[10px]">supabase/schema.sql</code> fourni avec
                  l'app (voir README).
                </li>
                <li>
                  Copie ici l'<span className="text-zinc-200">URL du projet</span> et la clé{' '}
                  <span className="text-zinc-200">anon / public</span> (Settings → API) :
                </li>
              </ol>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
              />
              <input
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="Clé anon (eyJhbGciOi…)"
                className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
              />
              <button
                onClick={activate}
                className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
              >
                Activer la synchro
              </button>
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Les spots déjà créés en local ne sont pas perdus : exporte-les en JSON avant, puis réimporte-les une
                fois connecté. Ton cousin colle la même URL et la même clé sur son appareil.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
