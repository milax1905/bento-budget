import { useState } from 'react'
import {
  X,
  Pencil,
  Trash2,
  Copy,
  Navigation,
  ExternalLink,
  CalendarDays,
  User,
  AlertTriangle,
  KeyRound,
  Footprints,
} from 'lucide-react'
import { categoryById, statusById, STATUSES } from '../lib/constants'
import { formatCoords, formatDistance } from '../lib/geo'
import { walkMinutes } from '../lib/routing'
import { useStore } from '../lib/store'
import Lightbox from './Lightbox'

export default function SpotDetail({ spot, onClose, onEdit, onEditApproach }) {
  const { updateSpot, deleteSpot, showToast } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const cat = categoryById(spot.category)
  const st = statusById(spot.status)

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(`${spot.lat}, ${spot.lng}`)
      showToast('Coordonnées copiées', 'success')
    } catch {
      showToast('Copie impossible', 'error')
    }
  }

  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`
  const wazeUrl = `https://waze.com/ul?ll=${spot.lat},${spot.lng}&navigate=yes`

  return (
    <div className="glass pointer-events-auto pt-safe pb-safe flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl">
      {/* En-tête */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl">{cat.emoji}</span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-tight text-zinc-100">{spot.name}</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{cat.label}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>
        {/* Statut : changement rapide */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = s.id === spot.status
            return (
              <button
                key={s.id}
                title={s.desc}
                onClick={() => !active && updateSpot(spot.id, { status: s.id })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active ? 'text-zinc-950' : 'bg-zinc-800/70 text-zinc-400 hover:bg-zinc-700/60'
                }`}
                style={active ? { background: s.color } : {}}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Danger */}
        <div className="flex items-center justify-between rounded-xl bg-zinc-800/50 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <AlertTriangle size={14} className={spot.danger >= 4 ? 'text-rose-400' : 'text-zinc-500'} />
            Danger
          </span>
          <span className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`h-2 w-5 rounded-full ${i <= spot.danger ? 'bg-rose-400/90' : 'bg-zinc-700'}`}
              />
            ))}
          </span>
        </div>

        {spot.description && (
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Description</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{spot.description}</p>
          </div>
        )}

        {spot.accessNotes && (
          <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <KeyRound size={11} /> Accès
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{spot.accessNotes}</p>
          </div>
        )}

        {/* Photos */}
        {spot.photos?.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Photos ({spot.photos.length})
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {spot.photos.map((p, i) => (
                <button key={i} onClick={() => setLightbox(p)} className="overflow-hidden rounded-lg">
                  <img src={p} alt="" className="aspect-square w-full object-cover transition hover:scale-105" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Métadonnées */}
        <div className="space-y-1.5 text-[11px] text-zinc-500">
          {spot.visitedAt && (
            <p className="flex items-center gap-1.5">
              <CalendarDays size={11} /> Exploré le {new Date(spot.visitedAt).toLocaleDateString('fr-FR')}
            </p>
          )}
          {spot.createdBy && (
            <p className="flex items-center gap-1.5">
              <User size={11} /> Ajouté par {spot.createdBy}
              {spot.createdAt ? ` · ${new Date(spot.createdAt).toLocaleDateString('fr-FR')}` : ''}
            </p>
          )}
        </div>

        {/* Itinéraire d'approche */}
        <div className="rounded-xl bg-zinc-800/50 p-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <Footprints size={11} /> Approche à pied
            </h3>
            {spot.approach && (
              <button
                onClick={() => onEditApproach(spot)}
                className="text-[10px] text-amber-300/90 hover:text-amber-300"
              >
                modifier
              </button>
            )}
          </div>
          {spot.approach ? (
            <>
              <p className="mt-1.5 text-sm text-zinc-200">
                {formatDistance(spot.approach.distance / 1000)} · ~{walkMinutes(spot.approach.distance)} min ·{' '}
                {spot.approach.mode === 'trail' ? 'via les sentiers' : "à vol d'oiseau"}
              </p>
              {spot.approach.waypoints?.[0] && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${spot.approach.waypoints[0].lat},${spot.approach.waypoints[0].lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-700/60 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600/60"
                  >
                    🅿️ Google Maps
                  </a>
                  <a
                    href={`https://waze.com/ul?ll=${spot.approach.waypoints[0].lat},${spot.approach.waypoints[0].lng}&navigate=yes`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-700/60 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600/60"
                  >
                    🅿️ Waze
                  </a>
                </div>
              )}
              <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                Navigue jusqu'au parking 🅿️, puis suis le tracé pointillé sur la carte.
              </p>
              <button
                onClick={() => updateSpot(spot.id, { approach: null })}
                className="mt-1 text-[10px] text-zinc-600 underline hover:text-rose-300"
              >
                Supprimer le tracé
              </button>
            </>
          ) : (
            <button
              onClick={() => onEditApproach(spot)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-700/60 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600/60"
            >
              🥾 Tracer l'approche (parking → spot)
            </button>
          )}
        </div>

        {/* Coordonnées + navigation */}
        <div className="rounded-xl bg-zinc-800/50 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-300">{formatCoords(spot.lat, spot.lng)}</span>
            <button
              title="Copier les coordonnées"
              onClick={copyCoords}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
            >
              <Copy size={14} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-700/60 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600/60"
            >
              <ExternalLink size={13} /> Google Maps
            </a>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-700/60 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600/60"
            >
              <Navigation size={13} /> Waze
            </a>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-600">
            Astuce : ouvre Google Maps pour comparer avec une vue satellite plus récente.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-white/10 px-4 py-3">
        <button
          onClick={() => onEdit(spot)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400/15 px-3 py-2.5 text-sm font-medium text-amber-300 transition hover:bg-amber-400/25"
        >
          <Pencil size={15} /> Modifier
        </button>
        {confirmDelete ? (
          <button
            onClick={() => {
              deleteSpot(spot.id)
              onClose()
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500/80 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-rose-500"
          >
            Confirmer ?
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800/70 px-4 py-2.5 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
