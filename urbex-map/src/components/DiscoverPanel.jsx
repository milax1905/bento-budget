import { useEffect, useState } from 'react'
import {
  Radar,
  X,
  Loader2,
  Plus,
  Check,
  LocateFixed,
  ExternalLink,
  RefreshCw,
  BookOpen,
  Search,
  ChevronDown,
} from 'lucide-react'
import { categoryById } from '../lib/constants'
import { formatDistance } from '../lib/geo'
import { MAX_DISCOVER_RADIUS_KM } from '../lib/discover'
import { fetchWikiSummary, webSearchUrl } from '../lib/wiki'

function DiscoverResult({ r, onAdd, onSelect }) {
  const cat = categoryById(r.category)
  const [open, setOpen] = useState(false)
  const [wiki, setWiki] = useState({ status: 'idle', data: null })

  // Pas de wiki.status dans les dépendances : sinon le setWith('loading')
  // relancerait l'effet, dont le cleanup annulerait sa propre requête.
  useEffect(() => {
    if (!open || !r.wiki) return
    let cancelled = false
    const controller = new AbortController()
    setWiki({ status: 'loading', data: null })
    fetchWikiSummary(r.wiki, { signal: controller.signal })
      .then((data) => {
        if (!cancelled) setWiki({ status: 'done', data })
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') setWiki({ status: 'error', data: null })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, r.wiki])

  return (
    <div className="mb-1 rounded-xl transition hover:bg-zinc-800/50">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => onSelect(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-xl">{cat.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
              {r.notable && (
                <span className="flex shrink-0 items-center gap-0.5 rounded bg-violet-500/25 px-1 py-px text-[9px] font-semibold text-violet-200">
                  <BookOpen size={9} /> Doc.
                </span>
              )}
              <span className="truncate">{r.name}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              <span>{formatDistance(r.distanceKm)}</span>
              <span className="truncate font-mono text-[10px] text-zinc-600">{r.tagline}</span>
            </span>
          </span>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Plus d'infos"
          className={`rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-700/60 hover:text-zinc-300 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <ChevronDown size={15} />
        </button>
        <button
          onClick={() => onAdd(r)}
          title="Ajouter à ma carte"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/30"
        >
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3">
          {r.wiki && wiki.status === 'loading' && (
            <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
              <Loader2 size={13} className="animate-spin" /> recherche d'infos…
            </div>
          )}
          {wiki.status === 'done' && wiki.data && (
            <div className="rounded-lg bg-zinc-900/50 p-2.5">
              <div className="flex gap-2.5">
                {wiki.data.thumbnail && (
                  <img
                    src={wiki.data.thumbnail}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                )}
                <p className="text-[11px] leading-relaxed text-zinc-300 line-clamp-5">{wiki.data.extract}</p>
              </div>
              <a
                href={wiki.data.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
              >
                <BookOpen size={11} /> Lire sur Wikipédia
              </a>
            </div>
          )}
          {r.wiki && wiki.status === 'error' && (
            <p className="py-1 text-[11px] text-zinc-500">Résumé Wikipédia indisponible.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a
              href={webSearchUrl(r.name, r.lat, r.lng)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-zinc-700/60 px-2 py-1.5 text-[11px] text-zinc-200 transition hover:bg-zinc-600/60"
            >
              <Search size={11} /> Rechercher sur le web
            </a>
            <a
              href={r.osmUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-zinc-700/60 px-2 py-1.5 text-[11px] text-zinc-200 transition hover:bg-zinc-600/60"
            >
              <ExternalLink size={11} /> OpenStreetMap
            </a>
            {r.wikidataUrl && !r.wiki && (
              <a
                href={r.wikidataUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-zinc-700/60 px-2 py-1.5 text-[11px] text-zinc-200 transition hover:bg-zinc-600/60"
              >
                <ExternalLink size={11} /> Wikidata
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [docsOnly, setDocsOnly] = useState(false)

  const notableCount = results.filter((r) => r.notable).length
  const shown = docsOnly ? results.filter((r) => r.notable) : results

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
            max={MAX_DISCOVER_RADIUS_KM}
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
          <div className="flex items-center justify-between px-3 pb-1 pt-1">
            <span className="text-[11px] text-zinc-500">
              {shown.length} lieu{shown.length > 1 ? 'x' : ''}
              {notableCount > 0 && <span className="text-violet-300"> · {notableCount} documenté{notableCount > 1 ? 's' : ''}</span>}
            </span>
            {notableCount > 0 && (
              <button
                onClick={() => setDocsOnly((v) => !v)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                  docsOnly ? 'bg-violet-500/30 text-violet-200' : 'bg-zinc-800/70 text-zinc-400'
                }`}
              >
                <BookOpen size={10} /> Documentés
              </button>
            )}
          </div>
        )}
        {shown.map((r) => (
          <DiscoverResult key={r.id} r={r} onAdd={onAdd} onSelect={onSelect} />
        ))}
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
