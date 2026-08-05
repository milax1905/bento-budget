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
    <div className="glass-card rounded-2xl px-3.5 py-3">
      <div className="text-2xl font-bold tabular-nums text-zinc-50">{value}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="label-tech">{label}</span>
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
      className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition hover:bg-white/5 active:bg-white/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl ring-1 ring-white/10">
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
      <div className="mx-auto w-full max-w-xl px-4 pb-32 pt-3">
        {/* Barre d'application */}
        <header className="flex items-center gap-3 py-1">
          <div className="glass-card flex h-10 w-10 items-center justify-center rounded-2xl text-xl">🏚️</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold uppercase tracking-[0.24em] text-zinc-100">Urbex Atlas</h1>
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
              className="glass-card rounded-full p-2.5 text-zinc-400 transition hover:text-zinc-100"
            >
              <Users size={17} />
            </button>
          )}
          <button
            onClick={onOpenSettings}
            title="Réglages"
            className="glass-card rounded-full p-2.5 text-zinc-400 transition hover:text-zinc-100"
          >
            <Settings size={17} />
          </button>
        </header>

        {/* Bloc « progression d'exploration » */}
        <section className="glass-card mt-4 overflow-hidden rounded-3xl p-5">
          <div className="label-tech">Exploration</div>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tabular-nums text-zinc-50">{spots.length}</span>
                <span className="text-sm font-medium text-zinc-400">
                  lieu{spots.length > 1 ? 'x' : ''} au total
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-indigo-300">
                <TrendingUp size={13} />
                {doneCount} exploré{doneCount > 1 ? 's' : ''} · {progress}%
              </div>
            </div>
            <Compass size={40} className="text-indigo-300/25" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-violet-400 transition-all duration-500"
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
        <section className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            onClick={onAdd}
            className="glow-soft flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white ring-1 ring-white/25 transition hover:brightness-110 active:scale-95"
          >
            <Plus size={18} strokeWidth={2.6} /> Nouveau spot
          </button>
          <button
            onClick={onOpenDiscover}
            className="glass-card flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold text-zinc-100 transition hover:bg-white/10 active:scale-95"
          >
            <Radar size={18} className="text-indigo-300" /> Découvrir
          </button>
        </section>

        {/* Prochaine sortie (favoris) */}
        {favorites.length > 0 && (
          <section className="mt-7">
            <div className="mb-2 flex items-center gap-2 px-1">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <h2 className="label-tech">Prochaine sortie</h2>
              <span className="text-[11px] text-zinc-600">{favorites.length}</span>
            </div>
            <div className="glass-card rounded-3xl p-1.5">
              {favorites.slice(0, 6).map((s) => (
                <SpotRow key={s.id} spot={s} userPos={userPos} onClick={() => onSelectSpot(s.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Derniers ajouts */}
        <section className="mt-7">
          <div className="mb-2 px-1">
            <h2 className="label-tech">Derniers lieux</h2>
          </div>
          {recent.length > 0 ? (
            <div className="glass-card rounded-3xl p-1.5">
              {recent.map((s) => (
                <SpotRow key={s.id} spot={s} userPos={userPos} onClick={() => onSelectSpot(s.id)} />
              ))}
            </div>
          ) : (
            <div className="glass-card flex flex-col items-center gap-3 rounded-3xl px-4 py-10 text-center">
              <Compass size={30} className="text-indigo-300/40" />
              <p className="text-sm text-zinc-400">
                Aucun lieu pour l'instant.
                <br />
                Ajoute ton premier spot ou lance une recherche.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onAdd}
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/25 transition hover:brightness-110 active:scale-95"
                >
                  <Plus size={14} strokeWidth={2.6} /> Spot
                </button>
                <button
                  onClick={onOpenDiscover}
                  className="glass-card flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-zinc-100 transition hover:bg-white/10 active:scale-95"
                >
                  <Radar size={14} className="text-indigo-300" /> Découvrir
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-7 text-center text-[10px] tracking-[0.2em] text-zinc-700">URBEX ATLAS · V{APP_VERSION}</p>
      </div>
    </div>
  )
}
