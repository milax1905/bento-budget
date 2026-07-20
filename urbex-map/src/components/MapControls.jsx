import { useEffect, useRef, useState } from 'react'
import { Layers, Plus, Minus, LocateFixed, Search, X, Type } from 'lucide-react'
import { BASE_LAYERS } from '../lib/constants'
import { searchPlaces } from '../lib/geocode'
import { parseCoords } from '../lib/geo'

function ControlButton({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`glass flex h-11 w-11 items-center justify-center rounded-xl text-zinc-200 shadow-lg transition hover:bg-zinc-700/70 active:scale-95 ${
        active ? 'ring-2 ring-amber-400/70' : ''
      }`}
    >
      {children}
    </button>
  )
}

export default function MapControls({
  layerId,
  onLayerChange,
  labelsOn,
  onLabelsToggle,
  onLocate,
  locating,
  onZoom,
  onGoto,
  shifted,
}) {
  const [layersOpen, setLayersOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('idle') // idle | searching | empty | error
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    abortRef.current?.abort()
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setSearchStatus('idle')
      return
    }
    const coords = parseCoords(q)
    if (coords) {
      setResults([{ label: `Aller aux coordonnées ${coords.lat}, ${coords.lng}`, ...coords, type: 'coords' }])
      setSearchStatus('idle')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setSearchStatus('searching')
    const timer = setTimeout(() => {
      searchPlaces(q, { signal: controller.signal })
        .then((r) => {
          setResults(r)
          setSearchStatus(r.length ? 'idle' : 'empty')
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setResults([])
            setSearchStatus('error')
          }
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const pick = (r) => {
    onGoto({ lat: r.lat, lng: r.lng, zoom: r.type === 'coords' ? 17 : 15 })
    setSearchOpen(false)
    setQuery('')
    setResults([])
    setSearchStatus('idle')
  }

  return (
    <div
      className={`pointer-events-none absolute top-[calc(0.75rem+env(safe-area-inset-top))] z-[1000] flex flex-col items-end gap-2 transition-all duration-300 ${
        shifted ? 'right-3 sm:right-[424px]' : 'right-3'
      }`}
    >
      {/* Recherche d'adresse */}
      <div className="pointer-events-auto flex flex-col items-end gap-1">
        {searchOpen ? (
          <div className="glass w-72 rounded-xl p-2 shadow-lg sm:w-80">
            <div className="flex items-center gap-2">
              <Search size={16} className="shrink-0 text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Adresse, ville ou « lat, lng »…"
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
              <button onClick={() => { setSearchOpen(false); setQuery('') }} className="text-zinc-400 hover:text-zinc-200">
                <X size={16} />
              </button>
            </div>
            {(results.length > 0 || searchStatus !== 'idle') && (
              <div className="mt-2 max-h-64 overflow-y-auto border-t border-white/10 pt-1">
                {searchStatus === 'searching' && (
                  <div className="px-2 py-2 text-xs text-zinc-500">Recherche…</div>
                )}
                {searchStatus === 'empty' && (
                  <div className="px-2 py-2 text-xs text-zinc-500">Aucun résultat</div>
                )}
                {searchStatus === 'error' && (
                  <div className="px-2 py-2 text-xs text-rose-300">
                    Recherche impossible — vérifie ta connexion
                  </div>
                )}
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => pick(r)}
                    className="block w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/60"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ControlButton title="Rechercher une adresse" onClick={() => setSearchOpen(true)}>
            <Search size={18} />
          </ControlButton>
        )}
      </div>

      {/* Choix du fond de carte */}
      <div className="pointer-events-auto relative">
        <ControlButton title="Fond de carte" active={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
          <Layers size={18} />
        </ControlButton>
        {layersOpen && (
          <div className="glass absolute right-0 top-12 w-48 rounded-xl p-1.5 shadow-lg">
            {BASE_LAYERS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  onLayerChange(l.id)
                  setLayersOpen(false)
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  l.id === layerId ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-700/60'
                }`}
              >
                {l.label}
              </button>
            ))}
            <div className="mt-1 border-t border-white/10 pt-1">
              <button
                onClick={onLabelsToggle}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  labelsOn ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-700/60'
                }`}
              >
                <Type size={14} /> Noms de lieux
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-auto">
        <ControlButton title="Ma position" active={locating} onClick={onLocate}>
          <LocateFixed size={18} />
        </ControlButton>
      </div>

      <div className="pointer-events-auto flex flex-col gap-1">
        <ControlButton title="Zoomer" onClick={() => onZoom(1)}>
          <Plus size={18} />
        </ControlButton>
        <ControlButton title="Dézoomer" onClick={() => onZoom(-1)}>
          <Minus size={18} />
        </ControlButton>
      </div>
    </div>
  )
}
