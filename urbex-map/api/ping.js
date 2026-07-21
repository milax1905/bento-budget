// Diagnostic ultra-simple : aucun appel externe. Sert à vérifier, en ouvrant
// directement https://<app>/api/ping dans le navigateur, que les fonctions
// serverless sont bien déployées et joignables depuis l'appareil.
// `gemini` indique si la clé d'analyse IA est bien présente EN PRODUCTION
// (booléen seulement, la clé elle-même n'est jamais exposée).
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    service: 'urbex-discover',
    version: '2.20',
    gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  })
}
