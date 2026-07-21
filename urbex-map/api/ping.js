// Diagnostic. En ouvrant https://<app>/api/ping on vérifie que les fonctions
// serverless sont déployées et joignables. `anthropic` / `groq` indiquent si une
// clé d'analyse IA est présente EN PRODUCTION (booléens seulement — les clés ne
// sont jamais exposées).
//
// Diagnostic IA EN DIRECT : https://<app>/api/ping?ai=1
//   Fait un vrai petit appel à chaque fournisseur configuré et renvoie `aiTest` :
//   - clé invalide / crédit épuisé / quota → ok:false + status + message ;
//   - clé OK → ok:true. Sert à diagnostiquer un badge « IA indisponible ».
export const config = { maxDuration: 20 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  const groqKey = (process.env.GROQ_API_KEY || '').trim()
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  const base = {
    ok: true,
    service: 'urbex-discover',
    version: '2.24',
    anthropic: Boolean(anthropicKey),
    groq: Boolean(groqKey),
    anthropicModel,
  }

  const wantAi = /[?&]ai=1(?:&|$)/.test(req.url || '') || req.query?.ai === '1'
  if (!wantAi || (!anthropicKey && !groqKey)) {
    res.status(200).json(base)
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const readErr = async (r) => {
    try {
      return (await r.text()).replace(/\s+/g, ' ').slice(0, 300)
    } catch {
      return ''
    }
  }
  const aiTest = {}
  try {
    // ── Claude (Anthropic) : petit appel Messages ──────────────────────────
    if (anthropicKey) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: anthropicModel, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: controller.signal,
        })
        aiTest.anthropic = r.ok ? { ok: true, model: anthropicModel } : { ok: false, model: anthropicModel, status: r.status, error: await readErr(r) }
      } catch (e) {
        aiTest.anthropic = { ok: false, model: anthropicModel, error: e?.message || 'exception' }
      }
    }

    // ── Groq : petit appel chat completions ────────────────────────────────
    if (groqKey) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({ model: groqModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
          signal: controller.signal,
        })
        aiTest.groq = r.ok ? { ok: true, model: groqModel } : { ok: false, model: groqModel, status: r.status, error: await readErr(r) }
      } catch (e) {
        aiTest.groq = { ok: false, model: groqModel, error: e?.message || 'exception' }
      }
    }
    res.status(200).json({ ...base, aiTest })
  } catch (e) {
    res.status(200).json({ ...base, aiTest: { ...aiTest, error: e?.message || 'exception' } })
  } finally {
    clearTimeout(timer)
  }
}
