import { useState } from 'react'
import { MailQuestion, Copy, LogOut, RefreshCw } from 'lucide-react'
import { useStore } from '../lib/store'

export default function GuestScreen() {
  const { userEmail, signOut, showToast } = useStore()
  const [copied, setCopied] = useState(false)

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(userEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Copie impossible', 'error')
    }
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/15">
          <MailQuestion size={30} className="text-amber-300" />
        </div>
        <h1 className="text-xl font-bold text-zinc-100">Invitation requise</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Ton compte est bien connecté, mais tu n'as pas encore été ajouté à l'équipe. Demande à ton binôme de
          t'inviter avec cette adresse :
        </p>

        <button
          onClick={copyEmail}
          className="mx-auto mt-4 flex w-full items-center justify-between gap-2 rounded-xl bg-zinc-800/70 px-4 py-3 text-left transition hover:bg-zinc-700/70"
        >
          <span className="truncate font-mono text-sm text-zinc-100">{userEmail}</span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-300">
            <Copy size={13} /> {copied ? 'Copié !' : 'Copier'}
          </span>
        </button>

        <p className="mt-3 text-xs text-zinc-500">
          Une fois ajouté, appuie sur « Réessayer ». La carte apparaîtra aussitôt.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
          >
            <RefreshCw size={15} /> Réessayer
          </button>
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800/70 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700/70"
          >
            <LogOut size={15} /> Se déconnecter
          </button>
        </div>
      </div>
    </div>
  )
}
