import { useState } from 'react'
import { X, Users, UserPlus, Trash2, Crown } from 'lucide-react'
import { useStore } from '../lib/store'

export default function TeamModal({ onClose }) {
  const { members, addMember, removeMember, userEmail } = useStore()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)

  const invite = async (e) => {
    e.preventDefault()
    setBusy(true)
    const ok = await addMember(email)
    setBusy(false)
    if (ok) setEmail('')
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
          <Users size={18} className="text-amber-300" />
          <h2 className="flex-1 text-base font-bold text-zinc-100">Équipe</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-zinc-400">
            Seules les personnes listées ici voient et modifient votre carte. Ajoute l'email de ton cousin : il
            pourra se connecter (email ou Google) et verra vos spots aussitôt.
          </p>

          <form onSubmit={invite} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.fr"
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              <UserPlus size={15} /> Inviter
            </button>
          </form>

          <div className="space-y-1.5">
            {members.length === 0 && (
              <p className="py-3 text-center text-xs text-zinc-500">Aucun membre chargé.</p>
            )}
            {members.map((m) => {
              const isMe = m.email.toLowerCase() === userEmail.toLowerCase()
              return (
                <div
                  key={m.email}
                  className="flex items-center gap-2 rounded-xl bg-zinc-800/50 px-3 py-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold uppercase text-amber-300">
                    {m.email[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm text-zinc-100">
                      {m.email}
                      {isMe && <span className="text-[10px] text-zinc-500">(toi)</span>}
                      {m.added_by === 'bootstrap' && <Crown size={11} className="text-amber-400" />}
                    </span>
                  </span>
                  {!isMe &&
                    (confirmRemove === m.email ? (
                      <button
                        onClick={() => {
                          removeMember(m.email)
                          setConfirmRemove(null)
                        }}
                        className="rounded-lg bg-rose-500/80 px-2.5 py-1.5 text-[11px] font-medium text-white"
                      >
                        Retirer ?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(m.email)}
                        className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    ))}
                </div>
              )
            })}
          </div>

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Astuce : retirer un membre lui coupe immédiatement l'accès à la carte.
          </p>
        </div>
      </div>
    </div>
  )
}
