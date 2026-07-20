// Proxy Overpass côté serveur (fonction serverless Vercel).
// Le navigateur n'appelle que /api/overpass (même origine que l'app) : plus
// aucun souci de CORS, de bloqueur de contenu ou de relais privé iCloud côté
// client. C'est ce serveur qui interroge Overpass (aucune restriction CORS
// côté serveur) et renvoie le JSON.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  const data = typeof req.query.data === 'string' ? req.query.data : ''
  if (!data || data.length > 20000) {
    res.status(400).json({ error: 'requête invalide' })
    return
  }
  const body = 'data=' + encodeURIComponent(data)
  let lastStatus = 502

  for (const ep of ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      })
      if (!r.ok) {
        lastStatus = r.status
        continue
      }
      const text = await r.text()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      // Cache court au bord de Vercel : deux recherches identiques rapprochées
      // ne re-sollicitent pas Overpass.
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      res.status(200).send(text)
      return
    } catch {
      // timeout / réseau : on tente le miroir suivant
    } finally {
      clearTimeout(timer)
    }
  }
  res.status(lastStatus).json({ error: 'Overpass injoignable' })
}
