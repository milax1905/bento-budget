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

const BUDGET_MS = 55000
const UA = 'UrbexAtlas/2.20 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'
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
    `&gscoord=${lat}%7C${lng}&gsradius=150&gslimit=1&format=json&origin=*`
  const d = await getJson(url, signal)
  const hit = d.query?.geosearch?.[0]
  if (!hit) return null
  return { lang: 'fr', title: hit.title, dist: Math.round(hit.dist) }
}

// Un article « attrapé à côté » ne doit pas être rattaché au lieu s'il décrit
// une commune ou un site clairement ACTIF (école en service, musée…), sauf s'il
// parle explicitement d'abandon.
const GEO_ACTIVE = /est une commune|établissement (scolaire|d'enseignement)|\bcollège\b|\blycée\b|en activité|en service|ouvert au public|\bmusée\b|actuel|mairie/i
const GEO_ABANDON = /abandonn|désaffect|en ruine|ancien|fermé|détruit|friche|vestige/i

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
  // Recherche géographique de secours : SEULEMENT si le lieu n'a pas de nom
  // curé (les lieux « Ma carte » ont un nom fiable → ne pas leur coller un
  // article voisin). Et on écarte les articles de commune / site actif.
  if (site.source !== 'perso') {
    const geo = await geoTitle(site.lat, site.lng, signal).catch(() => null)
    if (geo) {
      const s = await wikiSummary(geo.lang, geo.title, signal).catch(() => null)
      if (s && (!GEO_ACTIVE.test(s.extract) || GEO_ABANDON.test(s.extract))) {
        return { ...s, source: 'geo', dist: geo.dist }
      }
    }
  }
  return null
}

// ── Analyse IA (Google Gemini, offre gratuite) ────────────────────────────
// Un seul appel pour tout le lot : l'IA lit les infos de chaque lieu (tags +
// extrait Wikipédia) et renvoie, par identifiant, une analyse structurée.
async function aiAnalyze(sites, wikiMap, signal) {
  const key = (process.env.GEMINI_API_KEY || '').trim()
  if (!key) return { map: {}, error: null }

  const brief = sites.map((s) => ({
    id: s.id,
    type: s.typeLabel || s.category,
    tags: s.tagline,
    wikipedia: wikiMap[s.id]?.extract || null,
  }))

  const prompt = `Tu es un expert en urbex (exploration de lieux abandonnés) francophone. Pour CHAQUE lieu ci-dessous, rédige une analyse en t'appuyant sur : le type OpenStreetMap fourni, l'extrait Wikipédia s'il existe, TES PROPRES CONNAISSANCES du lieu, et une recherche web quand l'outil est disponible. Si tu identifies le lieu de façon fiable, donne son histoire et ce qu'on peut y voir. Si tu n'as pas d'info fiable, reste général et honnête ("peu d'informations publiques sur ce lieu précis") — ne FABRIQUE JAMAIS de faux détails (fausses dates, faux noms, faux événements).

FILTRAGE STRICT (le plus important) : ne retiens que les lieux réellement
ABANDONNÉS et explorables (urbex). Mets "urbex": false pour TOUT ce qui n'est pas
un vrai spot abandonné, notamment :
- une commune, un village, un hameau, un quartier (ex. "X est une commune française") ;
- un élément géographique (rivière, lac, montagne, col, forêt…) ;
- un site encore ACTIF, restauré, entretenu, habité, ouvert au public ou
  touristique (château visitable, musée, monument classé entretenu, mairie, gare
  en service, église paroissiale active) ;
- un lieu réhabilité / reconverti (n'est plus explorable).
Mets "urbex": true UNIQUEMENT si le lieu est clairement à l'abandon / en ruine /
désaffecté et donc explorable (friche, usine/mine/sanatorium/fort/château
désaffecté, bâtiment abandonné…). En cas de doute réel, mets false.

Pour chaque lieu renvoie :
- "urbex" : true (vrai spot abandonné explorable) | false (à écarter).
- "resume" : 2 à 3 phrases utiles à un explorateur (ce que c'est, son histoire si connue, ce qu'on peut y voir, s'il est abandonné ou encore actif).
- "interet" : entier de 1 (quelconque/actif) à 5 (incontournable pour l'urbex).
- "verdict" : "top" | "moyen" | "quelconque".
- "danger" : { "niveau": entier 1 (faible) à 4 (extrême), "label": "Faible|Modéré|Élevé|Extrême", "risques": [2 à 4 risques concrets] }.
- "conseils" : 1 phrase de conseil de prudence/accès.

Réponds STRICTEMENT en JSON, un objet dont les clés sont les identifiants :
{"<id>": {"urbex": true, "resume": "...", "interet": 3, "verdict": "moyen", "danger": {"niveau": 2, "label": "Modéré", "risques": ["..."]}, "conseils": "..."}}

Lieux :
${JSON.stringify(brief)}`

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`

  // Extrait un objet JSON d'une réponse texte : soit c'est déjà du JSON pur,
  // soit il est entouré de prose / ```json … ``` (cas du grounding web).
  const extractJson = (text) => {
    if (!text) return {}
    try {
      const p = JSON.parse(text)
      return p && typeof p === 'object' ? p : {}
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return {}
      try {
        const p = JSON.parse(m[0])
        return p && typeof p === 'object' ? p : {}
      } catch {
        return {}
      }
    }
  }

  // Appel Gemini. Avec recherche web (grounding Google), on ne force pas le mime
  // JSON (incompatible) → on extrait le JSON du texte. Sans, on force le JSON.
  // Renvoie l'objet analysé. Lève une erreur PARLANTE (code HTTP, finishReason,
  // blocage…) si l'appel échoue ou ne produit rien d'exploitable, pour qu'on
  // sache pourquoi l'IA n'a rien renvoyé. `capMs` borne la durée de CET appel
  // (le grounding web est parfois lent) : s'il dépasse, on l'annule pour garder
  // du budget au repli JSON, sans couper toute la requête.
  const callGemini = async (useSearch, capMs) => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, ...(useSearch ? {} : { responseMimeType: 'application/json' }) },
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
    }
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    const cap = capMs ? setTimeout(() => ac.abort(), capMs) : null
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal })
      if (!r.ok) {
        let detail = ''
        try {
          detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 160)
        } catch {
          /* corps illisible : on garde juste le code */
        }
        throw new Error(`HTTP ${r.status}${detail ? ' ' + detail : ''}`)
      }
      const data = await r.json()
      const cand = data?.candidates?.[0]
      const text = cand?.content?.parts?.map((p) => p.text || '').join('') || ''
      const map = extractJson(text)
      if (Object.keys(map).length === 0) {
        // Rien d'exploitable : on remonte la cause probable (tokens épuisés,
        // sécurité, requête bloquée…) plutôt qu'un silencieux objet vide.
        const why =
          cand?.finishReason && cand.finishReason !== 'STOP'
            ? `finishReason ${cand.finishReason}`
            : data?.promptFeedback?.blockReason
              ? `bloqué (${data.promptFeedback.blockReason})`
              : 'réponse vide/illisible'
        throw new Error(why)
      }
      return map
    } finally {
      if (cap) clearTimeout(cap)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }

  // 1) On tente AVEC recherche web (analyse la plus riche), bornée à ~25 s.
  // 2) Repli SANS recherche (mime JSON forcé, chemin le plus fiable) dès que le
  //    grounding échoue, est trop lent, ou ne couvre pas TOUS les lieux : le
  //    mode JSON pur comble alors les manques (les résultats « grounded »
  //    restent prioritaires là où ils existent). Sinon aucune analyse IA ne
  //    s'afficherait — c'est le filet de sécurité.
  let grounded = {}
  let lastError = null
  try {
    grounded = await callGemini(true, 25000)
  } catch (e) {
    lastError = `web: ${e.message}`
  }
  const missing = sites.some((s) => !grounded[s.id])
  let plain = {}
  if (missing) {
    try {
      plain = await callGemini(false)
    } catch (e) {
      lastError = lastError ? `${lastError} | json: ${e.message}` : `json: ${e.message}`
    }
  }
  const map = { ...plain, ...grounded }
  return { map, error: Object.keys(map).length ? null : lastError || 'aucune analyse renvoyée' }
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
  const sites = Array.isArray(bodyIn?.sites) ? bodyIn.sites.slice(0, 20) : []
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
    let aiError = null
    if ((process.env.GEMINI_API_KEY || '').trim()) {
      aiEnabled = true
      const ai = await aiAnalyze(sites, wikiMap, controller.signal).catch((e) => ({ map: {}, error: e?.message || 'erreur IA' }))
      aiMap = ai.map || {}
      aiError = ai.error || null
    }

    const out = {}
    for (const s of sites) out[s.id] = { wiki: wikiMap[s.id] || null, ai: aiMap[s.id] || null }
    // Cache court quand l'IA a échoué (pour retenter vite au prochain essai) ;
    // cache long sinon (le contenu bouge peu).
    const aiOk = !aiEnabled || Object.keys(aiMap).length > 0
    res.setHeader('Cache-Control', aiOk ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store')
    res.status(200).json({ aiEnabled, aiError, results: out })
  } catch {
    res.status(200).json({ aiEnabled: false, aiError: null, results: {} })
  } finally {
    clearTimeout(timer)
  }
}
