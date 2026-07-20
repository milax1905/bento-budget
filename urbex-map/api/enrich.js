// Enrichissement des lieux découverts, côté serveur (fonction serverless).
//
// Deux niveaux, tous deux best-effort (ne cassent jamais la découverte) :
//   1) GRATUIT, sans configuration : histoire réelle via Wikipédia/Wikidata
//      (tag OSM wikipedia/wikidata, sinon recherche géographique autour du point).
//   2) IA GRATUITE, si la variable d'environnement GEMINI_API_KEY est définie :
//      Google Gemini (offre gratuite) analyse chaque lieu à partir des tags +
//      de l'extrait Wikipédia, écrit un résumé utile, évalue l'intérêt et le
//      danger, et FILTRE les lieux quelconques (verdict). L'appel se fait côté
//      serveur : aucun blocage réseau du navigateur (relais privé / bloqueur).
export const config = { maxDuration: 60 }

const BUDGET_MS = 25000
const UA = 'UrbexAtlas/2.12 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

function parseWikipediaTag(tag) {
  if (typeof tag !== 'string' || !tag.trim()) return null
  const m = tag.match(/^([a-z]{2,3}):(.+)$/i)
  if (m) return { lang: m[1].toLowerCase(), title: m[2].trim() }
  return { lang: 'fr', title: tag.trim() }
}

async function getJson(url, signal, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

async function wikiSummary(lang, title, signal) {
  const slug = encodeURIComponent(title.replace(/ /g, '_'))
  const d = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`, signal)
  if (!d || d.type === 'disambiguation' || !d.extract) return null
  return {
    title: d.title,
    extract: d.extract,
    thumbnail: d.thumbnail?.source || null,
    url: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${slug}`,
  }
}

async function fromWikidata(qid, signal) {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
    `&props=descriptions|claims|sitelinks&languages=fr|en&format=json&origin=*`
  const d = await getJson(url, signal)
  const ent = d.entities?.[qid]
  if (!ent) return null
  const lang = ent.sitelinks?.frwiki ? 'fr' : ent.sitelinks?.enwiki ? 'en' : null
  const title = ent.sitelinks?.frwiki?.title || ent.sitelinks?.enwiki?.title || null
  const description = ent.descriptions?.fr?.value || ent.descriptions?.en?.value || null
  let year = null
  const inc = ent.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time
  if (inc) {
    const m = String(inc).match(/(\d{3,4})-/)
    if (m) year = m[1]
  }
  const heritage = Boolean(ent.claims?.P1435)
  return { lang, title, description, year, heritage }
}

async function geoTitle(lat, lng, signal) {
  const url =
    `https://fr.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}%7C${lng}&gsradius=250&gslimit=1&format=json&origin=*`
  const d = await getJson(url, signal)
  const hit = d.query?.geosearch?.[0]
  if (!hit) return null
  return { lang: 'fr', title: hit.title, dist: Math.round(hit.dist) }
}

async function wikiFor(site, signal) {
  const wp = parseWikipediaTag(site.wikipedia)
  if (wp) {
    const s = await wikiSummary(wp.lang, wp.title, signal).catch(() => null)
    if (s) return { ...s, source: 'wikipedia' }
  }
  if (site.wikidata) {
    const wd = await fromWikidata(site.wikidata, signal).catch(() => null)
    if (wd) {
      const s = wd.title ? await wikiSummary(wd.lang, wd.title, signal).catch(() => null) : null
      if (s) return { ...s, year: wd.year, heritage: wd.heritage, source: 'wikidata' }
      if (wd.description)
        return {
          title: site.name || null,
          extract: wd.description,
          thumbnail: null,
          url: `https://www.wikidata.org/wiki/${site.wikidata}`,
          year: wd.year,
          heritage: wd.heritage,
          source: 'wikidata',
        }
    }
  }
  const geo = await geoTitle(site.lat, site.lng, signal).catch(() => null)
  if (geo) {
    const s = await wikiSummary(geo.lang, geo.title, signal).catch(() => null)
    if (s) return { ...s, source: 'geo', dist: geo.dist }
  }
  return null
}

// ── Analyse IA (Google Gemini, offre gratuite) ────────────────────────────
// Un seul appel pour tout le lot : l'IA lit les infos de chaque lieu (tags +
// extrait Wikipédia) et renvoie, par identifiant, une analyse structurée.
async function aiAnalyze(sites, wikiMap, signal) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return {}

  const brief = sites.map((s) => ({
    id: s.id,
    type: s.typeLabel || s.category,
    tags: s.tagline,
    wikipedia: wikiMap[s.id]?.extract || null,
  }))

  const prompt = `Tu es un expert en urbex (exploration de lieux abandonnés) francophone. Pour CHAQUE lieu ci-dessous, à partir uniquement des informations fournies (type OpenStreetMap + extrait Wikipédia s'il existe), rédige une analyse. N'invente JAMAIS de faits historiques précis (dates, noms, événements) si l'extrait Wikipédia ne les donne pas : dans ce cas, décris le type de lieu et reste général et honnête ("peu d'informations disponibles").

Pour chaque lieu renvoie :
- "resume" : 2 à 3 phrases utiles à un explorateur (ce que c'est, son histoire si connue, ce qu'on peut y voir).
- "interet" : entier de 1 (quelconque) à 5 (incontournable).
- "verdict" : "top" | "moyen" | "quelconque".
- "danger" : { "niveau": entier 1 (faible) à 4 (extrême), "label": "Faible|Modéré|Élevé|Extrême", "risques": [2 à 4 risques concrets] }.
- "conseils" : 1 phrase de conseil de prudence/accès.

Réponds STRICTEMENT en JSON, un objet dont les clés sont les identifiants :
{"<id>": {"resume": "...", "interet": 3, "verdict": "moyen", "danger": {"niveau": 2, "label": "Modéré", "risques": ["..."]}, "conseils": "..."}}

Lieux :
${JSON.stringify(brief)}`

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 },
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!r.ok) throw new Error('gemini HTTP ' + r.status)
  const data = await r.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    // Parfois entouré de ```json … ``` : on récupère le premier objet.
    const m = text.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : {}
  }
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export default async function handler(req, res) {
  let bodyIn = req.body
  if (typeof bodyIn === 'string') {
    try {
      bodyIn = JSON.parse(bodyIn)
    } catch {
      bodyIn = {}
    }
  }
  const sites = Array.isArray(bodyIn?.sites) ? bodyIn.sites.slice(0, 16) : []
  if (!sites.length) {
    res.status(400).json({ error: 'aucun site' })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUDGET_MS)
  try {
    // 1) Histoire Wikipédia/Wikidata (gratuit, toujours tenté).
    const wikiEntries = await Promise.all(
      sites.map(async (s) => [s.id, await wikiFor(s, controller.signal).catch(() => null)]),
    )
    const wikiMap = {}
    for (const [id, w] of wikiEntries) wikiMap[id] = w

    // 2) Analyse IA (si clé Gemini configurée) — best-effort.
    let aiMap = {}
    let aiEnabled = false
    if (process.env.GEMINI_API_KEY) {
      aiEnabled = true
      aiMap = await aiAnalyze(sites, wikiMap, controller.signal).catch(() => ({}))
    }

    const out = {}
    for (const s of sites) out[s.id] = { wiki: wikiMap[s.id] || null, ai: aiMap[s.id] || null }
    // Cache long au bord de Vercel (le contenu bouge peu).
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    res.status(200).json({ aiEnabled, results: out })
  } catch {
    res.status(200).json({ aiEnabled: false, results: {} })
  } finally {
    clearTimeout(timer)
  }
}
