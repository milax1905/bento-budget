// Proxy « Découvrir » côté serveur (fonction serverless Vercel).
// Le navigateur n'appelle QUE /api/discover (même origine que l'app) : aucun
// souci de CORS, de bloqueur de contenu, ni de relais privé iCloud côté client.
//
// Recherche MULTI-SOURCES, en parallèle :
//   • OpenStreetMap (Overpass) — via plusieurs miroirs, le premier qui répond
//     gagne ; un plafond global garantit une vraie réponse HTTP (jamais de
//     connexion coupée « Load failed »).
//   • Wikidata (query.wikidata.org) — lieux documentés (ruines, villages
//     fantômes…) autour du point, souvent absents des tags OSM « abandoned ».
// Si Overpass est lent/injoignable mais que Wikidata répond, on renvoie quand
// même les résultats Wikidata (et inversement).
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const UA = 'UrbexAtlas/2.16 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': UA,
  Accept: 'application/json',
}

export const config = { maxDuration: 60 }
const BUDGET_MS = 45000

function label(ep) {
  if (ep.includes('overpass-api.de')) return 'de'
  if (ep.includes('kumi')) return 'kumi'
  if (ep.includes('osm.ch')) return 'ch'
  if (ep.includes('private.coffee')) return 'coffee'
  if (ep.includes('openstreetmap.fr')) return 'fr'
  return 'x'
}

// Corps : { data: <QL Overpass>, geo: { lat, lng, radiusKm } }. GET ?data= aussi.
function getBody(req) {
  if (req.method === 'GET') {
    return { data: typeof req.query?.data === 'string' ? req.query.data : '', geo: null }
  }
  let b = req.body
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b)
    } catch {
      return { data: '', geo: null }
    }
  }
  return { data: b && typeof b.data === 'string' ? b.data : '', geo: b?.geo || null }
}

// Wikipédia (3ᵉ source) : articles géolocalisés autour du point, filtrés sur un
// titre évoquant un lieu explorable (fort, château, ruine, mine, usine,
// sanatorium…). Le rayon geosearch de Wikipédia est plafonné à 10 km ; au-delà,
// OSM et Wikidata couvrent le reste. Best-effort.
// Mots-clés au TITRE (frontières de mot pour éviter « fort » dans « Rochefort »).
const WP_KEYWORDS =
  /ch[aâ]teau|manoir|\bfort\b|forteresse|citadelle|redoute|blockhaus|bunker|caserne|ruine|abbaye|prieur|monast|couvent|chartreuse|sanatorium|h[oô]pital|asile|pr[eé]ventorium|orphelinat|\busine\b|manufacture|fonderie|aci[eé]rie|verrerie|tuilerie|briqueterie|filature|papeterie|minoterie|\bmine\b|carri[eè]re|ardoisi[eè]re|tunnel|viaduc|aqueduc|\bmoulin\b|\bsilo\b|gazom|centrale|barrage|t[eé]l[eé]ph[eé]rique|funiculaire|\bfriche\b|d[eé]saffect|abandonn/i

// Écarte les articles qui sont en fait des communes / lieux habités / éléments
// géographiques (repérés par leur courte description Wikipédia).
const WP_EXCLUDE =
  /commune (fran|de |asso)|est une commune|ancienne commune|\bvillage\b|hameau|rivi[eè]re|fleuve|ruisseau|torrent|\blac\b|[eé]tang|massif|sommet|montagne|\bcol de|cours d'eau|quartier|arrondissement|\bcanton\b|paroisse|a[eé]roport/i

async function wpJson(url, signal) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal })
  if (!r.ok) throw new Error('wp ' + r.status)
  return r.json()
}

async function wikipediaAround(lat, lng, radiusKm, signal) {
  const rad = Math.min(Math.max(Number(radiusKm) || 5, 1), 10) * 1000
  const gs = await wpJson(
    `https://fr.wikipedia.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat}%7C${lng}&gsradius=${rad}&gslimit=200&format=json&formatversion=2&origin=*`,
    signal,
  )
  let cands = (gs.query?.geosearch || []).filter((g) => g.title && g.lat != null && g.lon != null && WP_KEYWORDS.test(g.title))
  if (!cands.length) return []
  // 2ᵉ passe : on récupère la description courte pour écarter communes/reliefs.
  try {
    const ids = cands.map((c) => c.pageid).filter(Boolean).slice(0, 50).join('|')
    if (ids) {
      const dd = await wpJson(
        `https://fr.wikipedia.org/w/api.php?action=query&prop=description&pageids=${ids}&format=json&formatversion=2&origin=*`,
        signal,
      )
      const desc = {}
      for (const p of dd.query?.pages || []) desc[p.pageid] = p.description || ''
      cands = cands.filter((c) => !WP_EXCLUDE.test(desc[c.pageid] || ''))
    }
  } catch {
    /* pas de descriptions : on garde le filtrage par titre seul */
  }
  return cands.map((g) => ({ pageid: g.pageid, title: g.title, lat: g.lat, lng: g.lon }))
}

// Wikidata : lieux « ruines » (et sous-classes) + villages fantômes autour du
// point, avec coordonnées. Best-effort.
async function wikidataAround(lat, lng, radiusKm, signal) {
  const r = Math.min(Math.max(Number(radiusKm) || 5, 1), 100)
  const q = `SELECT ?item ?itemLabel ?coord WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${r}" .
  }
  { ?item wdt:P31/wdt:P279* wd:Q19860854 . } UNION { ?item wdt:P31 wd:Q74047 . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} LIMIT 80`
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
    signal,
  })
  if (!res.ok) throw new Error('wd ' + res.status)
  const d = await res.json()
  const out = []
  for (const b of d.results?.bindings || []) {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || '')
    if (!m) continue
    const qid = (b.item?.value || '').split('/').pop()
    if (!qid) continue
    out.push({ qid, name: b.itemLabel?.value || null, lat: parseFloat(m[2]), lng: parseFloat(m[1]) })
  }
  return out
}

export default async function handler(req, res) {
  const { data, geo } = getBody(req)
  if (!data || data.length > 20000) {
    res.status(400).json({ error: 'requête invalide' })
    return
  }
  const body = 'data=' + encodeURIComponent(data)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUDGET_MS)

  const attempt = async (ep) => {
    const r = await fetch(ep, { method: 'POST', headers: HEADERS, body, signal: controller.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const text = await r.text()
    if (!text.trimStart().startsWith('{')) throw new Error('non-JSON')
    return text
  }

  // Overpass (le 1er miroir qui répond gagne) + Wikidata + Wikipédia, en parallèle.
  const overpassP = Promise.any(ENDPOINTS.map(attempt)).then(
    (text) => ({ ok: true, text }),
    (agg) => ({ ok: false, agg }),
  )
  const hasGeo = geo && geo.lat != null && geo.lng != null
  const wikidataP = hasGeo
    ? wikidataAround(geo.lat, geo.lng, geo.radiusKm, controller.signal).catch(() => [])
    : Promise.resolve([])
  const wikipediaP = hasGeo
    ? wikipediaAround(geo.lat, geo.lng, geo.radiusKm, controller.signal).catch(() => [])
    : Promise.resolve([])

  try {
    const [op, wd, wp] = await Promise.all([overpassP, wikidataP, wikipediaP])
    controller.abort() // coupe les fetch encore en vol

    let elements = []
    if (op.ok) {
      try {
        elements = JSON.parse(op.text).elements || []
      } catch {
        /* JSON invalide : on garde [] */
      }
    }

    // Échec total (toutes les sources vides ET Overpass KO) → vrai code HTTP.
    if (!op.ok && elements.length === 0 && wd.length === 0 && wp.length === 0) {
      const errs = Array.isArray(op.agg?.errors) ? op.agg.errors : []
      const detail = ENDPOINTS.map((ep, i) => `${label(ep)}:${errs[i]?.message || '?'}`).join(', ')
      res.status(502).json({ error: 'Overpass injoignable', detail })
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.status(200).json({ elements, wikidata: wd, wikipedia: wp })
  } catch {
    res.status(502).json({ error: 'Découverte indisponible' })
  } finally {
    clearTimeout(timer)
  }
}
