import { useRef, useState } from 'react'
import { X, ImagePlus, Trash2, Save, MoveDiagonal } from 'lucide-react'
import { CATEGORIES, STATUSES } from '../lib/constants'
import { formatCoords } from '../lib/geo'
import { fileToCompressedDataUrl } from '../lib/images'
import { useStore } from '../lib/store'

const MAX_PHOTOS = 8

export default function SpotForm({ spot, position, onPositionHint, onSaved, onCancel }) {
  const { addSpot, updateSpot, showToast, mode } = useStore()
  const editing = Boolean(spot)

  const [name, setName] = useState(spot?.name || '')
  const [category, setCategory] = useState(spot?.category || 'usine')
  const [status, setStatus] = useState(spot?.status || 'a_faire')
  const [danger, setDanger] = useState(spot?.danger ?? 2)
  const [description, setDescription] = useState(spot?.description || '')
  const [accessNotes, setAccessNotes] = useState(spot?.accessNotes || '')
  const [visitedAt, setVisitedAt] = useState(spot?.visitedAt || '')
  const [photos, setPhotos] = useState(spot?.photos || [])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const lat = position?.lat ?? spot?.lat
  const lng = position?.lng ?? spot?.lng

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      showToast(`Maximum ${MAX_PHOTOS} photos par spot`, 'error')
      return
    }
    try {
      const compressed = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)))
      setPhotos((prev) => [...prev, ...compressed])
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Donne un nom au spot', 'error')
      return
    }
    if (lat == null || lng == null) {
      showToast('Place le spot sur la carte', 'error')
      return
    }
    setSaving(true)
    const fields = {
      name: trimmed,
      category,
      status,
      danger,
      description: description.trim(),
      accessNotes: accessNotes.trim(),
      visitedAt: visitedAt || null,
      photos,
      lat,
      lng,
    }
    if (editing) {
      await updateSpot(spot.id, fields)
      onSaved(spot.id)
    } else {
      const created = await addSpot(fields)
      if (created) onSaved(created.id)
    }
    setSaving(false)
  }

  return (
    <div className="glass pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="flex-1 text-base font-bold text-zinc-100">
          {editing ? 'Modifier le spot' : 'Nouveau spot'}
        </h2>
        <button
          onClick={onCancel}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Position */}
        <div className="flex items-center justify-between rounded-xl bg-zinc-800/50 px-3 py-2.5 text-xs">
          <span className="font-mono text-zinc-300">
            {lat != null && lng != null ? formatCoords(lat, lng) : 'Non placé'}
          </span>
          {!editing && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <MoveDiagonal size={11} /> déplace le marqueur pour ajuster
            </span>
          )}
          {editing && (
            <button
              onClick={onPositionHint}
              className="text-[10px] text-amber-300/90 hover:text-amber-300"
              title="Déplacer le marqueur sur la carte"
            >
              repositionner
            </button>
          )}
        </div>

        {/* Nom */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Nom *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Usine des Rails, Manoir aux Statues…"
            autoFocus
            className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
          />
        </div>

        {/* Statut */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Statut
          </label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                title={s.desc}
                onClick={() => setStatus(s.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  status === s.id ? 'text-zinc-950' : 'bg-zinc-800/70 text-zinc-400 hover:bg-zinc-700/60'
                }`}
                style={status === s.id ? { background: s.color } : {}}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Catégorie */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Catégorie
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                  category === c.id
                    ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40'
                    : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
                }`}
              >
                <span className="text-base">{c.emoji}</span>
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Danger */}
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Danger</span>
            <span className="text-rose-300">{danger}/5</span>
          </label>
          <input
            type="range"
            min="1"
            max="5"
            value={danger}
            onChange={(e) => setDanger(Number(e.target.value))}
            className="w-full accent-rose-400"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>Tranquille</span>
            <span>Très risqué</span>
          </div>
        </div>

        {/* Date de visite (si fait) */}
        {status === 'fait' && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Exploré le
            </label>
            <input
              type="date"
              value={visitedAt || ''}
              onChange={(e) => setVisitedAt(e.target.value)}
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 outline-none [color-scheme:dark]"
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Histoire du lieu, état, ce qu'il y a à voir…"
            className="w-full resize-none rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
          />
        </div>

        {/* Accès */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Notes d'accès
          </label>
          <textarea
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            rows={2}
            placeholder="Où se garer, par où entrer, présence de sécu…"
            className="w-full resize-none rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
          />
        </div>

        {/* Photos */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Photos ({photos.length}/{MAX_PHOTOS})
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => (
              <div key={i} className="group relative overflow-hidden rounded-lg">
                <img src={p} alt="" className="aspect-square w-full object-cover" />
                <button
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 size={16} className="text-rose-300" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-zinc-700 text-zinc-500 transition hover:border-amber-400/50 hover:text-amber-300"
              >
                <ImagePlus size={18} />
              </button>
            )}
          </div>
          {mode === 'local' && photos.length > 0 && (
            <p className="mt-1.5 text-[10px] text-zinc-600">
              En mode local, les photos sont compressées et stockées dans le navigateur (espace limité).
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={addPhotos}
          />
        </div>
      </div>

      <div className="flex gap-2 border-t border-white/10 px-4 py-3">
        <button
          onClick={onCancel}
          className="rounded-xl bg-zinc-800/70 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700/70"
        >
          Annuler
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          <Save size={15} /> {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le spot'}
        </button>
      </div>
    </div>
  )
}
