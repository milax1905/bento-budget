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
const UA = 'UrbexAtlas/2.23 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

// Modèles Gemini candidats, du plus souhaitable au moins : si celui configuré a
// été retiré par Google (cause probable d'« IA indisponible » alors que la clé
// est présente — tous les appels renvoient 404), on bascule automatiquement sur
// le premier modèle « flash » réellement disponible pour ce compte.
const MODEL_PREFERENCE = [
  DEFAULT_MODEL,
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
]

// Résout (une fois par conteneur chaud) un modèle qui existe vraiment pour cette
// clé, via l'API ListModels. Best-effort : en cas d'échec, on garde le défaut.
let RESOLVED_MODEL = null
async function resolveModel(key, signal) {
  if (RESOLVED_MODEL) return RESOLVED_MODEL
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { headers: { 'User-Agent': UA }, signal },
    )
    if (!r.ok) return DEFAULT_MODEL // clé invalide / quota : l'appel principal remontera la vraie erreur
    const data = await r.json()
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => (m.name || '').replace(/^models\//, ''))
    if (!names.length) return DEFAULT_MODEL
    const pick =
      MODEL_PREFERENCE.find((m) => names.includes(m)) ||
      names.find((n) => /flash/i.test(n) && !/(thinking|lite|8b|vision)/i.test(n)) ||
      names.find((n) => /flash/i.test(n)) ||
      names[0]
    RESOLVED_MODEL = pick
    return pick
  } catch {
    return DEFAULT_MODEL
  }
}

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

// ── Analyse IA (offre gratuite) ────────────────────────────────────────────
// Un seul appel pour tout le lot : l'IA lit les infos de chaque lieu (tags +
// extrait Wikipédia) et renvoie, par identifiant, une analyse structurée.
//
// Deux fournisseurs GRATUITS, essayés dans l'ordre (le 1er qui répond gagne) :
//   1) Groq (GROQ_API_KEY) — quota gratuit très généreux (Llama 3.3 70B),
//      recommandé pour un usage illimité en pratique.
//   2) Google Gemini (GEMINI_API_KEY) — gratuit mais plafonné chaque jour.
export function hasAiKey() {
  return Boolean((process.env.GROQ_API_KEY || '').trim()) || Boolean((process.env.GEMINI_API_KEY || '').trim())
}

async function aiAnalyze(sites, wikiMap, signal) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim()
  const groqKey = (process.env.GROQ_API_KEY || '').trim()
  if (!geminiKey && !groqKey) return { map: {}, error: null }

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

  // Extrait un objet JSON d'une réponse texte : JSON pur, ou noyé dans de la
  // prose / ```json … ```.
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

  // Une entrée n'est retenue que si elle contient réellement une analyse (objet
  // non vide) : un `null` ou un stub `{}` ne doit ni écraser un bon résultat, ni
  // faire croire qu'un lieu est couvert.
  const usable = (v) => v && typeof v === 'object' && Object.keys(v).length > 0

  // Fetch borné : coupe si le budget global est déjà/est avorté OU si le plafond
  // `capMs` est atteint, sans faire traîner l'appel jusqu'au kill dur de Vercel.
  const capFetch = async (url, opts, capMs) => {
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) ac.abort()
    const cap = capMs ? setTimeout(() => ac.abort(), capMs) : null
    try {
      return await fetch(url, { ...opts, signal: ac.signal })
    } finally {
      if (cap) clearTimeout(cap)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }

  const httpError = async (r) => {
    let detail = ''
    try {
      detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 160)
    } catch {
      /* corps illisible : on garde juste le code */
    }
    return new Error(`HTTP ${r.status}${detail ? ' ' + detail : ''}`)
  }

  // ── Fournisseur 1 : Groq (OpenAI-compatible, mode JSON) ──────────────────
  const groqAnalyze = async () => {
    const r = await capFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
        }),
      },
      25000,
    )
    if (!r.ok) throw await httpError(r)
    const data = await r.json()
    const text = data?.choices?.[0]?.message?.content || ''
    const map = extractJson(text)
    if (!Object.keys(map).length) throw new Error('réponse vide/illisible')
    return map
  }

  // ── Fournisseur 2 : Google Gemini ────────────────────────────────────────
  const geminiAnalyze = async () => {
    const model = await resolveModel(geminiKey, signal).catch(() => DEFAULT_MODEL)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`
    // Recherche web (grounding) : COÛTEUSE en quota (quota gratuit bien plus
    // petit, 2 appels). OFF par défaut ; réactivable via GEMINI_GROUNDING=1.
    const callGemini = async (useSearch, capMs) => {
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192, ...(useSearch ? {} : { responseMimeType: 'application/json' }) },
        ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      }
      const r = await capFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, capMs)
      if (!r.ok) throw await httpError(r)
      const data = await r.json()
      const cand = data?.candidates?.[0]
      const text = cand?.content?.parts?.map((p) => p.text || '').join('') || ''
      const map = extractJson(text)
      if (Object.keys(map).length === 0) {
        const why =
          cand?.finishReason && cand.finishReason !== 'STOP'
            ? `finishReason ${cand.finishReason}`
            : data?.promptFeedback?.blockReason
              ? `bloqué (${data.promptFeedback.blockReason})`
              : 'réponse vide/illisible'
        throw new Error(why)
      }
      return map
    }
    const wantGrounding = process.env.GEMINI_GROUNDING === '1'
    let grounded = {}
    let gErr = null
    if (wantGrounding) {
      try {
        grounded = await callGemini(true, 25000)
      } catch (e) {
        gErr = e
      }
    }
    const missing = sites.some((s) => !usable(grounded[s.id]))
    let plain = {}
    if (missing) {
      try {
        plain = await callGemini(false, 25000)
      } catch (e) {
        gErr = e
      }
    }
    const out = {}
    for (const s of sites) {
      if (usable(grounded[s.id])) out[s.id] = grounded[s.id]
      else if (usable(plain[s.id])) out[s.id] = plain[s.id]
    }
    if (!Object.keys(out).length) throw gErr || new Error('réponse vide/illisible')
    return out
  }

  // Essaie les fournisseurs disponibles dans l'ordre ; le 1er qui produit une
  // analyse gagne. On mémorise la dernière erreur pour un message clair.
  const providers = []
  if (groqKey) providers.push(['Groq', groqAnalyze])
  if (geminiKey) providers.push(['Gemini', geminiAnalyze])

  let lastError = null
  for (const [name, run] of providers) {
    try {
      const map = await run()
      if (Object.keys(map).length) return { map, error: null }
      lastError = `${name}: réponse vide`
    } catch (e) {
      lastError = `${name}: ${e?.message || 'erreur'}`
    }
  }

  const error = /\b429\b|quota|RESOURCE_EXHAUSTED|billing|rate limit/i.test(lastError || '')
    ? 'Quota gratuit de l’IA atteint pour le moment (réessaie un peu plus tard).'
    : lastError || 'aucune analyse renvoyée'
  return { map: {}, error }
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

    // 2) Analyse IA (si une clé IA — Groq ou Gemini — est configurée) — best-effort.
    let aiMap = {}
    let aiEnabled = false
    let aiError = null
    if (hasAiKey()) {
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
    // Exception serveur : ne PAS prétendre que l'IA est « non configurée » (ça
    // enverrait l'utilisateur corriger une clé pourtant présente). On reflète la
    // présence réelle de la clé + une raison → le client montrera « IA
    // indisponible » plutôt que « IA non configurée ».
    const hasKey = hasAiKey()
    res.status(200).json({ aiEnabled: hasKey, aiError: hasKey ? 'exception serveur' : null, results: {} })
  } finally {
    clearTimeout(timer)
  }
}
