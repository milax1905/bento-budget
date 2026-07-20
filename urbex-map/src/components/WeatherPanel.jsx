import { useEffect, useState } from 'react'
import { CloudSun, Loader2, Sunrise, Sunset, Droplets, Wind } from 'lucide-react'
import { fetchForecast, weatherInfo } from '../lib/weather'

export default function WeatherPanel({ lat, lng }) {
  const [state, setState] = useState({ status: 'idle', days: [] })
  const [open, setOpen] = useState(false)

  // On ne met PAS state.status dans les dépendances : sinon le setState de
  // chargement re-déclenche l'effet, dont le cleanup annulerait aussitôt sa
  // propre requête (météo bloquée sur « chargement »).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const controller = new AbortController()
    setState({ status: 'loading', days: [] })
    fetchForecast(lat, lng, { signal: controller.signal })
      .then((days) => {
        if (!cancelled) setState({ status: 'done', days })
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') setState({ status: 'error', days: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, lat, lng])

  const today = state.days[0]

  return (
    <div className="rounded-xl bg-zinc-800/50 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <CloudSun size={12} /> Météo & lumière
        </span>
        <span className="text-[11px] text-amber-300/90">{open ? 'masquer' : 'afficher'}</span>
      </button>

      {open && (
        <div className="mt-2.5">
          {state.status === 'loading' && (
            <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
              <Loader2 size={13} className="animate-spin" /> chargement de la météo…
            </div>
          )}
          {state.status === 'error' && (
            <p className="py-2 text-xs text-zinc-500">Météo indisponible (hors connexion ?).</p>
          )}
          {state.status === 'done' && today && (
            <>
              {/* Aujourd'hui + soleil */}
              <div className="mb-2 flex items-center gap-3 rounded-lg bg-zinc-900/40 px-3 py-2">
                <span className="text-2xl">{weatherInfo(today.code).emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{weatherInfo(today.code).label}</p>
                  <p className="text-[11px] text-zinc-500">
                    {today.tMin}° / {today.tMax}°
                  </p>
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Sunrise size={11} className="text-amber-400" /> {today.sunrise}
                  </span>
                  <span className="flex items-center gap-1">
                    <Sunset size={11} className="text-orange-400" /> {today.sunset}
                  </span>
                </div>
              </div>

              {/* 7 jours */}
              <div className="grid grid-cols-7 gap-1">
                {state.days.map((d) => (
                  <div
                    key={d.iso}
                    title={`${weatherInfo(d.code).label} · pluie ${d.rain ?? '—'}% · vent ${d.wind} km/h`}
                    className="flex flex-col items-center gap-0.5 rounded-lg bg-zinc-900/40 py-1.5"
                  >
                    <span className="text-[9px] text-zinc-500">{d.dayLabel.slice(0, 3)}</span>
                    <span className="text-base leading-none">{weatherInfo(d.code).emoji}</span>
                    <span className="text-[10px] font-medium text-zinc-200">{d.tMax}°</span>
                    {d.rain != null && d.rain >= 30 && (
                      <span className="flex items-center gap-0.5 text-[8px] text-sky-300">
                        <Droplets size={7} />
                        {d.rain}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-600">
                <Wind size={9} /> Prévisions à 7 jours · Open-Meteo
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
