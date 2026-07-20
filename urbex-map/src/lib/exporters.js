import { CATEGORIES, STATUSES, MAX_PHOTOS, categoryById, statusById } from './constants'

// Sur iOS (surtout en PWA installée), le téléchargement programmatique est
// ignoré : on passe par la feuille de partage quand elle est disponible
// (Enregistrer dans Fichiers, AirDrop…), sinon téléchargement classique.
async function download(filename, mime, content) {
  const file = new File([content], filename, { type: mime })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (err) {
      if (err.name === 'AbortError') return // partage annulé par l'utilisateur
      /* partage indisponible : repli sur le téléchargement */
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
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

// Couleur CSS #rrggbb -> format KML aabbggrr.
const kmlColor = (hex) => {
  const m = hex.match(/^#(..)(..)(..)$/)
  return m ? `ff${m[3]}${m[2]}${m[1]}` : 'ffffffff'
}

// Le contenu des balloons est en CDATA : seule la séquence ]]> doit être neutralisée.
const cdata = (s = '') => s.replace(/\]\]>/g, ']]&gt;')

// Export KML pour Google Earth : spots groupés par statut (épingles colorées),
// parkings et tracés d'approche.
export function exportKml(spots) {
  const styles = STATUSES.map(
    (st) => `  <Style id="st-${st.id}">
    <IconStyle><color>${kmlColor(st.color)}</color><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle>
  </Style>`
  ).join('\n')

  const folders = STATUSES.map((st) => {
    const inStatus = spots.filter((s) => s.status === st.id)
    if (!inStatus.length) return ''
    const placemarks = inStatus
      .map((s) => {
        const cat = categoryById(s.category)
        const desc = [
          `<b>${st.label}</b> — ${cat.label}<br/>Danger : ${s.danger}/5`,
          s.description ? s.description.replace(/\n/g, '<br/>') : '',
          s.accessNotes ? `🔑 Accès : ${s.accessNotes.replace(/\n/g, '<br/>')}` : '',
          `📍 ${s.lat}, ${s.lng}`,
          s.createdBy ? `Ajouté par ${s.createdBy}` : '',
        ]
          .filter(Boolean)
          .join('<br/><br/>')
        return `    <Placemark>
      <name>${xmlEscape(`${cat.emoji} ${s.name}`)}</name>
      <styleUrl>#st-${st.id}</styleUrl>
      <description><![CDATA[${cdata(desc)}]]></description>
      <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
    </Placemark>`
      })
      .join('\n')
    return `  <Folder>
    <name>${xmlEscape(st.label)}</name>
${placemarks}
  </Folder>`
  })
    .filter(Boolean)
    .join('\n')

  const approaches = spots.filter((s) => s.approach?.geometry?.length > 1 || s.approach?.waypoints?.[0])
  const approachFolder = approaches.length
    ? `  <Folder>
    <name>🥾 Approches</name>
${approaches
  .map((s) => {
    const parts = []
    const parking = s.approach.waypoints?.[0]
    if (parking) {
      parts.push(`    <Placemark>
      <name>${xmlEscape(`🅿️ Parking — ${s.name}`)}</name>
      <styleUrl>#st-parking</styleUrl>
      <Point><coordinates>${parking.lng},${parking.lat},0</coordinates></Point>
    </Placemark>`)
    }
    if (s.approach.geometry?.length > 1) {
      const coords = s.approach.geometry.map(([la, lo]) => `${lo},${la},0`).join(' ')
      parts.push(`    <Placemark>
      <name>${xmlEscape(`Approche — ${s.name}`)}</name>
      <styleUrl>#approach-line</styleUrl>
      <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>
    </Placemark>`)
    }
    return parts.join('\n')
  })
  .join('\n')}
  </Folder>`
    : ''

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Urbex Atlas</name>
${styles}
  <Style id="st-parking">
    <IconStyle><color>ffeb6325</color><Icon><href>https://maps.google.com/mapfiles/kml/shapes/parking_lot.png</href></Icon></IconStyle>
  </Style>
  <Style id="approach-line">
    <LineStyle><color>ff24bffb</color><width>4</width></LineStyle>
  </Style>
${[folders, approachFolder].filter(Boolean).join('\n')}
</Document>
</kml>`
  download(`urbex-atlas-${stamp()}.kml`, 'application/vnd.google-earth.kml+xml', kml)
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
