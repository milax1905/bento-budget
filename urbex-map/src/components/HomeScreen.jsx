import { useMemo } from 'react'
import {
  Settings,
  Users,
  Cloud,
  CloudOff,
  Plus,
  Radar,
  Star,
  ChevronRight,
  AlertTriangle,
  Compass,
  TrendingUp,
} from 'lucide-react'
import { STATUSES, APP_VERSION, categoryById, statusById } from '../lib/constants'
import { distanceKm, formatDistance } from '../lib/geo'
import { useStore } from '../lib/store'

function StatTile({ color, label, value }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-900/50 px-3.5 py-3">
      <span className="absolute right-0 top-0 h-full w-1 rounded-full opacity-80" style={{ background: color }} />
      <div className="text-2xl font-bold tabular-nums text-zinc-50">{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
    </div>
  )
}

function SpotRow({ spot, userPos, onClick }) {
  const cat = categoryById(spot.category)
  const st = statusById(spot.status)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5 active:bg-white/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/70 text-xl">
        {cat.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-zinc-100">
          {spot.favorite && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
          <span className="truncate">{spot.name}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
            {st.label}
          </span>
          {spot.danger >= 4 && <AlertTriangle size={11} className="text-rose-400" />}
          {userPos && <span>· {formatDistance(distanceKm(userPos, { lat: spot.lat, lng: spot.lng }))}</span>}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-zinc-600" />
    </button>
  )
}

export default function HomeScreen({ onSelectSpot, onAdd, onOpenDiscover, onOpenSettings, onOpenTeam, userPos }) {
  const { spots, mode, profileName } = useStore()

  const counts = useMemo(() => {
    const c = {}
    for (const s of spots) c[s.status] = (c[s.status] || 0) + 1
    return c
  }, [spots])

  const favorites = useMemo(() => spots.filter((s) => s.favorite), [spots])
  const recent = useMemo(
    () => [...spots].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5),
    [spots],
  )
  const doneCount = counts.fait || 0
  const progress = spots.length ? Math.round((doneCount / spots.length) * 100) : 0

  return (
    <div className="app-bg screen-in pt-safe absolute inset-0 z-[1500] overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-3">
        {/* Barre d'application */}
        <header className="flex items-center gap-3 py-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/15 text-xl shadow-[0_0_18px_-4px_rgba(168,92,247,0.6)]">
            🏚️
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="neon-title text-lg font-extrabold tracking-tight">URBEX ATLAS</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              {mode === 'cloud' ? (
                <>
                  <Cloud size={11} className="text-emerald-400" />
                  <span>Synchro active{profileName ? ` · ${profileName}` : ''}</span>
                </>
              ) : (
                <>
                  <CloudOff size={11} className="text-amber-400" />
                  <span>Mode local</span>
                </>
              )}
            </div>
          </div>
          {mode === 'cloud' && (
            <button
              onClick={onOpenTeam}
              title="Équipe & invitations"
              className="rounded-xl border border-white/8 bg-zinc-900/60 p-2.5 text-zinc-400 transition hover:text-zinc-100"
            >
              <Users size={17} />
            </button>
          )}
          <button
            onClick={onOpenSettings}
            title="Réglages"
            className="rounded-xl border border-white/8 bg-zinc-900/60 p-2.5 text-zinc-400 transition hover:text-zinc-100"
          >
            <Settings size={17} />
          </button>
        </header>

        {/* Bloc « progression d'exploration » */}
        <section className="neon-panel glow-violet mt-4 overflow-hidden rounded-3xl p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tabular-nums text-white">{spots.length}</span>
                <span className="text-sm font-medium text-zinc-400">
                  lieu{spots.length > 1 ? 'x' : ''} au total
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-lime-300/90">
                <TrendingUp size={13} />
                {doneCount} exploré{doneCount > 1 ? 's' : ''} · {progress}%
              </div>
            </div>
            <Compass size={40} className="text-violet-300/40" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-lime-400 transition-all duration-500"
              style={{ width: `${Math.max(progress, spots.length ? 4 : 0)}%` }}
            />
          </div>
        </section>

        {/* Tuiles par statut */}
        <section className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STATUSES.map((st) => (
            <StatTile key={st.id} color={st.color} label={st.label} value={counts[st.id] || 0} />
          ))}
        </section>

        {/* Actions rapides */}
        <section className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            onClick={onAdd}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_-8px_rgba(168,92,247,0.7)] transition active:scale-95"
          >
            <Plus size={18} strokeWidth={2.6} /> Nouveau spot
          </button>
          <button
            onClick={onOpenDiscover}
            className="flex items-center justify-center gap-2 rounded-2xl border border-lime-400/30 bg-lime-400/10 px-4 py-3.5 text-sm font-bold text-lime-200 transition hover:bg-lime-400/15 active:scale-95"
          >
            <Radar size={18} /> Découvrir
          </button>
        </section>

        {/* Prochaine sortie (favoris) */}
        {favorites.length > 0 && (
          <section className="mt-6">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-200">Prochaine sortie</h2>
              <span className="text-[11px] text-zinc-500">{favorites.length}</span>
            </div>
            <div className="rounded-2xl border border-white/8 bg-zinc-900/40 p-1.5">
              {favorites.slice(0, 6).map((s) => (
                <SpotRow key={s.id} spot={s} userPos={userPos} onClick={() => onSelectSpot(s.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Derniers ajouts */}
        <section className="mt-6">
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <h2 className="text-sm font-bold text-zinc-200">Derniers lieux</h2>
          </div>
          {recent.length > 0 ? (
            <div className="rounded-2xl border border-white/8 bg-zinc-900/40 p-1.5">
              {recent.map((s) => (
                <SpotRow key={s.id} spot={s} userPos={userPos} onClick={() => onSelectSpot(s.id)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <Compass size={30} className="text-violet-300/50" />
              <p className="text-sm text-zinc-400">
                Aucun lieu pour l'instant.
                <br />
                Ajoute ton premier spot ou lance une recherche.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onAdd}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-bold text-white transition active:scale-95"
                >
                  <Plus size={14} strokeWidth={2.6} /> Spot
                </button>
                <button
                  onClick={onOpenDiscover}
                  className="flex items-center gap-1.5 rounded-xl border border-lime-400/30 bg-lime-400/10 px-3.5 py-2 text-xs font-bold text-lime-200 transition active:scale-95"
                >
                  <Radar size={14} /> Découvrir
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-[11px] text-zinc-600">Urbex Atlas · v{APP_VERSION}</p>
      </div>
    </div>
  )
}
