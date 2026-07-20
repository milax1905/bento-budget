// Proxy Overpass côté serveur (fonction serverless Vercel).
// Le navigateur n'appelle QUE /api/discover (même origine que l'app) : aucun
// souci de CORS, de bloqueur de contenu, ni de relais privé iCloud côté client.
// C'est ce serveur qui interroge Overpass (aucune restriction CORS côté serveur)
// et renvoie le JSON.
//
// Point crucial : on interroge les 3 miroirs EN PARALLÈLE avec un plafond de 9 s.
// La fonction renvoie donc toujours une vraie réponse HTTP bien avant la limite
// de durée du plan Vercel (le premier miroir qui répond gagne). Ainsi le
// navigateur ne voit jamais une connexion coupée (« Load failed ») due à une
// fonction tuée par la plateforme.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

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

  // Plafond global : la fonction répond en ≤ 9 s quoi qu'il arrive.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  const attempt = async (ep) => {
    const r = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.text()
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
  } catch {
    // Tous les miroirs ont échoué (ou dépassé les 9 s) : on renvoie un vrai
    // code HTTP (504) — jamais une connexion coupée.
    res.status(504).json({ error: 'Overpass lent ou injoignable' })
  } finally {
    clearTimeout(timer)
  }
}
