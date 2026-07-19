import { categoryById, statusById } from './constants'

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

// Waypoints GPX pour GPS / appli carto hors-ligne (Organic Maps, OsmAnd…).
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
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Urbex Atlas" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
</gpx>`
  download(`urbex-atlas-${stamp()}.gpx`, 'application/gpx+xml', gpx)
}

// Lit un export JSON de l'app et renvoie la liste de spots, ou lève une erreur.
export function parseImportedJson(text) {
  const data = JSON.parse(text)
  const spots = Array.isArray(data) ? data : data?.spots
  if (!Array.isArray(spots)) throw new Error('Format non reconnu')
  return spots.filter(
    (s) => s && typeof s.lat === 'number' && typeof s.lng === 'number' && typeof s.name === 'string'
  )
}
