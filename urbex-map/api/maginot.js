// Base des constructions de la Ligne Maginot — agrégée depuis l'export KML
// OFFICIEL de wikimaginot.eu (bouton « tout télécharger » du site ; licence
// attribution / non-commercial — crédit affiché dans l'app : wikimaginot.eu).
//
// L'index WIKIFULL.kml ne contient PAS les points : c'est une liste de
// <NetworkLink> vers un KML par secteur fortifié (vérifié en production via
// /api/ping?maginot=1). On suit donc les liens, on agrège tous les Placemark,
// et on renvoie une base compacte { points: [{id, name, lat, lng, wm}] }.
//
// Économie : réponse en cache CDN une semaine (le site source n'est touché
// qu'une fois par semaine, pas à chaque recherche) + cache mémoire du
// conteneur. Le client la garde 7 jours en IndexedDB et filtre localement.
export const config = { maxDuration: 60 }

const BUDGET_MS = 50000
const INDEX_URL = 'https://wikimaginot.eu/_kml_files/WIKIFULL.kml'
const UA = 'UrbexAtlas/3.5 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'

let memory = { ts: 0, points: null } // cache du conteneur (instances chaudes)

async function fetchText(url, signal, capMs) {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (signal) signal.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) ctrl.abort()
  const cap = setTimeout(() => ctrl.abort(), capMs)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.text()
  } finally {
    clearTimeout(cap)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

// Extrait les Placemark d'un KML de secteur → points {id, name, lat, lng, wm}.
// wm = id de la fiche construction (V70_construction_detail.php?id=…) si trouvé.
function parsePlacemarks(kml) {
  const out = []
  const blocks = kml.match(/<Placemark[\s>][\s\S]*?<\/Placemark>/g) || []
  for (const b of blocks) {
    const cm = b.match(/<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)/)
    if (!cm) continue
    const lng = Number(cm[1])
    const lat = Number(cm[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    let name = (b.match(/<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/) || [])[1] || null
    if (name) name = name.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
    const wm = (b.match(/V70_construction[^"'<]*[?&]id=(\d+)/) || [])[1] || null
    out.push({ id: wm ? `wm/${wm}` : `wm/${lat.toFixed(5)},${lng.toFixed(5)}`, name, lat, lng, wm })
  }
  return out
}

export default async function handler(req, res) {
  // Cache mémoire (24 h) : évite même le hit CDN→origine sur instance chaude.
  if (memory.points && Date.now() - memory.ts < 86400e3) {
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000')
    res.status(200).json({ count: memory.points.length, source: 'wikimaginot.eu', points: memory.points })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUDGET_MS)
  try {
    const index = await fetchText(INDEX_URL, controller.signal, 15000)
    // Liens des KML de secteurs (uniquement le domaine officiel).
    const hrefs = [...new Set((index.match(/<href>\s*([^<]+?)\s*<\/href>/g) || [])
      .map((h) => h.replace(/<\/?href>/g, '').trim())
      .filter((u) => /^https:\/\/(www\.)?wikimaginot\.eu\//i.test(u) && /\.kml(\?|$)/i.test(u)))]
      .slice(0, 80)

    // L'index peut aussi contenir des Placemark inline (forme défensive).
    const inline = parsePlacemarks(index)

    const chunks = await Promise.allSettled(hrefs.map((u) => fetchText(u, controller.signal, 20000).then(parsePlacemarks)))
    const seen = new Set()
    const points = []
    for (const list of [inline, ...chunks.map((c) => (c.status === 'fulfilled' ? c.value : []))]) {
      for (const p of list) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        points.push(p)
        if (points.length >= 25000) break
      }
    }
    const failed = chunks.filter((c) => c.status !== 'fulfilled').length

    if (!points.length) {
      // Échec total : surtout NE PAS mettre une base vide en cache CDN une semaine.
      res.setHeader('Cache-Control', 'no-store')
      res.status(502).json({ error: 'wikimaginot injoignable', sectors: hrefs.length, failed })
      return
    }
    memory = { ts: Date.now(), points }
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000')
    res.status(200).json({ count: points.length, sectors: hrefs.length, failed, source: 'wikimaginot.eu', points })
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: e?.message || 'exception' })
  } finally {
    clearTimeout(timer)
  }
}
