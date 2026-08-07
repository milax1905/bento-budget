import { useEffect, useRef, useState } from 'react'
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
  AlertTriangle,
  Sparkles,
  Star,
  Navigation,
  Flame,
} from 'lucide-react'
import { CATEGORIES, categoryById } from '../lib/constants'
import { formatDistance } from '../lib/geo'
import { MAX_DISCOVER_RADIUS_KM, extractLooksActive, NOISE_NAME_RE } from '../lib/discover'
import { searchPlaces } from '../lib/geocode'
import { webSearchUrl } from '../lib/wiki'

// Score urbex 0-99 : synthèse de TOUS les signaux (IA, documentation, type de
// lieu, photos, bruit) pour trier les « vrais lieux » d'un coup d'œil.
const GOOD_CATS = new Set(['chateau', 'hopital', 'militaire', 'usine', 'tunnel', 'gare', 'eglise', 'parc'])
function scoreUrbex(r) {
  const ai = r.enrichment?.ai
  let s = 40
  if (ai) {
    if (ai.verdict === 'top') s += 30
    else if (ai.verdict === 'moyen') s += 10
    else if (ai.verdict === 'quelconque') s -= 35
    if (ai.urbex === false) s -= 35
    s += (Number(ai.interet) || 0) * 4
  }
  if (r.notable) s += 10
  if (r.source === 'perso') s += 15
  if (GOOD_CATS.has(r.category)) s += 5
  if ((r.enrichment?.photos || []).length > 0) s += 4
  if (NOISE_NAME_RE.test(r.name || '')) s -= 30
  return Math.max(1, Math.min(99, Math.round(s)))
}
function scoreTone(s) {
  if (s >= 70) return { bg: 'rgba(16,185,129,.18)', tx: '#6ee7b7' }
  if (s >= 45) return { bg: 'rgba(251,191,36,.15)', tx: '#fcd34d' }
  return { bg: 'rgba(255,255,255,.07)', tx: '#8e90a2' }
}

const DANGER_COLORS = { 1: '#10b981', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444' }

// Direction cardinale (français) du lieu vu depuis le centre de recherche —
// aide à trier 500 résultats d'un coup d'œil (« 98 km NO »).
function bearingLabel(from, to) {
  if (!from || to?.lat == null) return null
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const la1 = (from.lat * Math.PI) / 180
  const la2 = (to.lat * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng)
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]
}

// Danger effectif : celui de l'IA s'il existe, sinon celui calculé localement.
function effectiveDanger(r) {
  const ai = r.enrichment?.ai?.danger
  if (ai && ai.niveau) {
    return { level: ai.niveau, label: ai.label || '', color: DANGER_COLORS[ai.niveau] || '#f59e0b', risks: ai.risques || [] }
  }
  return r.danger || null
}

// Lieu à écarter du tri « propre ». Quand l'IA a jugé le lieu (perso INCLUS),
// on suit son verdict : réhabilité/actif (urbex:false) ou sans intérêt
// (quelconque) → écarté ; sinon gardé. Sans IA, filet de sécurité par la
// description Wikipédia (commune/relief/monument encore debout), les lieux
// « Ma carte » restant protégés tant que l'IA ne les a pas tranchés.
function isExcluded(r) {
  const ai = r.enrichment?.ai
  if (ai) {
    if (ai.urbex === false) return true // commune, actif, réhabilité → écarté
    if (ai.verdict === 'quelconque') return true // sans intérêt pour l'urbex → écarté
    return false // l'IA valide (top/moyen) → on garde, même « Ma carte »
  }
  if (r.source === 'perso') return false // perso curé, jamais masqué tant que l'IA n'a pas tranché
  const ex = r.enrichment?.wiki?.extract || ''
  if (/est une commune|commune française|ancienne commune|\bvillage\b|hameau|\brivière|\bfleuve|massif|sommet|montagne|\bcol de/i.test(ex))
    return true
  return extractLooksActive(ex) // encore debout / restauré / visitable → écarté
}

function DangerBadge({ danger, small }) {
  if (!danger) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[11px]'}`}
      style={{ backgroundColor: `${danger.color}22`, color: danger.color }}
    >
      <AlertTriangle size={small ? 9 : 11} /> {danger.label}
    </span>
  )
}

function DiscoverResult({ r, onAdd, onSelect, center }) {
  const cat = categoryById(r.category)
  const [open, setOpen] = useState(false)
  const dir = bearingLabel(center, r)
  const ai = r.enrichment?.ai || null
  const wiki = r.enrichment?.wiki || null
  const photos = r.enrichment?.photos || []
  const danger = effectiveDanger(r)
  const summary = ai?.resume || wiki?.extract || null
  const quelconque = ai?.verdict === 'quelconque'
  const score = scoreUrbex(r)
  const tone = scoreTone(score)

  return (
    <div className={`glass-card mb-1.5 rounded-2xl transition hover:bg-white/5 ${quelconque ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => onSelect(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl ring-1 ring-white/10">
            {cat.emoji}
            <span
              title={`Score urbex ${score}/99`}
              className="absolute -bottom-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold ring-1 ring-black/40"
              style={{ background: tone.bg, color: tone.tx, backdropFilter: 'blur(8px)' }}
            >
              {score}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-100">
              {r.source === 'perso' && (
                <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/25 px-1 py-px text-[9px] font-semibold text-amber-200">
                  ★ Ma carte
                </span>
              )}
              {ai?.verdict === 'top' && (
                <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/25 px-1 py-px text-[9px] font-semibold text-amber-200">
                  <Star size={9} /> Top
                </span>
              )}
              {r.notable && (
                <span className="flex shrink-0 items-center gap-0.5 rounded bg-indigo-400/20 px-1 py-px text-[9px] font-semibold text-indigo-200">
                  <BookOpen size={9} /> Doc.
                </span>
              )}
              <span className="truncate">{r.name}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
              <DangerBadge danger={danger} small />
              <span>
                {formatDistance(r.distanceKm)}
                {dir ? ` ${dir}` : ''}
              </span>
              {ai?.interet > 0 && (
                <span className="flex items-center gap-0.5 text-amber-300/80" title={`Intérêt ${ai.interet}/5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={9} className={i < ai.interet ? 'fill-amber-300/80' : 'text-zinc-700'} />
                  ))}
                </span>
              )}
              {r.typeLabel && <span className="truncate text-zinc-400">{r.typeLabel}</span>}
            </span>
            {summary && <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400">{summary}</span>}
          </span>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Plus d'infos"
          className={`rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-700/60 hover:text-zinc-300 ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDown size={15} />
        </button>
        <button
          onClick={() => onAdd(r)}
          title="Ajouter à ma carte"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-400/20 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-400/30"
        >
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          {/* Photos du lieu (OSM / Wikipédia / Commons géolocalisées, libres) */}
          {photos.length > 0 && (
            <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <a key={i} href={p.page} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={p.thumb}
                    alt=""
                    loading="lazy"
                    className="h-24 w-32 rounded-xl object-cover ring-1 ring-white/10"
                    onError={(e) => {
                      e.currentTarget.parentElement.style.display = 'none'
                    }}
                  />
                </a>
              ))}
            </div>
          )}

          {/* Résumé (IA ou Wikipédia) */}
          {summary && (
            <div className="rounded-xl bg-black/25 p-2.5 ring-1 ring-white/5">
              <div className="flex gap-2.5">
                {wiki?.thumbnail && photos.length === 0 && (
                  <img src={wiki.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                )}
                <p className="text-[11px] leading-relaxed text-zinc-300">{summary}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-500">
                {ai && (
                  <span className="flex items-center gap-1 text-emerald-300/80">
                    <Sparkles size={10} /> Analyse IA
                  </span>
                )}
                {wiki?.url && (
                  <a href={wiki.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-300 hover:text-indigo-200">
                    <BookOpen size={10} /> Wikipédia{wiki.source === 'geo' && wiki.dist != null ? ` (à ~${wiki.dist} m)` : ''}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Danger + risques */}
          {danger && (
            <div className="rounded-xl bg-black/25 p-2.5 ring-1 ring-white/5">
              <div className="flex items-center gap-2">
                <DangerBadge danger={danger} />
                <span className="text-[11px] font-medium text-zinc-300">Niveau de danger</span>
              </div>
              {danger.risks?.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {danger.risks.map((risk, i) => (
                    <li key={i} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {risk}
                    </li>
                  ))}
                </ul>
              )}
              {ai?.conseils && <p className="mt-1.5 text-[10px] italic text-zinc-400">💡 {ai.conseils}</p>}
            </div>
          )}

          {/* Faits (tags OSM) */}
          {(r.facts?.length > 0 || r.osmDescription) && (
            <div className="rounded-xl bg-black/25 p-2.5 ring-1 ring-white/5 text-[11px] text-zinc-300">
              {r.facts?.map((f, i) => (
                <div key={i} className="flex gap-1.5">
                  <span className="text-zinc-500">{f.label} :</span>
                  <span>{f.value}</span>
                </div>
              ))}
              {r.osmDescription && <p className="mt-1 text-zinc-400">{r.osmDescription}</p>}
            </div>
          )}

          {/* Coordonnées précises (repérage carte / GPS) */}
          <p className="px-0.5 font-mono text-[10px] text-zinc-600">
            📍 {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
            {dir ? ` · ${formatDistance(r.distanceKm)} ${dir}` : ''}
          </p>

          {/* Liens */}
          <div className="flex flex-wrap gap-1.5">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-indigo-400/20 px-2 py-1.5 text-[11px] font-medium text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-400/30"
            >
              <Navigation size={11} /> Itinéraire
            </a>
            <a
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${r.lat},${r.lng}`}
              target="_blank"
              rel="noreferrer"
              title="Vérifier le lieu depuis la rue (si couvert)"
              className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              👁️ Street View
            </a>
            <a
              href={webSearchUrl(r.name, r.lat, r.lng)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <Search size={11} /> Web
            </a>
            {r.osmUrl && (
              <a
                href={r.osmUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <ExternalLink size={11} /> OpenStreetMap
              </a>
            )}
            {r.wikidataUrl && !wiki && (
              <a
                href={r.wikidataUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <ExternalLink size={11} /> Wikidata
              </a>
            )}
            {r.wmUrl && (
              <a
                href={r.wmUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <ExternalLink size={11} /> Fiche wikimaginot
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
  onIntensive,
  onCenterChange,
  onEnrichMore,
  locating,
}) {
  const { radiusKm, status, results, error, center, enriching, aiEnabled, aiError, intensive } = discover
  const [docsOnly, setDocsOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  // Recherche ciblée : filtre par type de lieu + filtre texte (indispensable
  // quand une recherche à grand rayon renvoie des centaines de lieux).
  const [catFilter, setCatFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  // Tri de la liste + pagination (fluidité avec des centaines de résultats).
  const [sortBy, setSortBy] = useState('pertinence') // pertinence | proche | top
  const [limit, setLimit] = useState(80)
  // « Pépites » : ne garder que les lieux à fort potentiel (score urbex élevé).
  const [gemsOnly, setGemsOnly] = useState(false)
  // Réglages repliés une fois la recherche faite (l'écran respire) ; bouton
  // « Modifier » pour les rouvrir.
  const [configOpen, setConfigOpen] = useState(() => discover.status !== 'done' || !results.length)

  useEffect(() => {
    if (status === 'done' && results.length > 0) setConfigOpen(false)
    if (status === 'idle') setConfigOpen(true)
  }, [status, results.length])
  // Recherche de ville/adresse pour recentrer sans toucher la carte.
  const [placeQ, setPlaceQ] = useState('')
  const [placeHits, setPlaceHits] = useState([])
  const [placeStatus, setPlaceStatus] = useState('idle')
  const placeAbort = useRef(null)

  useEffect(() => {
    placeAbort.current?.abort()
    const q = placeQ.trim()
    if (q.length < 3) {
      setPlaceHits([])
      setPlaceStatus('idle')
      return
    }
    const ctrl = new AbortController()
    placeAbort.current = ctrl
    setPlaceStatus('searching')
    const t = setTimeout(() => {
      searchPlaces(q, { signal: ctrl.signal })
        .then((r) => {
          setPlaceHits(r.slice(0, 5))
          setPlaceStatus(r.length ? 'idle' : 'empty')
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setPlaceHits([])
            setPlaceStatus('error')
          }
        })
    }, 400)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [placeQ])

  // Nouvelle recherche ou changement de filtre → on repart en haut de liste.
  useEffect(() => {
    setLimit(80)
  }, [results, catFilter, textFilter, sortBy, docsOnly, showExcluded, gemsOnly])

  const notableCount = results.filter((r) => r.notable).length
  const anyAi = results.some((r) => r.enrichment?.ai)
  // État de l'IA affiché sous le compteur : active / non configurée (clé serveur
  // absente) / momentanément indisponible (Gemini n'a rien renvoyé).
  const aiStatus =
    enriching || aiEnabled == null
      ? null
      : aiEnabled === false
        ? { tone: 'amber', text: 'IA non configurée', title: 'Aucune clé IA. Le plus simple : Réglages (⚙️) → « Analyse IA » → colle ta clé Groq (gratuite) ou Claude. Rien à configurer sur Vercel.' }
        : anyAi
          ? { tone: 'emerald', text: "filtrés par l'IA", title: 'Analyse et tri par Gemini (gratuit).' }
          : {
              tone: 'amber',
              text: 'IA indisponible',
              title: aiError
                ? `L’IA n’a rien renvoyé — ${aiError}`
                : 'L’IA n’a rien renvoyé cette fois — réessaie dans un instant.',
            }
  const q = textFilter.trim().toLowerCase()
  const matchesText = (r) =>
    !q ||
    (r.name || '').toLowerCase().includes(q) ||
    (r.typeLabel || '').toLowerCase().includes(q) ||
    (r.enrichment?.ai?.resume || r.enrichment?.wiki?.extract || '').toLowerCase().includes(q)
  const preCat = (docsOnly ? results.filter((r) => r.notable) : results).filter(matchesText)
  // Compteurs par type (sur les lieux gardés, hors filtre de type) → puces.
  const catCounts = {}
  for (const r of preCat) if (!isExcluded(r)) catCounts[r.category] = (catCounts[r.category] || 0) + 1
  const base = catFilter ? preCat.filter((r) => r.category === catFilter) : preCat
  let kept = base.filter((r) => !isExcluded(r))
  if (gemsOnly) kept = kept.filter((r) => scoreUrbex(r) >= 60)
  const excluded = base.filter((r) => isExcluded(r))
  // Tri : pertinence (ordre calculé), proches d'abord, ou meilleures notes IA.
  const aiRank = (r) =>
    (r.enrichment?.ai?.verdict === 'top' ? 100 : 0) + (Number(r.enrichment?.ai?.interet) || 0)
  if (sortBy === 'proche') kept = [...kept].sort((a, b) => a.distanceKm - b.distanceKm)
  else if (sortBy === 'top') kept = [...kept].sort((a, b) => aiRank(b) - aiRank(a) || a.distanceKm - b.distanceKm)
  const shown = showExcluded ? [...kept, ...excluded] : kept
  const paged = shown.slice(0, limit)
  const filterCats = CATEGORIES.filter((c) => catCounts[c.id])
  // Lieux du filtre courant pas encore enrichis (ni histoire, ni IA, ni photos)
  // → cible du bouton « Analyser plus » (par lots de 30, quota IA oblige).
  const unanalyzed = kept.filter((r) => !r.enrichment)

  return (
    <div
      className="glass pointer-events-auto pt-safe flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="glass-card flex h-9 w-9 items-center justify-center rounded-xl">
          <Radar size={17} className="text-indigo-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.22em] text-zinc-100">Découvrir</h2>
          <p className="text-[10px] text-zinc-500">OSM · Wikipédia · BASIAS · wikimaginot</p>
        </div>
        <button
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
          className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* Réglages repliés : résumé compact + bouton Modifier */}
      {!configOpen && (
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">
            📍 {center ? `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}` : '—'} · {radiusKm} km
            {intensive ? ' · 🔥 intense' : ''}
          </span>
          <button
            onClick={onSearch}
            disabled={status === 'loading'}
            title="Relancer la recherche"
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
          >
            {status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="rounded-full bg-indigo-400/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-400/25"
          >
            Modifier
          </button>
        </div>
      )}

      {/* Réglages de recherche */}
      {configOpen && (
      <div className="space-y-3 border-b border-white/10 px-4 py-3">
        {/* Recentrer par ville/adresse, sans passer par la carte */}
        <div className="relative">
          <div className="glass-card flex items-center gap-2 rounded-full px-4 py-2.5">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input
              value={placeQ}
              onChange={(e) => setPlaceQ(e.target.value)}
              placeholder="Chercher autour d'une ville, adresse…"
              className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
            />
            {placeQ && (
              <button
                onClick={() => {
                  setPlaceQ('')
                  setPlaceHits([])
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {(placeHits.length > 0 || placeStatus === 'searching' || placeStatus === 'empty') && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl">
              {placeStatus === 'searching' && <p className="px-3 py-2 text-[11px] text-zinc-500">Recherche…</p>}
              {placeStatus === 'empty' && <p className="px-3 py-2 text-[11px] text-zinc-500">Aucun résultat</p>}
              {placeHits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onCenterChange?.({ lat: h.lat, lng: h.lng })
                    setPlaceQ('')
                    setPlaceHits([])
                  }}
                  className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 transition hover:bg-zinc-700/60"
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="glass-card flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs">
          <span className="font-mono text-zinc-300">
            {center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : '—'}
          </span>
          <button
            onClick={onRecenter}
            className="flex items-center gap-1.5 rounded-full bg-indigo-400/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-400/25"
          >
            <LocateFixed size={12} /> {locating ? '…' : 'Ma position'}
          </button>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Rayon</span>
            <span className="font-mono text-indigo-300">{radiusKm} km</span>
          </label>
          <input
            type="range"
            min="1"
            max={MAX_DISCOVER_RADIUS_KM}
            value={radiusKm}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="w-full accent-indigo-400"
          />
          {radiusKm >= 20 && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Grand rayon : les serveurs OpenStreetMap sont plus lents, laisse jusqu'à ~40 s (ne relance pas en boucle).
            </p>
          )}
        </div>
        {radiusKm >= 15 && (
          <button
            onClick={() => onIntensive?.(!intensive)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
              intensive ? 'bg-indigo-500/20 ring-1 ring-indigo-400/40' : 'glass-card hover:bg-white/5'
            }`}
          >
            <span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                <Flame size={13} className={intensive ? 'text-indigo-300' : 'text-zinc-500'} /> Fouille intense
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                Découpe la zone en 4 sous-recherches : jusqu'à 4× plus de lieux dans les zones denses (plus lent).
              </span>
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${intensive ? 'bg-indigo-500' : 'bg-zinc-700'}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${intensive ? 'left-4.5 translate-x-0' : 'left-0.5'}`}
                style={{ left: intensive ? '1.125rem' : '0.125rem' }}
              />
            </span>
          </button>
        )}
        <button
          onClick={onSearch}
          disabled={status === 'loading' || !center}
          className="glow-soft flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 py-3 text-sm font-bold text-white ring-1 ring-white/25 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
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
      )}

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
        {status === 'done' && results.length > 0 && aiStatus?.tone === 'amber' && (
          <p className="mx-3 mb-1 mt-0.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200/90">
            {aiStatus.title}
          </p>
        )}
        {/* Recherche ciblée : filtre texte + puces par type de lieu */}
        {status === 'done' && results.length > 0 && (
          <div className="space-y-1.5 px-2 pb-1">
            <div className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
              <Search size={13} className="shrink-0 text-zinc-500" />
              <input
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                placeholder="Filtrer les résultats (nom, type…)"
                className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
              />
              {textFilter && (
                <button onClick={() => setTextFilter('')} className="text-zinc-500 hover:text-zinc-300">
                  <X size={13} />
                </button>
              )}
            </div>
            {filterCats.length > 1 && (
              <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setCatFilter('')}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    !catFilter ? 'bg-indigo-400/25 text-indigo-200 ring-1 ring-indigo-400/40' : 'bg-white/5 text-zinc-400 ring-1 ring-white/10'
                  }`}
                >
                  Tous
                </button>
                {filterCats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatFilter((v) => (v === c.id ? '' : c.id))}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      catFilter === c.id ? 'bg-indigo-400/25 text-indigo-200 ring-1 ring-indigo-400/40' : 'bg-white/5 text-zinc-400 ring-1 ring-white/10'
                    }`}
                  >
                    <span>{c.emoji}</span>
                    {c.label.split(' / ')[0]}
                    <span className={catFilter === c.id ? 'opacity-70' : 'text-zinc-600'}>{catCounts[c.id]}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Tri */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">Tri</span>
              {[
                { id: 'pertinence', label: 'Pertinence' },
                { id: 'proche', label: 'Proches' },
                { id: 'top', label: 'Top IA' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSortBy(s.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    sortBy === s.id ? 'bg-indigo-400/25 text-indigo-200 ring-1 ring-indigo-400/40' : 'bg-white/5 text-zinc-400 ring-1 ring-white/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {status === 'done' && results.length > 0 && (
          <div className="flex items-center justify-between px-3 pb-1 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              {kept.length} lieu{kept.length > 1 ? 'x' : ''}
              {aiStatus && (
                <span
                  title={aiStatus.title}
                  className={`flex items-center gap-0.5 ${aiStatus.tone === 'emerald' ? 'text-emerald-300/80' : 'text-amber-300/80'}`}
                >
                  <Sparkles size={10} /> {aiStatus.text}
                </span>
              )}
              {enriching && <Loader2 size={11} className="animate-spin text-zinc-600" />}
            </span>
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => setGemsOnly((v) => !v)}
                title="Ne garder que les lieux à fort score urbex (≥ 60)"
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                  gemsOnly ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40' : 'bg-white/5 text-zinc-400 ring-1 ring-white/10'
                }`}
              >
                💎 Pépites
              </button>
              {notableCount > 0 && (
                <button
                  onClick={() => setDocsOnly((v) => !v)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                    docsOnly ? 'bg-indigo-400/25 text-indigo-200 ring-1 ring-indigo-400/40' : 'bg-white/5 text-zinc-400 ring-1 ring-white/10'
                  }`}
                >
                  <BookOpen size={10} /> Documentés
                </button>
              )}
            </span>
          </div>
        )}
        {paged.map((r) => (
          <div key={r.id} className={showExcluded && isExcluded(r) ? 'opacity-45' : ''}>
            <DiscoverResult r={r} onAdd={onAdd} onSelect={onSelect} center={center} />
          </div>
        ))}
        {shown.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 120)}
            className="mx-auto mt-1 flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <ChevronDown size={13} /> Voir plus ({shown.length - limit} restants)
          </button>
        )}
        {/* Analyser plus : enrichit le prochain lot (30) du filtre courant */}
        {status === 'done' && unanalyzed.length > 0 && !enriching && (
          <button
            onClick={() => onEnrichMore?.(unanalyzed.slice(0, 30))}
            className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl bg-indigo-400/20 px-4 py-2 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-400/30"
          >
            <Sparkles size={13} /> Analyser {Math.min(30, unanalyzed.length)} lieu
            {Math.min(30, unanalyzed.length) > 1 ? 'x' : ''} de plus (histoire, photos, IA)
          </button>
        )}
        {status === 'done' && results.length > 0 && shown.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-zinc-500">
            Aucun lieu ne correspond aux filtres — change de type ou vide le filtre texte.
          </p>
        )}
        {status === 'done' && excluded.length > 0 && (
          <button
            onClick={() => setShowExcluded((v) => !v)}
            className="mx-auto mt-1 flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] text-zinc-500 transition hover:text-zinc-300"
          >
            {showExcluded
              ? 'Masquer les lieux écartés'
              : `Voir ${excluded.length} lieu${excluded.length > 1 ? 'x' : ''} écarté${excluded.length > 1 ? 's' : ''} par l'IA (réhabilité, actif ou sans intérêt)`}
          </button>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] leading-snug text-zinc-600">
          <Check size={10} /> Les lieux ajoutés arrivent en statut « Repéré » — vérifie l'accès et la légalité avant
          d'y aller.
        </p>
        {results.some((r) => r.source === 'maginot') && (
          <p className="mt-1 text-[10px] leading-snug text-zinc-600">
            Fortifications : source{' '}
            <a href="https://wikimaginot.eu" target="_blank" rel="noreferrer" className="underline">
              wikimaginot.eu
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
