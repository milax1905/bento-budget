import { useState } from 'react'
import { LogIn, UserPlus, Loader2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { getConfig, clearStoredConfig, getSupabase } from '../lib/supabase'

// supabase-js n'ajoute pas la clé API à l'URL /auth/v1/authorize, or certains
// projets Supabase l'exigent (« No API key found in request »). On récupère
// donc l'URL sans rediriger, on y ajoute apikey, puis on redirige nous-mêmes.
async function redirectToGoogle() {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data?.url) throw new Error("Impossible d'ouvrir la connexion Google")
  const url = new URL(data.url)
  if (!url.searchParams.has('apikey')) {
    const key = getConfig()?.anonKey
    if (key) url.searchParams.set('apikey', key)
  }
  window.location.href = url.toString()
}

export default function AuthScreen() {
  const { signIn, signUp } = useStore()
  const [tab, setTab] = useState('login')
  const [pseudo, setPseudo] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const configFromApp = getConfig()?.source === 'app'

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (tab === 'login') {
        await signIn(email.trim(), password)
      } else {
        if (!pseudo.trim()) throw new Error('Choisis un pseudo')
        const { needsConfirmation } = await signUp(email.trim(), password, pseudo.trim())
        if (needsConfirmation) {
          setInfo('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.')
          setTab('login')
        }
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const backToLocal = async () => {
    try {
      await getSupabase()?.auth.signOut()
    } catch {
      /* hors-ligne : le reload suffit */
    }
    clearStoredConfig()
    window.location.reload()
  }

  const signInWithGoogle = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await redirectToGoogle()
      // La page va être redirigée vers Google : on laisse busy actif.
    } catch (err) {
      setError(
        /not enabled|unsupported provider/i.test(err.message || '')
          ? 'Connexion Google non activée sur le projet Supabase (voir README) — utilise l’email en attendant.'
          : err.message
      )
      setBusy(false)
    }
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/15 text-3xl">
            🏚️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Urbex Atlas</h1>
          <p className="mt-1 text-sm text-zinc-500">Votre carte d'exploration partagée</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-zinc-800/60 p-1">
            <button
              onClick={() => setTab('login')}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                tab === 'login' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                tab === 'signup' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === 'signup' && (
              <input
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Pseudo (visible par l'équipe)"
                className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe (6 caractères min.)"
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
            />

            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
            {info && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{info}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : tab === 'login' ? (
                <LogIn size={15} />
              ) : (
                <UserPlus size={15} />
              )}
              {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">ou</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.29 14.29a7.22 7.22 0 0 1 0-4.58v-3.1H1.29a12 12 0 0 0 0 10.78l4-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
              />
            </svg>
            Continuer avec Google
          </button>
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-600">
          Toi et ton cousin créez chacun un compte : vous partagez la même carte,
          synchronisée en temps réel.
        </p>
        {configFromApp && (
          <button
            onClick={backToLocal}
            className="mx-auto mt-3 block text-xs text-zinc-600 underline hover:text-zinc-400"
          >
            Désactiver la synchro et repasser en mode local
          </button>
        )}
      </div>
    </div>
  )
}
