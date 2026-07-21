// Diagnostic. En ouvrant https://<app>/api/ping on vérifie que les fonctions
// serverless sont déployées et joignables. `gemini` indique si la clé d'analyse
// IA est présente EN PRODUCTION (booléen seulement, la clé n'est jamais exposée).
//
// Diagnostic IA EN DIRECT : https://<app>/api/ping?ai=1
//   Interroge Google (ListModels) avec la clé et renvoie `aiTest` :
//   - clé invalide/quota → aiTest.ok=false + status + message d'erreur ;
//   - clé OK → liste des modèles « flash » disponibles + si le modèle configuré
//     existe encore. Sert à diagnostiquer « IA indisponible » (clé présente mais
//     appels en échec, typiquement un modèle retiré par Google).
export const config = { maxDuration: 20 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const key = (process.env.GEMINI_API_KEY || '').trim()
  const configured = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const base = { ok: true, service: 'urbex-discover', version: '2.21', gemini: Boolean(key), geminiModel: configured }

  const wantAi = /[?&]ai=1(?:&|$)/.test(req.url || '') || req.query?.ai === '1'
  if (!wantAi || !key) {
    res.status(200).json(base)
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: controller.signal },
    )
    if (!r.ok) {
      let error = ''
      try {
        error = (await r.text()).replace(/\s+/g, ' ').slice(0, 300)
      } catch {
        /* corps illisible */
      }
      res.status(200).json({ ...base, aiTest: { ok: false, status: r.status, error } })
      return
    }
    const data = await r.json()
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => (m.name || '').replace(/^models\//, ''))
    res.status(200).json({
      ...base,
      aiTest: {
        ok: true,
        configuredModelAvailable: names.includes(configured),
        flashModels: names.filter((n) => /flash/i.test(n)).slice(0, 12),
        modelCount: names.length,
      },
    })
  } catch (e) {
    res.status(200).json({ ...base, aiTest: { ok: false, error: e?.message || 'exception' } })
  } finally {
    clearTimeout(timer)
  }
}
