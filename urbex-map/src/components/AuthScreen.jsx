import { useState } from 'react'
import { LogIn, UserPlus, Loader2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { getConfig, clearStoredConfig } from '../lib/supabase'

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

  const backToLocal = () => {
    clearStoredConfig()
    window.location.reload()
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
