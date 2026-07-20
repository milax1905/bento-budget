// Météo par spot via Open-Meteo (gratuit, sans clé API).
const WMO = {
  0: { emoji: '☀️', label: 'Ciel dégagé' },
  1: { emoji: '🌤️', label: 'Plutôt dégagé' },
  2: { emoji: '⛅', label: 'Partiellement nuageux' },
  3: { emoji: '☁️', label: 'Couvert' },
  45: { emoji: '🌫️', label: 'Brouillard' },
  48: { emoji: '🌫️', label: 'Brouillard givrant' },
  51: { emoji: '🌦️', label: 'Bruine légère' },
  53: { emoji: '🌦️', label: 'Bruine' },
  55: { emoji: '🌧️', label: 'Bruine dense' },
  61: { emoji: '🌦️', label: 'Pluie faible' },
  63: { emoji: '🌧️', label: 'Pluie' },
  65: { emoji: '🌧️', label: 'Pluie forte' },
  71: { emoji: '🌨️', label: 'Neige faible' },
  73: { emoji: '🌨️', label: 'Neige' },
  75: { emoji: '❄️', label: 'Neige forte' },
  77: { emoji: '🌨️', label: 'Grésil' },
  80: { emoji: '🌦️', label: 'Averses' },
  81: { emoji: '🌧️', label: 'Averses' },
  82: { emoji: '⛈️', label: 'Fortes averses' },
  85: { emoji: '🌨️', label: 'Averses de neige' },
  86: { emoji: '❄️', label: 'Fortes averses de neige' },
  95: { emoji: '⛈️', label: 'Orage' },
  96: { emoji: '⛈️', label: 'Orage grêleux' },
  99: { emoji: '⛈️', label: 'Orage grêleux' },
}

export const weatherInfo = (code) => WMO[code] || { emoji: '❓', label: '—' }

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

export async function fetchForecast(lat, lng, { signal } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset'
  )
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '7')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Météo ${res.status}`)
  const data = await res.json()
  const d = data.daily
  if (!d?.time) throw new Error('Météo indisponible')
  return d.time.map((iso, i) => {
    const date = new Date(`${iso}T12:00:00`)
    const sunrise = d.sunrise?.[i] ? new Date(d.sunrise[i]) : null
    const sunset = d.sunset?.[i] ? new Date(d.sunset[i]) : null
    return {
      iso,
      dayLabel: i === 0 ? "Aujourd'hui" : JOURS[date.getDay()],
      code: d.weather_code[i],
      tMax: Math.round(d.temperature_2m_max[i]),
      tMin: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max?.[i] ?? null,
      wind: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
      sunrise: sunrise ? sunrise.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
      sunset: sunset ? sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
    }
  })
}
