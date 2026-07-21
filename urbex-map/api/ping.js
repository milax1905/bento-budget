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
  const groqKey = (process.env.GROQ_API_KEY || '').trim()
  const configured = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const base = { ok: true, service: 'urbex-discover', version: '2.23', gemini: Boolean(key), groq: Boolean(groqKey), geminiModel: configured }

  const wantAi = /[?&]ai=1(?:&|$)/.test(req.url || '') || req.query?.ai === '1'
  if (!wantAi || (!key && !groqKey)) {
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
    // ── Groq (fournisseur prioritaire) : sonde chat completions minuscule ──
    if (groqKey) {
      const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
      try {
        const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({ model: groqModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
          signal: controller.signal,
        })
        aiTest.groq = gr.ok ? { ok: true, model: groqModel } : { ok: false, model: groqModel, status: gr.status, error: await readErr(gr) }
      } catch (e) {
        aiTest.groq = { ok: false, model: groqModel, error: e?.message || 'exception' }
      }
    }

    // ── Gemini : ListModels (quota-free) + sonde generateContent (révèle 429) ──
    if (key) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: controller.signal })
        if (!r.ok) {
          aiTest.gemini = { ok: false, status: r.status, error: await readErr(r) }
        } else {
          const data = await r.json()
          const names = (data.models || [])
            .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m) => (m.name || '').replace(/^models\//, ''))
          const probeModel = names.includes(configured) ? configured : names.find((n) => /flash/i.test(n)) || names[0] || configured
          let probe = null
          if (probeModel) {
            try {
              const pr = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(probeModel)}:generateContent?key=${encodeURIComponent(key)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
                  signal: controller.signal,
                },
              )
              probe = pr.ok ? { ok: true, model: probeModel } : { ok: false, model: probeModel, status: pr.status, error: await readErr(pr) }
            } catch (e) {
              probe = { ok: false, model: probeModel, error: e?.message || 'exception' }
            }
          }
          aiTest.gemini = {
            ok: true,
            configuredModelAvailable: names.includes(configured),
            flashModels: names.filter((n) => /flash/i.test(n)).slice(0, 12),
            modelCount: names.length,
            probe,
          }
        }
      } catch (e) {
        aiTest.gemini = { ok: false, error: e?.message || 'exception' }
      }
    }
    res.status(200).json({ ...base, aiTest })
  } catch (e) {
    res.status(200).json({ ...base, aiTest: { ...aiTest, error: e?.message || 'exception' } })
  } finally {
    clearTimeout(timer)
  }
}
