import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, PanelLeftOpen, Loader2, X } from 'lucide-react'
import { StoreProvider, useStore } from './lib/store'
import MapView from './components/MapView'
import MapControls from './components/MapControls'
import Sidebar from './components/Sidebar'
import SpotDetail from './components/SpotDetail'
import SpotForm from './components/SpotForm'
import AuthScreen from './components/AuthScreen'
import SettingsModal from './components/SettingsModal'

const LS_LAYER = 'urbex-atlas:layer'
const LS_LABELS = 'urbex-atlas:labels'

function Toast() {
  const { toast } = useStore()
  if (!toast) return null
  const colors = {
    info: 'bg-zinc-800 text-zinc-100 border-white/10',
    success: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    error: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
  }
  return (
    <div
      className={`pointer-events-none fixed bottom-5 left-1/2 z-[3000] max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl ${colors[toast.kind] || colors.info}`}
    >
      {toast.message}
    </div>
  )
}

function Shell() {
  const store = useStore()
  const { mode, user, authReady, spots, showToast } = store

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [layerId, setLayerId] = useState(() => localStorage.getItem(LS_LAYER) || 'esri')
  const [labelsOn, setLabelsOn] = useState(() => localStorage.getItem(LS_LABELS) !== '0')
  const [selectedId, setSelectedId] = useState(null)
  const [addMode, setAddMode] = useState(false)
  const [draftPos, setDraftPos] = useState(null)
  const [formState, setFormState] = useState(null) // null | {mode:'create'} | {mode:'edit', spot}
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null)
  const [userPos, setUserPos] = useState(null)
  const [locating, setLocating] = useState(false)
  const mapRef = useRef(null)

  useEffect(() => localStorage.setItem(LS_LAYER, layerId), [layerId])
  useEffect(() => localStorage.setItem(LS_LABELS, labelsOn ? '1' : '0'), [labelsOn])

  const selectedSpot = spots.find((s) => s.id === selectedId)

  const select = useCallback((id) => {
    setSelectedId(id)
    setFormState(null)
  }, [])

  const selectAndFly = useCallback(
    (id) => {
      const spot = spots.find((s) => s.id === id)
      select(id)
      if (spot) setFlyTarget({ lat: spot.lat, lng: spot.lng, ts: Date.now() })
      if (window.innerWidth < 640) setSidebarOpen(false)
    },
    [spots, select]
  )

  const startAdd = () => {
    setAddMode(true)
    setFormState(null)
    setSelectedId(null)
    setDraftPos(null)
  }

  const cancelAll = useCallback(() => {
    setAddMode(false)
    setDraftPos(null)
    setFormState(null)
  }, [])

  const handleMapClick = useCallback(
    (latlng) => {
      if (addMode) {
        setDraftPos({ lat: latlng.lat, lng: latlng.lng })
        setAddMode(false)
        setFormState({ mode: 'create' })
      } else if (!formState) {
        setSelectedId(null)
      }
    },
    [addMode, formState]
  )

  const handleSaved = (id) => {
    setFormState(null)
    setDraftPos(null)
    setSelectedId(id)
  }

  const handleEdit = (spot) => {
    setFormState({ mode: 'edit', spot })
  }

  const handleRepositionHint = () => {
    if (formState?.mode === 'edit') {
      setDraftPos({ lat: formState.spot.lat, lng: formState.spot.lng })
      showToast('Déplace le marqueur rose pour repositionner le spot', 'info')
    }
  }

  const locate = () => {
    if (!navigator.geolocation) {
      showToast('Géolocalisation non disponible', 'error')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserPos(p)
        setFlyTarget({ ...p, zoom: 15, ts: Date.now() })
        setLocating(false)
      },
      () => {
        showToast('Position introuvable — vérifie les autorisations', 'error')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (addMode) setAddMode(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (!formState) setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addMode, settingsOpen, formState])

  if (mode === 'cloud' && !authReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
        <Loader2 size={28} className="animate-spin text-amber-400" />
      </div>
    )
  }

  if (mode === 'cloud' && !user) {
    return (
      <>
        <AuthScreen />
        <Toast />
      </>
    )
  }

  const panelOpen = formState || selectedSpot

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <MapView
        spots={spots}
        selectedId={selectedId}
        onSelect={selectAndFly}
        layerId={layerId}
        labelsOn={labelsOn}
        addMode={addMode}
        draftPos={draftPos}
        onMapClick={handleMapClick}
        onDraftMove={setDraftPos}
        userPos={userPos}
        flyTarget={flyTarget}
        mapRef={mapRef}
      />

      {/* Sidebar */}
      {sidebarOpen ? (
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-[1000] w-full p-0 sm:w-[380px] sm:p-3">
          <Sidebar
            onClose={() => setSidebarOpen(false)}
            selectedId={selectedId}
            onSelect={selectAndFly}
            userPos={userPos}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      ) : (
        <button
          title="Ouvrir la liste"
          onClick={() => setSidebarOpen(true)}
          className="glass absolute left-3 top-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-xl text-zinc-200 shadow-lg transition hover:bg-zinc-700/70"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Panneau droit : détail ou formulaire */}
      {panelOpen && (
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-[1100] w-full sm:w-[400px] sm:p-3">
          {formState ? (
            <SpotForm
              key={formState.mode === 'edit' ? formState.spot.id : 'new'}
              spot={formState.mode === 'edit' ? formState.spot : null}
              position={draftPos}
              onPositionHint={handleRepositionHint}
              onSaved={handleSaved}
              onCancel={cancelAll}
            />
          ) : (
            <SpotDetail spot={selectedSpot} onClose={() => setSelectedId(null)} onEdit={handleEdit} />
          )}
        </div>
      )}

      {/* Contrôles carte */}
      <MapControls
        layerId={layerId}
        onLayerChange={setLayerId}
        labelsOn={labelsOn}
        onLabelsToggle={() => setLabelsOn((v) => !v)}
        onLocate={locate}
        locating={locating}
        onZoom={(dir) => (dir > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut())}
        onGoto={(t) => setFlyTarget({ ...t, ts: Date.now() })}
        shifted={Boolean(panelOpen)}
      />

      {/* Bannière mode ajout */}
      {addMode && (
        <div className="glass no-select pointer-events-auto absolute left-1/2 top-3 z-[1200] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-zinc-100 shadow-2xl">
          <span className="hidden sm:inline">🎯 Clique sur la carte pour placer le spot</span>
          <span className="sm:hidden">🎯 Touche la carte pour placer le spot</span>
          <button onClick={() => setAddMode(false)} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bouton ajouter */}
      {!addMode && !formState && (
        <button
          onClick={startAdd}
          className="absolute bottom-6 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 shadow-2xl shadow-amber-400/20 transition hover:bg-amber-300 active:scale-95"
        >
          <Plus size={18} strokeWidth={2.5} /> Spot
        </button>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
