// Diagnostic ultra-simple : aucun appel externe. Sert à vérifier, en ouvrant
// directement https://<app>/api/ping dans le navigateur, que les fonctions
// serverless sont bien déployées et joignables depuis l'appareil.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, service: 'urbex-discover', version: '2.14' })
}
