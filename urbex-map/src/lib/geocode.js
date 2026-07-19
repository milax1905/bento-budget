// Recherche d'adresses / lieux via Nominatim (OpenStreetMap).
export async function searchPlaces(query, { signal } = {}) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '6')
  url.searchParams.set('accept-language', 'fr')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = await res.json()
  return data.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    type: r.type,
  }))
}
