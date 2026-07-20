import { distanceKm } from './geo'
import { parseWikipediaTag } from './wiki'
import { assessDanger } from './danger'

export const MAX_DISCOVER_RADIUS_KM = 100
// Le proxy serveur a un budget de 45 s (grand rayon = file d'attente Overpass) ;
// le client attend un peu plus pour ne pas abandonner avant la réponse serveur.
const REQUEST_TIMEOUT_MS = 55000

// Recherche de lieux potentiellement abandonnés autour d'un point via
// l'Overpass API (données OpenStreetMap, gratuit, sans clé). On cible les
// tags abandoned:* / disused:* / ruins / building=ruins / historic=ruins.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// On interroge des clés PRÉCISES (indexées par Overpass) plutôt qu'un motif
// générique « abandoned* » : c'est bien plus rapide et ça tient sur de grands
// rayons (le motif générique faisait expirer les requêtes ≥ ~50 km).
const KEYS = [
  'abandoned',
  'abandoned:building',
  'abandoned:railway',
  'abandoned:man_made',
  'abandoned:amenity',
  'abandoned:industrial',
  'abandoned:military',
  'abandoned:power',
  'abandoned:aeroway',
  'disused',
  'disused:building',
  'disused:railway',
  'disused:man_made',
  'disused:amenity',
  'disused:industrial',
  'disused:military',
  'disused:aeroway',
]

// Boîte englobante (rectangle) autour du centre. Un filtre bbox utilise
// l'index spatial d'Overpass et est BEAUCOUP plus rapide qu'un filtre
// « around » (qui calcule une distance pour chaque objet). On affine ensuite
// en cercle côté client.
function bboxOf(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32
  const dLng = radiusKm / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))
  return {
    s: lat - dLat,
    w: lng - dLng,
    n: lat + dLat,
    e: lng + dLng,
  }
}

function buildQuery(bbox) {
  const b = `(${bbox.s.toFixed(5)},${bbox.w.toFixed(5)},${bbox.n.toFixed(5)},${bbox.e.toFixed(5)})`
  const lines = KEYS.map((k) => `  nwr["${k}"]${b};`).join('\n')
  return `[out:json][timeout:45];
(
${lines}
  nwr["ruins"="yes"]${b};
  nwr["building"="ruins"]${b};
  nwr["historic"="ruins"]${b};
);
out center 500;`
}

const DEFAULT_NAME = {
  usine: 'Usine désaffectée',
  gare: 'Site ferroviaire abandonné',
  chateau: 'Château / manoir en ruine',
  maison: 'Bâtiment abandonné',
  hopital: 'Hôpital / sanatorium désaffecté',
  eglise: 'Édifice religieux abandonné',
  ecole: 'École désaffectée',
  militaire: 'Site militaire abandonné',
  tunnel: 'Souterrain / mine',
  piscine: 'Piscine abandonnée',
  parc: 'Parc / attraction abandonné',
  hotel: 'Hôtel / restaurant abandonné',
  ferme: 'Ferme / grange abandonnée',
  autre: 'Lieu abandonné',
}

function categorize(tags) {
  const hay = Object.entries(tags)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
    .toLowerCase()
  const has = (re) => re.test(hay)
  if (has(/rail|tram|subway|station|locomotive|wagon/)) return 'gare'
  if (has(/mine|quarry|adit|tunnel|cave/)) return 'tunnel'
  if (has(/military|bunker|barrack|fort|airfield|nuclear/)) return 'militaire'
  if (has(/hospital|sanatorium|asylum|clinic/)) return 'hopital'
  if (has(/castle|manor|chateau|palace/)) return 'chateau'
  if (has(/church|chapel|monaster|convent|cathedral|religious|abbey/)) return 'eglise'
  if (has(/school|university|college|kindergarten/)) return 'ecole'
  if (has(/factor|works|industrial|manufactur|power|plant\b|mill|refinery|warehouse|silo|works=/)) return 'usine'
  if (has(/swimming|pool|lido/)) return 'piscine'
  if (has(/theme_park|attraction|amusement|fairground/)) return 'parc'
  if (has(/hotel|restaurant|motel|resort/)) return 'hotel'
  if (has(/farm|barn|greenhouse|stable/)) return 'ferme'
  if (has(/house|residential|apartments|villa|hut|cabin|building=yes|building=house/)) return 'maison'
  return 'autre'
}

// Un élément « négatif » (abandoned=no…) ne doit pas être proposé.
function qualifies(tags) {
  for (const [k, v] of Object.entries(tags)) {
    if (/^(abandoned|disused)/.test(k) && v && v.toLowerCase() !== 'no') return true
  }
  if (tags.ruins === 'yes') return true
  if (tags.building === 'ruins') return true
  if (tags.historic === 'ruins') return true
  return false
}

function tagline(tags) {
  const key = Object.keys(tags).find((k) => /^(abandoned|disused)/.test(k) && tags[k] !== 'no')
  if (key) return `${key}=${tags[key]}`
  if (tags.building === 'ruins') return 'building=ruins'
  if (tags.ruins === 'yes') return 'ruins=yes'
  if (tags.historic === 'ruins') return 'historic=ruins'
  return 'OpenStreetMap'
}

// Score d'« intérêt » : un lieu documenté (Wikipédia/patrimoine) ou nommé
// remonte au-dessus des ruines anonymes.
function interestOf(tags) {
  const wiki = parseWikipediaTag(tags.wikipedia) || (tags.wikidata ? { wikidata: tags.wikidata } : null)
  const heritage = Boolean(tags.heritage || tags['heritage:operator'] || tags.historic)
  const hasName = Boolean(tags.name || tags['name:fr'])
  const hasImage = Boolean(tags.image || tags.wikimedia_commons)
  let score = 0
  if (tags.wikipedia || tags.wikidata) score += 6
  if (heritage) score += 4
  if (hasName) score += 3
  if (hasImage) score += 2
  if (tags.start_date || tags.architect || tags['building:architecture']) score += 1
  const notable = Boolean(tags.wikipedia || tags.wikidata || heritage)
  return { score, notable, wiki: parseWikipediaTag(tags.wikipedia), wikidata: tags.wikidata || null }
}

// Libellé de type précis à partir du tag « domaine=valeur » qualifiant.
const TYPE_LABELS = {
  'railway=station': 'Ancienne gare',
  'railway=halt': 'Ancienne halte ferroviaire',
  'railway=rails': 'Voie ferrée désaffectée',
  'railway=tracks': 'Voie ferrée désaffectée',
  'railway=platform': 'Quai désaffecté',
  'railway=turntable': 'Plaque tournante ferroviaire',
  'railway=yard': 'Gare de triage abandonnée',
  'amenity=hospital': 'Ancien hôpital',
  'amenity=fire_station': 'Ancienne caserne de pompiers',
  'amenity=school': 'Ancienne école',
  'amenity=prison': 'Ancienne prison',
  'amenity=place_of_worship': 'Édifice religieux désaffecté',
  'amenity=fuel': 'Ancienne station-service',
  'amenity=cinema': 'Ancien cinéma',
  'amenity=theatre': 'Ancien théâtre',
  'amenity=restaurant': 'Ancien restaurant',
  'man_made=works': 'Ancienne usine',
  'man_made=mineshaft': 'Ancien puits de mine',
  'man_made=adit': 'Ancienne galerie de mine',
  'man_made=chimney': 'Cheminée d’usine',
  'man_made=water_works': 'Ancienne station des eaux',
  'military=bunker': 'Ancien bunker',
  'military=barracks': 'Anciennes casernes',
  'military=airfield': 'Ancien aérodrome militaire',
  'power=plant': 'Ancienne centrale électrique',
  'power=substation': 'Ancien poste électrique',
  'building=hospital': 'Ancien hôpital',
  'building=church': 'Église désaffectée',
  'building=chapel': 'Chapelle désaffectée',
  'building=school': 'Ancienne école',
  'building=industrial': 'Bâtiment industriel abandonné',
  'building=warehouse': 'Entrepôt abandonné',
  'building=farm': 'Ferme abandonnée',
  'building=ruins': 'Bâtiment en ruine',
}

function primaryTag(tags) {
  const key = Object.keys(tags).find((k) => /^(abandoned|disused)/.test(k) && tags[k] && tags[k] !== 'no')
  if (key) {
    const domain = key.includes(':') ? key.split(':')[1] : key
    return { domain, value: tags[key] }
  }
  if (tags.historic === 'ruins') return { domain: 'historic', value: 'ruins' }
  if (tags.building === 'ruins') return { domain: 'building', value: 'ruins' }
  if (tags.ruins === 'yes') return { domain: 'ruins', value: 'yes' }
  return null
}

// Détails exploitables tirés des tags OSM : type précis, faits (année, ancien
// nom, exploitant, patrimoine…), description éventuelle.
function describeSite(tags, category) {
  const p = primaryTag(tags)
  let typeLabel = DEFAULT_NAME[category]
  if (p) {
    typeLabel = TYPE_LABELS[`${p.domain}=${p.value}`] || TYPE_LABELS[`building=${tags.building}`] || typeLabel
  }
  const name =
    tags.name || tags['name:fr'] || tags.old_name || tags.former_name || typeLabel

  const facts = []
  const year = (tags.start_date || '').match(/\d{3,4}/)?.[0]
  if (year) facts.push({ label: 'Année', value: year })
  if (tags.old_name || tags.former_name) facts.push({ label: 'Ancien nom', value: tags.old_name || tags.former_name })
  if (tags.operator) facts.push({ label: 'Exploitant', value: tags.operator })
  if (tags.heritage || tags['heritage:operator'] || /monument|classé|inscrit/i.test(tags.historic || ''))
    facts.push({ label: 'Patrimoine', value: 'Protégé / historique' })
  if (tags.architect) facts.push({ label: 'Architecte', value: tags.architect })

  return { name, typeLabel, facts, description: tags.description || tags.note || null }
}

function parseElements(elements, center, radiusKm) {
  const seen = new Set()
  const out = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    const tags = el.tags || {}
    if (!qualifies(tags)) continue
    const dist = distanceKm(center, { lat, lng })
    // On a interrogé un rectangle : on ne garde que ce qui est vraiment dans
    // le cercle demandé (+5 % de marge).
    if (radiusKm && dist > radiusKm * 1.05) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    const category = categorize(tags)
    const { score, notable, wiki, wikidata } = interestOf(tags)
    const details = describeSite(tags, category)
    const danger = assessDanger(category, tags)
    out.push({
      id,
      lat,
      lng,
      name: details.name,
      category,
      typeLabel: details.typeLabel,
      facts: details.facts,
      osmDescription: details.description,
      danger, // { level, label, color, risks }
      tagline: tagline(tags),
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      distanceKm: dist,
      score,
      notable,
      wiki, // { lang, title } ou null
      wikipedia: tags.wikipedia || null, // brut, pour l'enrichissement serveur
      wikidata: wikidata, // brut (Q…)
      wikidataUrl: wikidata ? `https://www.wikidata.org/wiki/${wikidata}` : null,
    })
  }
  // Les lieux documentés/notables d'abord, puis les plus proches.
  return out.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
}

async function fetchJson(url, opts, extSignal) {
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => c.abort()
  extSignal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { ...opts, signal: c.signal })
    if (!res.ok) {
      // Le proxy renvoie un détail par miroir (ex. « de:HTTP 429, fr:HTTP 400 »)
      // qui permet de diagnostiquer précisément la cause.
      let detail = ''
      try {
        const j = await res.json()
        if (j?.detail) detail = ` — ${j.detail}`
      } catch {
        /* corps non-JSON : on garde juste le code */
      }
      throw new Error(`HTTP ${res.status}${detail}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
    extSignal?.removeEventListener('abort', onAbort)
  }
}

// En dev (vite), il n'y a pas de fonction serverless : on interroge alors les
// miroirs Overpass directement. En production, on passe toujours par le proxy.
const isLocalhost =
  typeof location !== 'undefined' && /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname)

export async function discoverAbandoned(center, radiusKm, { signal } = {}) {
  const radius = Math.min(Math.max(radiusKm, 0.5), MAX_DISCOVER_RADIUS_KM)
  const query = buildQuery(bboxOf(center.lat, center.lng, radius))

  // 1) Proxy même origine (POST) : chemin fiable en production. La requête
  // Overpass voyage dans le corps → pas d'URL géante, et « /api/discover »
  // n'a aucun mot susceptible d'être filtré par un bloqueur.
  try {
    const data = await fetchJson(
      '/api/discover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: query }),
      },
      signal,
    )
    return parseElements(data.elements || [], center, radius)
  } catch (proxyErr) {
    if (signal?.aborted) throw proxyErr
    // En production, le proxy EST le chemin fiable : on remonte sa vraie erreur
    // tout de suite (un repli vers Overpass en direct échouerait pareil et
    // masquerait la cause). Le repli n'a de sens qu'en dev local.
    if (!isLocalhost) throw proxyErr
    const q = encodeURIComponent(query)
    try {
      const data = await Promise.any(ENDPOINTS.map((ep) => fetchJson(`${ep}?data=${q}`, {}, signal)))
      return parseElements(data.elements || [], center, radius)
    } catch (err) {
      if (signal?.aborted) throw err
      throw err?.errors?.[0] || err || proxyErr || new Error('réseau')
    }
  }
}

// Enrichissement des lieux (histoire Wikipédia + analyse IA gratuite si
// configurée), côté serveur. Best-effort : renvoie une map { id: enrichissement }
// et ne casse jamais la découverte si ça échoue.
export async function enrichDiscoveries(sites, { signal } = {}) {
  if (!sites?.length) return {}
  const payload = sites.slice(0, 16).map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    name: r.name,
    category: r.category,
    typeLabel: r.typeLabel,
    tagline: r.tagline,
    wikipedia: r.wikipedia,
    wikidata: r.wikidata,
    danger: r.danger,
  }))
  try {
    const data = await fetchJson(
      '/api/enrich',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sites: payload }),
      },
      signal,
    )
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}
