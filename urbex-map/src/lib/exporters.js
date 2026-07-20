import { CATEGORIES, STATUSES, MAX_PHOTOS, categoryById, statusById } from './constants'

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const stamp = () => new Date().toISOString().slice(0, 10)

// Sauvegarde complète (ré-importable dans l'app).
export function exportJson(spots) {
  const payload = { app: 'urbex-atlas', version: 1, exportedAt: new Date().toISOString(), spots }
  download(`urbex-atlas-${stamp()}.json`, 'application/json', JSON.stringify(payload, null, 2))
}

const xmlEscape = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Waypoints + itinéraires d'approche GPX pour GPS / appli carto hors-ligne
// (Organic Maps, OsmAnd…).
export function exportGpx(spots) {
  const wpts = spots
    .map((s) => {
      const cat = categoryById(s.category)
      const st = statusById(s.status)
      const desc = [`Statut : ${st.label}`, `Catégorie : ${cat.label}`, s.description].filter(Boolean).join('\n')
      return `  <wpt lat="${s.lat}" lon="${s.lng}">
    <name>${xmlEscape(`${cat.emoji} ${s.name}`)}</name>
    <desc>${xmlEscape(desc)}</desc>
  </wpt>`
    })
    .join('\n')
  const parkings = spots
    .filter((s) => s.approach?.waypoints?.[0])
    .map((s) => {
      const p = s.approach.waypoints[0]
      return `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${xmlEscape(`🅿️ Parking — ${s.name}`)}</name>
  </wpt>`
    })
    .join('\n')
  const tracks = spots
    .filter((s) => s.approach?.geometry?.length > 1)
    .map(
      (s) => `  <trk>
    <name>${xmlEscape(`Approche — ${s.name}`)}</name>
    <trkseg>
${s.approach.geometry.map(([la, lo]) => `      <trkpt lat="${la}" lon="${lo}"/>`).join('\n')}
    </trkseg>
  </trk>`
    )
    .join('\n')
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Urbex Atlas" xmlns="http://www.topografix.com/GPX/1/1">
${[wpts, parkings, tracks].filter(Boolean).join('\n')}
</gpx>`
  download(`urbex-atlas-${stamp()}.gpx`, 'application/gpx+xml', gpx)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cleanString = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const cleanDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)
const isPhoto = (p) =>
  typeof p === 'string' && p.length < 2_000_000 && (p.startsWith('data:image/') || /^https?:\/\//.test(p))

const cleanApproach = (a) => {
  if (!a || typeof a !== 'object') return null
  const waypoints = Array.isArray(a.waypoints)
    ? a.waypoints
        .filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
        .slice(0, 20)
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    : []
  if (!waypoints.length) return null
  const geometry = Array.isArray(a.geometry)
    ? a.geometry
        .filter((pt) => Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
        .slice(0, 5000)
        .map((pt) => [Number(pt[0]), Number(pt[1])])
    : []
  const distance = Number(a.distance)
  return {
    waypoints,
    geometry,
    distance: Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : 0,
    mode: a.mode === 'direct' ? 'direct' : 'trail',
  }
}

// Lit un export JSON et renvoie une liste de spots ASSAINIE (liste blanche de
// champs, bornes et types vérifiés) — un fichier corrompu ou malveillant ne
// peut pas injecter de données arbitraires. Lève une erreur si illisible.
export function parseImportedJson(text) {
  const data = JSON.parse(text)
  const spots = Array.isArray(data) ? data : data?.spots
  if (!Array.isArray(spots)) throw new Error('Format non reconnu')
  const catIds = new Set(CATEGORIES.map((c) => c.id))
  const stIds = new Set(STATUSES.map((s) => s.id))
  const cleaned = []
  for (const s of spots) {
    if (!s || typeof s !== 'object') continue
    const name = cleanString(s.name, 200).trim()
    const lat = Number(s.lat)
    const lng = Number(s.lng)
    if (!name || !Number.isFinite(lat) || lat < -90 || lat > 90) continue
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) continue
    const danger = Math.round(Number(s.danger))
    const spot = {
      name,
      lat,
      lng,
      category: catIds.has(s.category) ? s.category : 'autre',
      status: stIds.has(s.status) ? s.status : 'repere',
      danger: Number.isFinite(danger) ? Math.min(5, Math.max(1, danger)) : 2,
      description: cleanString(s.description, 5000),
      accessNotes: cleanString(s.accessNotes, 5000),
      photos: Array.isArray(s.photos) ? s.photos.filter(isPhoto).slice(0, MAX_PHOTOS) : [],
      approach: cleanApproach(s.approach),
      visitedAt: cleanDate(s.visitedAt),
      createdBy: cleanString(s.createdBy, 100),
    }
    if (typeof s.id === 'string' && UUID_RE.test(s.id)) spot.id = s.id
    const createdAt = cleanDate(s.createdAt)
    const updatedAt = cleanDate(s.updatedAt)
    if (createdAt) spot.createdAt = createdAt
    if (updatedAt) spot.updatedAt = updatedAt
    cleaned.push(spot)
  }
  return cleaned
}
