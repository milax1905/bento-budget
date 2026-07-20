import { useMemo, useRef, useState } from 'react'
import {
  Search,
  Settings,
  X,
  Download,
  Upload,
  FileJson,
  MapPinned,
  CloudOff,
  Cloud,
  LogOut,
  AlertTriangle,
  Globe,
} from 'lucide-react'
import { CATEGORIES, STATUSES, APP_VERSION, categoryById, statusById } from '../lib/constants'
import { distanceKm, formatDistance } from '../lib/geo'
import { exportGpx, exportJson, exportKml, parseImportedJson } from '../lib/exporters'
import { useStore } from '../lib/store'

function DangerDots({ level }) {
  return (
    <span className="flex items-center gap-0.5" title={`Danger ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-rose-400' : 'bg-zinc-700'}`}
        />
      ))}
    </span>
  )
}

export default function Sidebar({ onClose, selectedId, onSelect, userPos, onOpenSettings }) {
  const { spots, mode, user, profileName, signOut, importSpots, showToast, loading } = useStore()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const fileRef = useRef(null)

  const counts = useMemo(() => {
    const c = {}
    for (const s of spots) c[s.status] = (c[s.status] || 0) + 1
    return c
  }, [spots])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return spots
      .filter((s) => (statusFilter ? s.status === statusFilter : true))
      .filter((s) => (categoryFilter ? s.category === categoryFilter : true))
      .filter((s) =>
        q
          ? s.name.toLowerCase().includes(q) ||
            (s.description || '').toLowerCase().includes(q) ||
            categoryById(s.category).label.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }, [spots, query, statusFilter, categoryFilter])

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      await importSpots(parseImportedJson(text))
    } catch (err) {
      showToast(`Import impossible : ${err.message}`, 'error')
    }
  }

  return (
    <div className="glass pointer-events-auto pt-safe pb-safe flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl">
      {/* En-tête */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-lg">🏚️</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold tracking-tight text-zinc-100">Urbex Atlas</h1>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {mode === 'cloud' ? (
              <>
                <Cloud size={11} className="text-emerald-400" />
                <span>
                  Synchro active{profileName ? ` · ${profileName}` : ''}
                </span>
              </>
            ) : (
              <>
                <CloudOff size={11} className="text-amber-400" />
                <span>Mode local</span>
              </>
            )}
          </div>
        </div>
        {mode === 'cloud' && user && (
          <button
            title="Se déconnecter"
            onClick={signOut}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
          >
            <LogOut size={16} />
          </button>
        )}
        <button
          title="Réglages & synchro"
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          <Settings size={16} />
        </button>
        <button
          title="Fermer"
          onClick={onClose}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200 sm:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {/* Recherche + filtres */}
      <div className="space-y-2 border-b border-white/10 px-3 py-3">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-800/70 px-3 py-2">
          <Search size={15} className="shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un spot…"
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
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active ? 'text-zinc-950' : 'text-zinc-300 hover:bg-zinc-700/60 bg-zinc-800/70'
                }`}
                style={active ? { background: st.color } : {}}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? 'rgba(0,0,0,.4)' : st.color }} />
                {st.label}
                <span className={active ? 'opacity-70' : 'text-zinc-500'}>{counts[st.id] || 0}</span>
              </button>
            )
          })}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full rounded-xl bg-zinc-800/70 px-3 py-2 text-sm text-zinc-300 outline-none"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Liste des spots */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && <div className="px-3 py-6 text-center text-sm text-zinc-500">Chargement des spots…</div>}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-zinc-500">
            <MapPinned size={28} className="text-zinc-600" />
            {spots.length === 0 ? (
              <p>
                Aucun spot pour l'instant.
                <br />
                Clique sur <span className="font-semibold text-amber-300">« + Spot »</span> pour ajouter votre premier
                lieu.
              </p>
            ) : (
              <p>Aucun spot ne correspond aux filtres.</p>
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
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                selected ? 'bg-amber-400/15 ring-1 ring-amber-400/40' : 'hover:bg-zinc-800/70'
              }`}
            >
              <span className="text-xl">{cat.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{s.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                  {s.danger >= 4 && <AlertTriangle size={11} className="text-rose-400" />}
                  {userPos && (
                    <span>{formatDistance(distanceKm(userPos, { lat: s.lat, lng: s.lng }))}</span>
                  )}
                </span>
              </span>
              <DangerDots level={s.danger} />
            </button>
          )
        })}
      </div>

      {/* Pied : export / import */}
      <div className="flex items-center gap-1.5 border-t border-white/10 px-3 py-2.5">
        <span className="mr-auto text-[11px] text-zinc-600">
          {spots.length} spot{spots.length > 1 ? 's' : ''} · v{APP_VERSION}
        </span>
        <button
          title="Importer un fichier JSON"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:bg-zinc-700/70"
        >
          <Upload size={12} /> Import
        </button>
        <button
          title="Exporter en JSON (sauvegarde)"
          onClick={() => exportJson(spots)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:bg-zinc-700/70"
        >
          <FileJson size={12} /> JSON
        </button>
        <button
          title="Exporter en GPX (GPS, Organic Maps…)"
          onClick={() => exportGpx(spots)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:bg-zinc-700/70"
        >
          <Download size={12} /> GPX
        </button>
        <button
          title="Exporter en KML (Google Earth)"
          onClick={() => exportKml(spots)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:bg-zinc-700/70"
        >
          <Globe size={12} /> KML
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
      </div>
    </div>
  )
}
