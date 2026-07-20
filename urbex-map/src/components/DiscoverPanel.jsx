import { Radar, X, Loader2, Plus, Check, LocateFixed, ExternalLink, RefreshCw } from 'lucide-react'
import { categoryById } from '../lib/constants'
import { formatDistance } from '../lib/geo'

export default function DiscoverPanel({
  discover,
  onClose,
  onRadius,
  onSearch,
  onAdd,
  onSelect,
  onRecenter,
  locating,
}) {
  const { radiusKm, status, results, error, center } = discover

  return (
    <div className="glass pointer-events-auto pt-safe pb-safe flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Radar size={18} className="text-violet-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-zinc-100">Découvrir</h2>
          <p className="text-[11px] text-zinc-500">Lieux abandonnés autour d'un point (OpenStreetMap)</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* Réglages de recherche */}
      <div className="space-y-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between rounded-xl bg-zinc-800/50 px-3 py-2.5 text-xs">
          <span className="font-mono text-zinc-300">
            {center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : '—'}
          </span>
          <button
            onClick={onRecenter}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-700/60 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-zinc-600/60"
          >
            <LocateFixed size={12} /> {locating ? '…' : 'Ma position'}
          </button>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Rayon</span>
            <span className="text-violet-300">{radiusKm} km</span>
          </label>
          <input
            type="range"
            min="1"
            max="30"
            value={radiusKm}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="w-full accent-violet-400"
          />
        </div>
        <button
          onClick={onSearch}
          disabled={status === 'loading' || !center}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Recherche…
            </>
          ) : (
            <>
              <Radar size={15} /> Chercher dans {radiusKm} km
            </>
          )}
        </button>
      </div>

      {/* Résultats */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {status === 'idle' && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Choisis un rayon et lance la recherche pour voir les lieux abandonnés référencés autour.
          </p>
        )}
        {status === 'error' && (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            <p>{error || 'Recherche impossible.'}</p>
            <button
              onClick={onSearch}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-3 py-2 text-xs text-zinc-300"
            >
              <RefreshCw size={13} /> Réessayer
            </button>
          </div>
        )}
        {status === 'done' && results.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Aucun lieu abandonné référencé dans ce rayon. Élargis la zone, ou explore par toi-même : tout n'est pas
            dans OpenStreetMap 😉
          </p>
        )}
        {status === 'done' && results.length > 0 && (
          <p className="px-3 pb-1 pt-1 text-[11px] text-zinc-500">
            {results.length} lieu{results.length > 1 ? 'x' : ''} trouvé{results.length > 1 ? 's' : ''} · à vérifier
            sur place
          </p>
        )}
        {results.map((r) => {
          const cat = categoryById(r.category)
          return (
            <div
              key={r.id}
              className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-zinc-800/70"
            >
              <button onClick={() => onSelect(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="text-xl">{cat.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{r.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{formatDistance(r.distanceKm)}</span>
                    <span className="truncate font-mono text-[10px] text-zinc-600">{r.tagline}</span>
                  </span>
                </span>
              </button>
              <a
                href={r.osmUrl}
                target="_blank"
                rel="noreferrer"
                title="Voir sur OpenStreetMap"
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-700/60 hover:text-zinc-300"
              >
                <ExternalLink size={13} />
              </a>
              <button
                onClick={() => onAdd(r)}
                title="Ajouter à ma carte"
                className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/30"
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] leading-snug text-zinc-600">
          <Check size={10} /> Les lieux ajoutés arrivent en statut « Repéré » — vérifie l'accès et la légalité avant
          d'y aller.
        </p>
      </div>
    </div>
  )
}
