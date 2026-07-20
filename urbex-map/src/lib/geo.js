// Distance en kilomètres entre deux points (haversine).
export function distanceKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function formatCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

// Accepte « 48.8584, 2.2945 », « 48.8584 2.2945 », etc.
export function parseCoords(text) {
  const m = text.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)[\s,;]+(-?\d{1,3}(?:[.,]\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1].replace(',', '.'))
  const lng = parseFloat(m[2].replace(',', '.'))
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
