import { useState } from 'react'
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
} from 'lucide-react'
import { categoryById } from '../lib/constants'
import { formatDistance } from '../lib/geo'
import { MAX_DISCOVER_RADIUS_KM, extractLooksActive } from '../lib/discover'
import { webSearchUrl } from '../lib/wiki'

const DANGER_COLORS = { 1: '#10b981', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444' }

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

function DiscoverResult({ r, onAdd, onSelect }) {
  const cat = categoryById(r.category)
  const [open, setOpen] = useState(false)
  const ai = r.enrichment?.ai || null
  const wiki = r.enrichment?.wiki || null
  const danger = effectiveDanger(r)
  const summary = ai?.resume || wiki?.extract || null
  const quelconque = ai?.verdict === 'quelconque'

  return (
    <div className={`mb-1 rounded-xl transition hover:bg-zinc-800/50 ${quelconque ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => onSelect(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-xl">{cat.emoji}</span>
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
                <span className="flex shrink-0 items-center gap-0.5 rounded bg-violet-500/25 px-1 py-px text-[9px] font-semibold text-violet-200">
                  <BookOpen size={9} /> Doc.
                </span>
              )}
              <span className="truncate">{r.name}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
              <DangerBadge danger={danger} small />
              <span>{formatDistance(r.distanceKm)}</span>
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
          className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/30"
        >
          <Plus size={13} /> Ajouter
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          {/* Résumé (IA ou Wikipédia) */}
          {summary && (
            <div className="rounded-lg bg-zinc-900/50 p-2.5">
              <div className="flex gap-2.5">
                {wiki?.thumbnail && (
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
                  <a href={wiki.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-300 hover:text-violet-200">
                    <BookOpen size={10} /> Wikipédia{wiki.source === 'geo' && wiki.dist != null ? ` (à ~${wiki.dist} m)` : ''}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Danger + risques */}
          {danger && (
            <div className="rounded-lg bg-zinc-900/50 p-2.5">
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
            <div className="rounded-lg bg-zinc-900/50 p-2.5 text-[11px] text-zinc-300">
              {r.facts?.map((f, i) => (
                <div key={i} className="flex gap-1.5">
                  <span className="text-zinc-500">{f.label} :</span>
                  <span>{f.value}</span>
                </div>
              ))}
              {r.osmDescription && <p className="mt-1 text-zinc-400">{r.osmDescription}</p>}
            </div>
          )}

          {/* Liens */}
          <div className="flex flex-wrap gap-1.5">
            <a
              href={webSearchUrl(r.name, r.lat, r.lng)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-zinc-700/60 px-2 py-1.5 text-[11px] text-zinc-200 transition hover:bg-zinc-600/60"
            >
              <Search size={11} /> Web
            </a>
            {r.osmUrl && (
              <a
                href={r.osmUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-zinc-700/60 px-2 py-1.5 text-[11px] text-zinc-200 transition hover:bg-zinc-600/60"
              >
                <ExternalLink size={11} /> OpenStreetMap
              </a>
            )}
            {r.wikidataUrl && !wiki && (
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
  const { radiusKm, status, results, error, center, enriching, aiEnabled, aiError } = discover
  const [docsOnly, setDocsOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)

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
                ? `Gemini n’a rien renvoyé — ${aiError}`
                : 'Gemini n’a rien renvoyé cette fois — réessaie dans un instant.',
            }
  const base = docsOnly ? results.filter((r) => r.notable) : results
  const kept = base.filter((r) => !isExcluded(r))
  const excluded = base.filter((r) => isExcluded(r))
  const shown = showExcluded ? [...kept, ...excluded] : kept

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
          {radiusKm >= 20 && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Grand rayon : les serveurs OpenStreetMap sont plus lents, laisse jusqu'à ~40 s (ne relance pas en boucle).
            </p>
          )}
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
        {status === 'done' && results.length > 0 && aiStatus?.tone === 'amber' && (
          <p className="mx-3 mb-1 mt-0.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200/90">
            {aiStatus.title}
          </p>
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
          <div key={r.id} className={showExcluded && isExcluded(r) ? 'opacity-45' : ''}>
            <DiscoverResult r={r} onAdd={onAdd} onSelect={onSelect} />
          </div>
        ))}
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
      </div>
    </div>
  )
}
