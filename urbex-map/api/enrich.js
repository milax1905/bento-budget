// Enrichissement des lieux découverts, côté serveur (fonction serverless).
//
// Deux niveaux, tous deux best-effort (ne cassent jamais la découverte) :
//   1) GRATUIT, sans configuration : histoire réelle via Wikipédia/Wikidata
//      (tag OSM wikipedia/wikidata, sinon recherche géographique autour du point).
//   2) IA, si une clé est configurée : l'IA analyse chaque lieu (tags + extrait
//      Wikipédia), écrit un résumé utile, évalue l'intérêt et le danger, et
//      FILTRE les lieux quelconques (verdict). Fournisseurs essayés dans l'ordre :
//        • Claude (Anthropic, ANTHROPIC_API_KEY) — payant mais très bon marché
//          en Haiku (~1-2 centimes/recherche) ;
//        • Groq (GROQ_API_KEY) — gratuit, en secours.
//      L'appel se fait côté serveur : aucun blocage réseau du navigateur.
export const config = { maxDuration: 60 }

const BUDGET_MS = 55000
const UA = 'UrbexAtlas/2.26 (+https://urbex-phi.vercel.app; contact via GitHub milax1905/bento-budget)'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

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
// Fournisseurs essayés dans l'ordre (le 1er qui produit une analyse gagne) :
//   1) Claude (ANTHROPIC_API_KEY) — payant mais très bon marché en Haiku.
//   2) Groq (GROQ_API_KEY) — gratuit, en secours.
export function hasAiKey() {
  return Boolean((process.env.ANTHROPIC_API_KEY || '').trim()) || Boolean((process.env.GROQ_API_KEY || '').trim())
}

async function aiAnalyze(sites, wikiMap, signal, userKey) {
  // Une clé fournie par l'utilisateur (Réglages → « apporte ta clé ») est utilisée
  // EXCLUSIVEMENT, selon son fournisseur ; sinon on retombe sur les variables
  // d'environnement du serveur.
  let anthropicKey, groqKey
  if (userKey) {
    anthropicKey = userKey.startsWith('sk-ant-') ? userKey : ''
    groqKey = userKey.startsWith('gsk_') ? userKey : ''
  } else {
    anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    groqKey = (process.env.GROQ_API_KEY || '').trim()
  }
  if (!anthropicKey && !groqKey) return { map: {}, error: null }

  const brief = sites.map((s) => ({
    id: s.id,
    nom: s.name || null,
    type: s.typeLabel || s.category,
    tags: s.tagline,
    wikipedia: wikiMap[s.id]?.extract || null,
    // "macarte": lieu curé par l'utilisateur (carte urbex perso) → vrai spot a priori.
    macarte: s.source === 'perso',
  }))

  const prompt = `Tu es un expert en urbex (exploration de lieux abandonnés) francophone. Pour CHAQUE lieu ci-dessous, rédige une analyse en t'appuyant sur : le NOM du lieu, le type OpenStreetMap, l'extrait Wikipédia s'il existe, TES PROPRES CONNAISSANCES du lieu, et une recherche web quand l'outil est disponible. Si tu identifies le lieu de façon fiable (par son nom notamment), donne son histoire et ce qu'on peut y voir. Si tu n'as pas d'info fiable, reste général et honnête — ne FABRIQUE JAMAIS de faux détails (fausses dates, faux noms, faux événements).

TON RÔLE = FAIRE LE TRI. On veut une liste PROPRE ne proposant QUE des spots
d'urbex COOLS (vraiment abandonnés et explorables). Tu juges TOUS les lieux,
SANS EXCEPTION.

Mets "urbex": false (à écarter) pour TOUT ce qui n'est pas un vrai spot abandonné :
- une commune, un village, un hameau, un quartier ;
- un élément géographique (rivière, lac, montagne, col, forêt…) ;
- un site encore ACTIF / restauré / entretenu / habité / ouvert au public ou
  touristique (château visitable ou habité, musée, monument classé entretenu,
  mairie, basilique/cathédrale/église active, gare en service…) ;
- un lieu RÉHABILITÉ / reconverti (n'est plus explorable).
Mets "urbex": true UNIQUEMENT si le lieu est clairement à l'abandon / en ruine /
désaffecté et donc explorable (friche, usine/mine/sanatorium/fort/château
désaffecté, bâtiment abandonné…).

LIEUX « macarte: true » : ce sont des spots curés par l'utilisateur (issus de sa
carte urbex perso) — considère-les comme de VRAIS spots par défaut (urbex:true,
verdict "top" ou "moyen"). Ne mets "urbex": false QUE si le nom montre clairement
que c'est réhabilité / actif (ex. devenu mairie, musée, hôtel, château restauré
et habité). Ne les note JAMAIS "quelconque" juste par manque d'info.

LIEUX en ligne (macarte absent/false) : sois STRICT. En cas de doute réel qu'un
lieu ne soit pas vraiment abandonné, mets "urbex": false. Réserve "verdict":
"quelconque" aux lieux sans intérêt pour l'urbex.

Pour chaque lieu renvoie :
- "urbex" : true (vrai spot abandonné explorable) | false (à écarter).
- "resume" : 2 à 3 phrases utiles à un explorateur (ce que c'est, son histoire si connue, ce qu'on peut y voir, s'il est abandonné ou encore actif).
- "interet" : entier de 1 (quelconque/actif) à 5 (incontournable pour l'urbex).
- "verdict" : "top" (incontournable) | "moyen" (sympa) | "quelconque" (sans intérêt).
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

  // ── Fournisseur 1 : Claude (Anthropic Messages API) ──────────────────────
  // Le préremplissage de la réponse par « { » force le modèle à répondre
  // directement en JSON (technique fiable côté Anthropic).
  const claudeAnalyze = async () => {
    const r = await capFetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 8000,
          temperature: 0.3,
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: '{' },
          ],
        }),
      },
      25000,
    )
    if (!r.ok) throw await httpError(r)
    const data = await r.json()
    const text = '{' + (data?.content?.map((b) => b.text || '').join('') || '')
    const map = extractJson(text)
    if (!Object.keys(map).length) throw new Error('réponse vide/illisible')
    return map
  }

  // ── Fournisseur 2 : Groq (OpenAI-compatible, mode JSON) — secours gratuit ─
  const groqAnalyze = async () => {
    const r = await capFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
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

  // Essaie les fournisseurs disponibles dans l'ordre ; le 1er qui produit une
  // analyse gagne. On mémorise la dernière erreur pour un message clair.
  const providers = []
  if (anthropicKey) providers.push(['Claude', claudeAnalyze])
  if (groqKey) providers.push(['Groq', groqAnalyze])

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

  const low = lastError || ''
  let error
  if (/credit|balance|insufficient|payment|plan and billing/i.test(low)) {
    error = 'Crédit Claude épuisé — recharge ton crédit Anthropic (ou vérifie ta limite de dépense).'
  } else if (/\b429\b|quota|RESOURCE_EXHAUSTED|rate limit/i.test(low)) {
    error = 'Limite de l’IA atteinte pour le moment (réessaie un peu plus tard).'
  } else if (/\b401\b|invalid.*key|authentication|x-api-key/i.test(low)) {
    error = 'Clé IA invalide — vérifie la clé collée dans Réglages (ou la variable sur Vercel).'
  } else {
    error = lastError || 'aucune analyse renvoyée'
  }
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
  // Clé IA fournie par l'appareil (Réglages → « apporte ta clé »). Prioritaire sur
  // les variables d'environnement. Jamais journalisée.
  const userKey = typeof bodyIn?.aiKey === 'string' ? bodyIn.aiKey.trim() : ''
  const userKeyValid = /^(gsk_|sk-ant-)/.test(userKey)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUDGET_MS)
  try {
    // 1) Histoire Wikipédia/Wikidata (gratuit, toujours tenté).
    const wikiEntries = await Promise.all(
      sites.map(async (s) => [s.id, await wikiFor(s, controller.signal).catch(() => null)]),
    )
    const wikiMap = {}
    for (const [id, w] of wikiEntries) wikiMap[id] = w

    // 2) Analyse IA (clé de l'appareil OU variable d'environnement) — best-effort.
    let aiMap = {}
    let aiEnabled = false
    let aiError = null
    if (hasAiKey() || userKeyValid) {
      aiEnabled = true
      const ai = await aiAnalyze(sites, wikiMap, controller.signal, userKeyValid ? userKey : null).catch((e) => ({ map: {}, error: e?.message || 'erreur IA' }))
      aiMap = ai.map || {}
      aiError = ai.error || null
    }

    const out = {}
    for (const s of sites) out[s.id] = { wiki: wikiMap[s.id] || null, ai: aiMap[s.id] || null }
    // Cache court quand l'IA a échoué ; cache long sinon (le contenu bouge peu).
    // Jamais de cache quand une clé d'appareil est utilisée (réponse par-appareil).
    const aiOk = !aiEnabled || Object.keys(aiMap).length > 0
    res.setHeader('Cache-Control', aiOk && !userKeyValid ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store')
    res.status(200).json({ aiEnabled, aiError, results: out })
  } catch {
    // Exception serveur : ne PAS prétendre que l'IA est « non configurée » (ça
    // enverrait l'utilisateur corriger une clé pourtant présente). On reflète la
    // présence réelle de la clé + une raison → le client montrera « IA
    // indisponible » plutôt que « IA non configurée ».
    const hasKey = hasAiKey() || userKeyValid
    res.status(200).json({ aiEnabled: hasKey, aiError: hasKey ? 'exception serveur' : null, results: {} })
  } finally {
    clearTimeout(timer)
  }
}
