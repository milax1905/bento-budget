import { distanceKm } from './geo'

// Routage piéton via BRouter (données OpenStreetMap, serveur public, sans clé).
const BROUTER = 'https://brouter.de/brouter'
const PROFILES = ['hiking-mountain', 'shortest']

// Tracé à vol d'oiseau entre les points (repli hors-ligne).
export function directRoute(points) {
  let meters = 0
  for (let i = 1; i < points.length; i++) meters += distanceKm(points[i - 1], points[i]) * 1000
  return { geometry: points.map((p) => [p.lat, p.lng]), distance: Math.round(meters), routedMode: 'direct' }
}

// Tracé qui suit les chemins/sentiers. Lève une erreur si le serveur est
// injoignable — l'appelant peut alors se replier sur directRoute().
export async function trailRoute(points, { signal } = {}) {
  const lonlats = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|')
  let lastErr
  for (const profile of PROFILES) {
    try {
      const url = `${BROUTER}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`BRouter ${res.status}`)
      const data = await res.json()
      const feature = data?.features?.[0]
      const coords = feature?.geometry?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) throw new Error('Tracé vide')
      const length = Math.round(Number(feature.properties?.['track-length']))
      return {
        geometry: coords.map((c) => [c[1], c[0]]),
        distance: Number.isFinite(length) && length > 0 ? length : directRoute(points).distance,
        routedMode: 'trail',
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      lastErr = err
    }
  }
  throw lastErr || new Error('Routage indisponible')
}

// Temps de marche estimé (~4 km/h, terrain facile).
export const walkMinutes = (meters) => Math.max(1, Math.round((meters / 1000 / 4) * 60))
