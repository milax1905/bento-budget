import { useMemo, useRef, useState } from 'react'
import {
  Search,
  X,
  Download,
  Upload,
  FileJson,
  MapPinned,
  Globe,
  Star,
  AlertTriangle,
  ArrowDownUp,
  ChevronRight,
} from 'lucide-react'
import { CATEGORIES, STATUSES, categoryById, statusById } from '../lib/constants'
import { distanceKm, formatDistance } from '../lib/geo'
import { exportGpx, exportJson, exportKml, parseImportedJson } from '../lib/exporters'
import { useStore } from '../lib/store'

function DangerDots({ level }) {
  return (
    <span className="flex items-center gap-0.5" title={`Danger ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-rose-400' : 'bg-zinc-700'}`} />
      ))}
    </span>
  )
}

const SORTS = [
  { id: 'recent', label: 'Récents' },
  { id: 'distance', label: 'Proches' },
  { id: 'danger', label: 'Danger' },
  { id: 'az', label: 'A → Z' },
]

export default function PlacesScreen({ selectedId, onSelect, userPos }) {
  const { spots, importSpots, importRefSpots, showToast, loading } = useStore()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [sort, setSort] = useState('recent')
  const fileRef = useRef(null)

  const favCount = useMemo(() => spots.filter((s) => s.favorite).length, [spots])
  const counts = useMemo(() => {
    const c = {}
    for (const s of spots) c[s.status] = (c[s.status] || 0) + 1
    return c
  }, [spots])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = spots
      .filter((s) => (favOnly ? s.favorite : true))
      .filter((s) => (statusFilter ? s.status === statusFilter : true))
      .filter((s) => (categoryFilter ? s.category === categoryFilter : true))
      .filter((s) =>
        q
          ? s.name.toLowerCase().includes(q) ||
            (s.description || '').toLowerCase().includes(q) ||
            categoryById(s.category).label.toLowerCase().includes(q)
          : true,
      )
    const dist = (s) => (userPos ? distanceKm(userPos, { lat: s.lat, lng: s.lng }) : Infinity)
    const cmp = {
      recent: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      distance: (a, b) => dist(a) - dist(b),
      danger: (a, b) => (b.danger || 0) - (a.danger || 0),
      az: (a, b) => a.name.localeCompare(b.name),
    }
    return [...list].sort(cmp[sort] || cmp.recent)
  }, [spots, query, statusFilter, categoryFilter, favOnly, sort, userPos])

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
      if (data?.kind === 'urbex-discover-db' && Array.isArray(data.refs)) {
        await importRefSpots(data.refs)
        return
      }
      await importSpots(parseImportedJson(text))
    } catch (err) {
      showToast(`Import impossible : ${err.message}`, 'error')
    }
  }

  return (
    <div className="app-bg screen-in pt-safe absolute inset-0 z-[1500] flex flex-col">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        {/* En-tête */}
        <header className="flex items-center gap-2 px-4 pb-2 pt-3">
          <MapPinned size={20} className="text-indigo-300" />
          <h1 className="text-[15px] font-bold uppercase tracking-[0.24em] text-zinc-100">Lieux</h1>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-white/10">
            {spots.length}
          </span>
        </header>

        {/* Recherche + filtres */}
        <div className="space-y-2 px-3 pb-2">
          <div className="glass-card flex items-center gap-2 rounded-full px-4 py-2.5">
            <Search size={15} className="shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un lieu…"
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((st) => {
              const active = statusFilter === st.id
              return (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(active ? null : st.id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                    active ? 'text-zinc-950 ring-white/20' : 'bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10'
                  }`}
                  style={active ? { background: st.color } : {}}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? 'rgba(0,0,0,.4)' : st.color }} />
                  {st.label}
                  <span className={active ? 'opacity-70' : 'text-zinc-500'}>{counts[st.id] || 0}</span>
                </button>
              )
            })}
            <button
              onClick={() => setFavOnly((v) => !v)}
              title="Spots de la prochaine sortie"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                favOnly ? 'bg-amber-400 text-zinc-950 ring-white/20' : 'bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10'
              }`}
            >
              <Star size={11} className={favOnly ? 'fill-zinc-950' : 'fill-amber-400 text-amber-400'} />
              Sortie
              <span className={favOnly ? 'opacity-70' : 'text-zinc-500'}>{favCount}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="glass-card min-w-0 flex-1 rounded-full px-4 py-2 text-sm text-zinc-300 outline-none"
            >
              <option value="">Toutes catégories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <div className="glass-card flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1">
              <ArrowDownUp size={13} className="ml-1 text-zinc-500" />
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  disabled={s.id === 'distance' && !userPos}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium transition disabled:opacity-30 ${
                    sort === s.id ? 'bg-indigo-400/25 text-indigo-200' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-2 pb-32">
          {loading && <div className="px-3 py-6 text-center text-sm text-zinc-500">Chargement des lieux…</div>}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-sm text-zinc-500">
              <MapPinned size={28} className="text-zinc-600" />
              {spots.length === 0 ? (
                <p>Aucun lieu pour l'instant. Ajoute ton premier spot avec le bouton « + ».</p>
              ) : (
                <p>Aucun lieu ne correspond aux filtres.</p>
              )}
            </div>
          )}
          {filtered.map((s) => {
            const cat = categoryById(s.category)
            const st = statusById(s.status)
            const selected = s.id === selectedId
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                  selected ? 'bg-indigo-400/15 ring-1 ring-indigo-400/40' : 'hover:bg-white/5'
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl ring-1 ring-white/10">
                  {cat.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-zinc-100">
                    {s.favorite && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                      {st.label}
                    </span>
                    {s.danger >= 4 && <AlertTriangle size={11} className="text-rose-400" />}
                    {userPos && <span>· {formatDistance(distanceKm(userPos, { lat: s.lat, lng: s.lng }))}</span>}
                  </span>
                </span>
                <DangerDots level={s.danger} />
                <ChevronRight size={15} className="shrink-0 text-zinc-600" />
              </button>
            )
          })}

          {/* Import / export */}
          {!loading && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/8 px-1 pt-3">
              <span className="mr-auto text-[11px] text-zinc-600">Sauvegarde & partage</span>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <Upload size={12} /> Import
              </button>
              <button
                onClick={() => exportJson(spots)}
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <FileJson size={12} /> JSON
              </button>
              <button
                onClick={() => exportGpx(spots)}
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <Download size={12} /> GPX
              </button>
              <button
                onClick={() => exportKml(spots)}
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <Globe size={12} /> KML
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
