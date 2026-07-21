import { useState } from 'react'
import { X, Cloud, CloudOff, ExternalLink, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { getConfig, saveStoredConfig, clearStoredConfig, isValidSupabaseUrl, getSupabase } from '../lib/supabase'
import { AI_KEY_LS, getAiKey, setAiKey as persistAiKey, aiKeyProvider } from '../lib/aikey'

export default function SettingsModal({ onClose }) {
  const { mode, user, profileName, showToast } = useStore()
  const config = getConfig()
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [aiKey, setAiKey] = useState(() => getAiKey())

  const saveAiKey = () => {
    const k = aiKey.trim()
    if (k && !aiKeyProvider(k)) {
      showToast('Clé non reconnue — Groq commence par « gsk_ », Claude par « sk-ant- »', 'error')
      return
    }
    persistAiKey(k)
    setAiKey(k)
    showToast(k ? `Clé ${aiKeyProvider(k)} enregistrée sur cet appareil` : 'Clé IA retirée', k ? 'success' : 'info')
  }

  const activate = () => {
    const u = url.trim().replace(/\/+$/, '')
    const k = anonKey.trim()
    if (!isValidSupabaseUrl(u)) {
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

  const deactivate = async () => {
    // Déconnexion d'abord, pour ne pas laisser un jeton de session orphelin
    // dans le localStorage.
    try {
      await getSupabase()?.auth.signOut()
    } catch {
      /* hors-ligne : le reload suffit */
    }
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

          {/* Analyse IA (Découvrir) — clé « apporte ta clé », stockée sur l'appareil */}
          <div className="space-y-2.5 border-t border-white/10 pt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-100">
              <Sparkles size={14} className="text-violet-300" /> Analyse IA (Découvrir)
            </h3>
            <p className="text-xs leading-relaxed text-zinc-400">
              Colle une clé pour activer l'analyse et le tri des lieux par l'IA. Pas besoin de toucher à Vercel — la clé
              reste sur cet appareil. Gratuit avec{' '}
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-violet-300 underline"
              >
                Groq (gsk_…) <ExternalLink size={10} />
              </a>{' '}
              ou payant avec{' '}
              <a
                href="https://platform.claude.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-violet-300 underline"
              >
                Claude (sk-ant-…) <ExternalLink size={10} />
              </a>
              .
            </p>
            <input
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder="gsk_… ou sk-ant-…"
              autoComplete="off"
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none ring-violet-400/50 focus:ring-2"
            />
            <button
              onClick={saveAiKey}
              className="w-full rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400"
            >
              {aiKey.trim() ? 'Enregistrer la clé IA' : 'Retirer la clé IA'}
            </button>
            {aiKeyProvider(aiKey) && (
              <p className="text-[10px] text-emerald-300/80">✅ Clé {aiKeyProvider(aiKey)} — enregistrée sur cet appareil.</p>
            )}
            <p className="text-[10px] leading-relaxed text-zinc-600">
              La clé n'est envoyée qu'à ta propre fonction serveur (pour appeler l'IA) et n'est jamais partagée. Ton
              cousin met sa propre clé sur son appareil.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
