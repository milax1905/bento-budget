// Proxy Overpass côté serveur (fonction serverless Vercel).
// Le navigateur n'appelle QUE /api/discover (même origine que l'app) : aucun
// souci de CORS, de bloqueur de contenu, ni de relais privé iCloud côté client.
// C'est ce serveur qui interroge Overpass (aucune restriction CORS côté serveur)
// et renvoie le JSON.
//
// On interroge plusieurs miroirs EN PARALLÈLE : le premier qui répond
// correctement gagne. Un plafond global (< maxDuration) garantit que la fonction
// renvoie toujours une vraie réponse HTTP (200, ou 504 si Overpass est lent) —
// jamais une connexion coupée (« Load failed ») due à une fonction tuée par la
// plateforme.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

// Les services OpenStreetMap brident (ou refusent) les requêtes anonymes issues
// de datacenters. Un User-Agent descriptif est requis par leur politique d'usage.
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'UrbexAtlas/2.13 (+https://urbex-phi.vercel.app)',
  Accept: 'application/json',
}

// Le plan Vercel gratuit autorise jusqu'à 60 s par fonction : on laisse à
// Overpass beaucoup de temps (il est souvent en file d'attente, surtout sur un
// grand rayon). Le premier miroir qui répond gagne, donc c'est transparent sur
// les petits rayons (réponse en quelques secondes).
export const config = { maxDuration: 60 }

const BUDGET_MS = 45000

// Étiquette courte par miroir, pour un diagnostic lisible côté client.
function label(ep) {
  if (ep.includes('overpass-api.de')) return 'de'
  if (ep.includes('kumi')) return 'kumi'
  if (ep.includes('osm.ch')) return 'ch'
  if (ep.includes('private.coffee')) return 'coffee'
  if (ep.includes('openstreetmap.fr')) return 'fr'
  return 'x'
}

// Récupère la requête Overpass (QL) depuis le corps POST (JSON) ou la query GET.
// Le GET permet aussi de tester l'endpoint directement dans un navigateur.
function getData(req) {
  if (req.method === 'GET') {
    return typeof req.query?.data === 'string' ? req.query.data : ''
  }
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return ''
    }
  }
  return body && typeof body.data === 'string' ? body.data : ''
}

export default async function handler(req, res) {
  const data = getData(req)
  if (!data || data.length > 20000) {
    res.status(400).json({ error: 'requête invalide' })
    return
  }
  const body = 'data=' + encodeURIComponent(data)

  // Plafond global : la fonction répond en ≤ BUDGET_MS quoi qu'il arrive.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUDGET_MS)

  const attempt = async (ep) => {
    const r = await fetch(ep, { method: 'POST', headers: HEADERS, body, signal: controller.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const text = await r.text()
    // Un miroir surchargé peut renvoyer 200 + une page HTML : on ne garde que
    // du vrai JSON Overpass.
    if (!text.trimStart().startsWith('{')) throw new Error('non-JSON')
    return text
  }

  try {
    // Le premier miroir qui répond correctement gagne.
    const text = await Promise.any(ENDPOINTS.map(attempt))
    controller.abort() // coupe les requêtes concurrentes encore en vol
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // Cache court au bord de Vercel : deux recherches identiques rapprochées
    // ne re-sollicitent pas Overpass.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.status(200).send(text)
  } catch (agg) {
    // Tous les miroirs ont échoué (ou dépassé le budget) : on renvoie un vrai
    // code HTTP (jamais une connexion coupée), AVEC le détail par miroir pour
    // diagnostiquer (Promise.any conserve l'ordre des erreurs).
    const errs = Array.isArray(agg?.errors) ? agg.errors : []
    const detail = ENDPOINTS.map((ep, i) => `${label(ep)}:${errs[i]?.message || '?'}`).join(', ')
    res.status(502).json({ error: 'Overpass injoignable', detail })
  } finally {
    clearTimeout(timer)
  }
}
