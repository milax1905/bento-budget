import { useRef, useState } from 'react'
import { X, ImagePlus, Trash2, Save, Crosshair, Loader2, Check, Star, Plus, ListChecks } from 'lucide-react'
import { CATEGORIES, STATUSES, MAX_PHOTOS, MAX_CHECKLIST } from '../lib/constants'
import { formatCoords } from '../lib/geo'
import { fileToCompressedDataUrl } from '../lib/images'
import { useStore } from '../lib/store'
import Lightbox from './Lightbox'

export default function SpotForm({
  spot,
  position,
  adjusting,
  onStartAdjust,
  onEndAdjust,
  onSaved,
  onCancel,
}) {
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
  const [favorite, setFavorite] = useState(Boolean(spot?.favorite))
  const [checklist, setChecklist] = useState(() =>
    Array.isArray(spot?.checklist) ? spot.checklist.map((i) => ({ text: i.text, done: !!i.done })) : []
  )
  const [checkItem, setCheckItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  const addCheckItem = () => {
    const text = checkItem.trim().slice(0, 80)
    if (!text) return
    setChecklist((prev) => {
      if (prev.length >= MAX_CHECKLIST) {
        showToast(`Maximum ${MAX_CHECKLIST} éléments`, 'error')
        return prev
      }
      if (prev.some((i) => i.text.toLowerCase() === text.toLowerCase())) return prev
      return [...prev, { text, done: false }]
    })
    setCheckItem('')
  }

  const lat = position?.lat ?? spot?.lat
  const lng = position?.lng ?? spot?.lng

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || compressing) return
    setCompressing(true)
    const results = await Promise.allSettled(files.map((f) => fileToCompressedDataUrl(f)))
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    const failed = results.length - ok.length
    if (photos.length + ok.length > MAX_PHOTOS) {
      showToast(`Maximum ${MAX_PHOTOS} photos par spot`, 'error')
    } else if (failed > 0) {
      showToast(`${failed} fichier(s) illisible(s) ignoré(s)`, 'error')
    }
    setPhotos((prev) => [...prev, ...ok].slice(0, MAX_PHOTOS))
    setCompressing(false)
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
    // On récupère l'élément de checklist en cours de saisie (non validé).
    const pending = checkItem.trim().slice(0, 80)
    const finalChecklist =
      pending && !checklist.some((i) => i.text.toLowerCase() === pending.toLowerCase())
        ? [...checklist, { text: pending, done: false }].slice(0, MAX_CHECKLIST)
        : checklist
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
    // favorite/checklist se modifient aussi HORS formulaire (étoile et cases à
    // cocher de la fiche). On ne les réécrit que si l'utilisateur les a changés
    // ici, pour ne pas écraser une coche/un favori posé par un coéquipier.
    if (!editing) {
      fields.favorite = favorite
      fields.checklist = finalChecklist
    } else {
      if (favorite !== Boolean(spot.favorite)) fields.favorite = favorite
      if (JSON.stringify(finalChecklist) !== JSON.stringify(spot.checklist || [])) {
        fields.checklist = finalChecklist
      }
    }
    if (editing) {
      const ok = await updateSpot(spot.id, fields)
      if (ok) onSaved(spot.id)
    } else {
      const created = await addSpot(fields)
      if (created) onSaved(created.id)
    }
    setSaving(false)
  }

  // Mode ajustement : le formulaire se replie en barre pour laisser la carte
  // visible (surtout sur mobile où il occupe tout l'écran). La saisie est
  // conservée : le composant reste monté.
  if (adjusting) {
    return (
      <div className="glass pointer-events-auto pb-safe flex w-full items-center gap-3 rounded-none px-4 py-3 sm:rounded-2xl">
        <span className="text-xl">📍</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-zinc-400">Déplace le marqueur rose ou touche la carte</p>
          <p className="font-mono text-sm text-zinc-100">
            {lat != null && lng != null ? formatCoords(lat, lng) : '—'}
          </p>
        </div>
        <button
          onClick={onEndAdjust}
          className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
        >
          <Check size={15} /> OK
        </button>
      </div>
    )
  }

  return (
    <div className="glass pointer-events-auto pt-safe pb-safe flex h-full w-full flex-col overflow-hidden rounded-none sm:rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="flex-1 text-base font-bold text-zinc-100">
          {editing ? 'Modifier le spot' : 'Nouveau spot'}
        </h2>
        <button
          title={favorite ? 'Prochaine sortie ✓' : 'Marquer « prochaine sortie »'}
          onClick={() => setFavorite((v) => !v)}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60"
        >
          <Star size={16} className={favorite ? 'fill-amber-400 text-amber-400' : ''} />
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Position */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-800/50 px-3 py-2.5 text-xs">
          <span className="font-mono text-zinc-300">
            {lat != null && lng != null ? formatCoords(lat, lng) : 'Non placé'}
          </span>
          <button
            onClick={onStartAdjust}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-700/60 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-zinc-600/60"
          >
            <Crosshair size={12} /> Ajuster sur la carte
          </button>
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

        {/* Checklist matériel */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <ListChecks size={12} /> Matériel à prévoir
          </label>
          {checklist.length > 0 && (
            <div className="mb-2 space-y-1">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-2.5 py-1.5">
                  <span className="flex-1 text-sm text-zinc-200">{item.text}</span>
                  <button
                    onClick={() => setChecklist((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-zinc-500 transition hover:text-rose-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={checkItem}
              onChange={(e) => setCheckItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCheckItem()
                }
              }}
              placeholder="Lampe, gants, corde, batterie…"
              className="w-full rounded-xl bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-amber-400/50 focus:ring-2"
            />
            <button
              onClick={addCheckItem}
              className="flex shrink-0 items-center justify-center rounded-xl bg-zinc-700/70 px-3 text-zinc-200 transition hover:bg-zinc-600/70"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Photos ({photos.length}/{MAX_PHOTOS})
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => (
              <div key={i} className="relative overflow-hidden rounded-lg">
                <button onClick={() => setPreview(p)} className="block w-full">
                  <img src={p} alt="" className="aspect-square w-full object-cover" />
                </button>
                <button
                  title="Supprimer cette photo"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1.5 text-rose-300 transition hover:bg-black/90"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                onClick={() => !compressing && fileRef.current?.click()}
                disabled={compressing}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-zinc-700 text-zinc-500 transition hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-60"
              >
                {compressing ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
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

      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
