// Enrichissement des lieux via l'API REST de Wikipédia (gratuite, CORS ouvert,
// sans clé). On récupère un résumé + une vignette pour juger si un lieu vaut
// le détour.
export function parseWikipediaTag(tag) {
  if (typeof tag !== 'string' || !tag.trim()) return null
  const m = tag.match(/^([a-z]{2,3}):(.+)$/i)
  if (m) return { lang: m[1].toLowerCase(), title: m[2].trim() }
  return { lang: 'fr', title: tag.trim() }
}

export async function fetchWikiSummary({ lang, title }, { signal } = {}) {
  const slug = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Wikipédia ${res.status}`)
  const d = await res.json()
  if (d.type === 'disambiguation' || !d.extract) throw new Error('Résumé indisponible')
  return {
    title: d.title,
    extract: d.extract,
    thumbnail: d.thumbnail?.source || null,
    url: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${slug}`,
  }
}

// Lien de recherche web pour vérifier un lieu par soi-même.
export function webSearchUrl(name, lat, lng) {
  const q = `${name} lieu abandonné urbex ${lat.toFixed(3)},${lng.toFixed(3)}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
