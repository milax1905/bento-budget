import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, PanelLeftOpen, Loader2, X, Undo2, Check } from 'lucide-react'
import { StoreProvider, useStore } from './lib/store'
import { trailRoute, directRoute, walkMinutes } from './lib/routing'
import { discoverAbandoned, enrichDiscoveries, refCandidates } from './lib/discover'
import { formatDistance, distanceKm } from './lib/geo'
import MapView from './components/MapView'
import MapControls from './components/MapControls'
import Sidebar from './components/Sidebar'
import SpotDetail from './components/SpotDetail'
import SpotForm from './components/SpotForm'
import AuthScreen from './components/AuthScreen'
import SettingsModal from './components/SettingsModal'
import GuestScreen from './components/GuestScreen'
import TeamModal from './components/TeamModal'
import DiscoverPanel from './components/DiscoverPanel'

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
      className={`pointer-events-none fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-[3000] max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl ${colors[toast.kind] || colors.info}`}
    >
      {toast.message}
    </div>
  )
}

function Shell() {
  const store = useStore()
  const { mode, user, authReady, membership, spots, refSpots, showToast, updateSpot, addSpot } = store

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [layerId, setLayerId] = useState(() => localStorage.getItem(LS_LAYER) || 'esri')
  const [labelsOn, setLabelsOn] = useState(() => localStorage.getItem(LS_LABELS) !== '0')
  const [selectedId, setSelectedId] = useState(null)
  const [addMode, setAddMode] = useState(false)
  const [draftPos, setDraftPos] = useState(null)
  const [formState, setFormState] = useState(null) // null | {mode:'create'} | {mode:'edit', spot}
  const [adjusting, setAdjusting] = useState(false) // formulaire replié pendant qu'on déplace le marqueur
  const [approachEdit, setApproachEdit] = useState(null) // édition de l'itinéraire d'approche d'un spot
  const approachSeq = useRef(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [discover, setDiscover] = useState(null) // { center, radiusKm, status, results, error }
  const discoverSeq = useRef(0)
  const discoverRef = useRef(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [userPos, setUserPos] = useState(null)
  const [locating, setLocating] = useState(false)
  const mapRef = useRef(null)

  useEffect(() => localStorage.setItem(LS_LAYER, layerId), [layerId])
  useEffect(() => localStorage.setItem(LS_LABELS, labelsOn ? '1' : '0'), [labelsOn])
  useEffect(() => {
    discoverRef.current = discover
  }, [discover])

  const selectedSpot = spots.find((s) => s.id === selectedId)

  const select = useCallback(
    (id) => {
      // Un formulaire ou un tracé en cours contient du travail non
      // enregistré : on ne l'écrase pas silencieusement.
      if (formState || approachEdit) {
        showToast(
          approachEdit
            ? "Termine ou annule d'abord le tracé d'approche"
            : "Enregistre ou annule d'abord le formulaire en cours",
          'info'
        )
        return false
      }
      setAddMode(false)
      setDraftPos(null)
      setSelectedId(id)
      return true
    },
    [formState, approachEdit, showToast]
  )

  const selectAndFly = useCallback(
    (id) => {
      if (!select(id)) return
      const spot = spots.find((s) => s.id === id)
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
    setAdjusting(false)
  }, [])

  // Calcule (ou recalcule) le tracé d'approche pendant l'édition. `seq`
  // ignore les réponses obsolètes si l'utilisateur enchaîne les clics.
  const computeApproach = useCallback(
    async (spotId, waypoints, routeMode) => {
      const spot = spots.find((s) => s.id === spotId)
      if (!spot) return
      const seq = ++approachSeq.current
      if (!waypoints.length) {
        setApproachEdit((prev) =>
          prev ? { ...prev, waypoints, mode: routeMode, geometry: [], distance: 0, routedMode: routeMode, loading: false } : prev
        )
        return
      }
      setApproachEdit((prev) => (prev ? { ...prev, waypoints, mode: routeMode, loading: true } : prev))
      const points = [...waypoints, { lat: spot.lat, lng: spot.lng }]
      let result
      if (routeMode === 'trail') {
        try {
          result = await trailRoute(points)
        } catch {
          result = directRoute(points)
        }
      } else {
        result = directRoute(points)
      }
      if (approachSeq.current !== seq) return
      setApproachEdit((prev) =>
        prev
          ? { ...prev, geometry: result.geometry, distance: result.distance, routedMode: result.routedMode, loading: false }
          : prev
      )
    },
    [spots]
  )

  const startApproachEdit = useCallback((spot) => {
    setFormState(null)
    setAddMode(false)
    setDraftPos(null)
    setAdjusting(false)
    const a = spot.approach
    setApproachEdit({
      spotId: spot.id,
      waypoints: a?.waypoints || [],
      mode: a?.mode || 'trail',
      geometry: a?.geometry || [],
      distance: a?.distance || 0,
      routedMode: a?.mode || 'trail',
      loading: false,
    })
  }, [])

  const saveApproach = async () => {
    const a = approachEdit
    if (!a || a.loading) return
    const value = a.waypoints.length
      ? { waypoints: a.waypoints, geometry: a.geometry, distance: a.distance, mode: a.routedMode }
      : null
    const ok = await updateSpot(a.spotId, { approach: value })
    if (ok) {
      setApproachEdit(null)
      setSelectedId(a.spotId)
      showToast(value ? "Itinéraire d'approche enregistré" : 'Tracé supprimé', 'success')
    }
  }

  const handleMapClick = useCallback(
    (latlng) => {
      if (addMode) {
        setDraftPos({ lat: latlng.lat, lng: latlng.lng })
        setAddMode(false)
        setFormState({ mode: 'create' })
      } else if (approachEdit) {
        computeApproach(
          approachEdit.spotId,
          [...approachEdit.waypoints, { lat: latlng.lat, lng: latlng.lng }],
          approachEdit.mode
        )
      } else if (adjusting) {
        setDraftPos({ lat: latlng.lat, lng: latlng.lng })
      } else if (!formState) {
        setSelectedId(null)
      }
    },
    [addMode, approachEdit, computeApproach, adjusting, formState]
  )

  const handleSaved = (id) => {
    setFormState(null)
    setDraftPos(null)
    setAdjusting(false)
    setSelectedId(id)
  }

  const handleEdit = (spot) => {
    setFormState({ mode: 'edit', spot })
  }

  const handleStartAdjust = () => {
    if (formState?.mode === 'edit' && !draftPos) {
      setDraftPos({ lat: formState.spot.lat, lng: formState.spot.lng })
    }
    setAdjusting(true)
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

  // ----- Découverte de lieux abandonnés (OpenStreetMap) -----
  const openDiscover = () => {
    cancelAll()
    setSelectedId(null)
    const center = userPos ||
      (mapRef.current
        ? { lat: mapRef.current.getCenter().lat, lng: mapRef.current.getCenter().lng }
        : { lat: 46.8, lng: 2.4 })
    setDiscover({ center, radiusKm: 5, status: 'idle', results: [], error: '' })
    if (window.innerWidth < 640) setSidebarOpen(false)
  }

  const runDiscover = useCallback(async () => {
    const current = discoverRef.current
    if (!current?.center) return
    const { center, radiusKm } = current
    setDiscover((d) => (d ? { ...d, status: 'loading', error: '' } : d))
    const seq = ++discoverSeq.current
    try {
      const online = await discoverAbandoned(center, radiusKm)
      if (discoverSeq.current !== seq) return
      // Base de découverte perso (carte importée) d'abord — curée, en tête —
      // puis les sources en ligne en écartant les doublons proches (< 80 m).
      const refs = refCandidates(refSpots, center, radiusKm)
      const found = [...refs, ...online.filter((o) => !refs.some((rf) => distanceKm(rf, o) < 0.08))].sort(
        (a, b) => b.score - a.score || a.distanceKm - b.distanceKm,
      )
      // On écarte les candidats déjà présents dans la carte (< 60 m d'un spot).
      const fresh = found.filter((c) => !spots.some((s) => distanceKm(s, c) < 0.06))
      setDiscover((d) => (d ? { ...d, status: 'done', results: fresh, enriching: fresh.length > 0 } : d))
      // Enrichissement (histoire Wikipédia + analyse IA gratuite si configurée),
      // en tâche de fond : la liste s'affiche tout de suite, les infos arrivent.
      enrichDiscoveries(fresh)
        .then((enr) => {
          if (discoverSeq.current !== seq) return
          const map = enr?.results || {}
          setDiscover((d) => {
            if (!d) return d
            const results = d.results.map((r) => (map[r.id] ? { ...r, enrichment: map[r.id] } : r))
            // L'IA trie : les lieux « top » et les plus intéressants remontent,
            // les « quelconque » descendent. À défaut d'IA, on garde l'ordre
            // (score documenté puis distance).
            const rank = (r) => {
              const ai = r.enrichment?.ai
              if (!ai) return 0
              const base = ai.verdict === 'top' ? 100 : ai.verdict === 'quelconque' ? -100 : 0
              return base + (Number(ai.interet) || 0)
            }
            results.sort((a, b) => rank(b) - rank(a) || b.score - a.score || a.distanceKm - b.distanceKm)
            // enr null = échec total → état IA INCONNU (aiEnabled null) : le
            // panneau n'affiche alors NI « configurée » NI « non configurée ».
            return {
              ...d,
              results,
              aiEnabled: enr ? Boolean(enr.aiEnabled) : null,
              aiError: enr?.aiError || null,
              enriching: false,
            }
          })
        })
        .catch(() => setDiscover((d) => (d ? { ...d, enriching: false } : d)))
    } catch (err) {
      if (discoverSeq.current !== seq) return
      const raw = err?.message || 'réseau'
      let msg
      if (/429/.test(raw)) {
        msg = 'Trop de recherches d’affilée — attends ~1 min puis relance une seule fois.'
      } else if (/HTTP 5\d\d/.test(raw)) {
        msg = `Serveurs OpenStreetMap indisponibles (${raw}). Attends ~1 min puis réessaie (ou réduis le rayon).`
      } else if (/abort/i.test(raw)) {
        msg =
          'La recherche a mis trop de temps à répondre. Attends ~1 min puis réessaie (ou réduis le rayon).'
      } else if (/load failed|failed to fetch|networkerror/i.test(raw)) {
        msg =
          'Connexion au serveur impossible. Si Safari a un bloqueur de pub/contenu ou un VPN actif, désactive-le pour ce site puis réessaie.'
      } else {
        msg = `Recherche indisponible (${raw}). Réessaie ou réduis le rayon.`
      }
      setDiscover((d) => (d ? { ...d, status: 'error', error: msg } : d))
    }
  }, [spots, refSpots])

  const recenterDiscover = () => {
    if (!navigator.geolocation) {
      showToast('Géolocalisation non disponible', 'error')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserPos(p)
        setFlyTarget({ ...p, zoom: 13, ts: Date.now() })
        setDiscover((d) => (d ? { ...d, center: p } : d))
        setLocating(false)
      },
      () => {
        showToast('Position introuvable — vérifie les autorisations', 'error')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const addDiscovered = async (c) => {
    const ai = c.enrichment?.ai
    const wiki = c.enrichment?.wiki
    const parts = []
    if (c.typeLabel) parts.push(c.typeLabel)
    const dangerLabel = ai?.danger?.label || c.danger?.label
    const dangerRisks = ai?.danger?.risques || c.danger?.risks || []
    if (dangerLabel) parts.push(`⚠️ Danger ${dangerLabel}${dangerRisks.length ? ' : ' + dangerRisks.slice(0, 3).join(', ') : ''}`)
    if (ai?.resume) parts.push(ai.resume)
    else if (wiki?.extract) parts.push(wiki.extract)
    else parts.push(`Suggéré par OpenStreetMap (${c.tagline}). À vérifier sur place.`)
    if (ai?.conseils) parts.push(`Conseil : ${ai.conseils}`)
    const created = await addSpot({
      name: c.name,
      category: c.category,
      status: 'repere',
      lat: c.lat,
      lng: c.lng,
      description: parts.join('\n\n'),
    })
    if (created) {
      setDiscover((d) => (d ? { ...d, results: d.results.filter((r) => r.id !== c.id) } : d))
      showToast(`« ${c.name} » ajouté en Repéré`, 'success')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (addMode) setAddMode(false)
        else if (approachEdit) setApproachEdit(null)
        else if (adjusting) setAdjusting(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (teamOpen) setTeamOpen(false)
        else if (discover) setDiscover(null)
        else if (!formState) setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addMode, approachEdit, adjusting, settingsOpen, teamOpen, discover, formState])

  if (mode === 'cloud' && !authReady) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-zinc-950">
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

  // Connecté mais on vérifie encore l'invitation.
  if (mode === 'cloud' && membership === 'unknown') {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-zinc-950">
        <Loader2 size={28} className="animate-spin text-amber-400" />
      </div>
    )
  }

  // Connecté mais pas invité : pas d'accès à la carte.
  if (mode === 'cloud' && membership === 'guest') {
    return (
      <>
        <GuestScreen />
        <Toast />
      </>
    )
  }

  const panelOpen = formState || selectedSpot

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <MapView
        spots={spots}
        selectedId={selectedId}
        onSelect={selectAndFly}
        layerId={layerId}
        labelsOn={labelsOn}
        addMode={addMode || Boolean(approachEdit)}
        draftPos={draftPos}
        onMapClick={handleMapClick}
        onDraftMove={setDraftPos}
        userPos={userPos}
        flyTarget={flyTarget}
        mapRef={mapRef}
        approachDraft={approachEdit}
        onApproachWaypointMove={(i, pos) => {
          if (!approachEdit) return
          const wps = approachEdit.waypoints.map((w, j) => (j === i ? pos : w))
          computeApproach(approachEdit.spotId, wps, approachEdit.mode)
        }}
        discoverResults={discover?.results}
        discoverCircle={discover ? { center: discover.center, radiusKm: discover.radiusKm } : null}
        onDiscoverSelect={(r) => setFlyTarget({ lat: r.lat, lng: r.lng, zoom: 16, ts: Date.now() })}
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
            onOpenTeam={() => setTeamOpen(true)}
          />
        </div>
      ) : (
        <button
          title="Ouvrir la liste"
          onClick={() => setSidebarOpen(true)}
          className="glass absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[1000] flex h-11 w-11 items-center justify-center rounded-xl text-zinc-200 shadow-lg transition hover:bg-zinc-700/70"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Panneau droit : détail ou formulaire */}
      {/* Barre d'édition de l'itinéraire d'approche */}
      {approachEdit && (
        <div className="pointer-events-none absolute bottom-0 right-0 z-[1100] w-full sm:w-[400px] sm:p-3">
          <div className="glass pointer-events-auto pb-safe w-full rounded-none px-4 py-3 sm:rounded-2xl">
            <p className="text-[11px] leading-relaxed text-zinc-400">
              🥾 Touche la carte : d'abord le <span className="font-semibold text-sky-300">parking 🅿️</span>, puis
              chaque étape jusqu'au spot. Les points se déplacent en les faisant glisser.
            </p>
            <div className="mt-1.5 text-sm text-zinc-100">
              {approachEdit.loading ? (
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Loader2 size={13} className="animate-spin" /> calcul du tracé…
                </span>
              ) : approachEdit.waypoints.length ? (
                <span>
                  {approachEdit.waypoints.length} point{approachEdit.waypoints.length > 1 ? 's' : ''} ·{' '}
                  {formatDistance(approachEdit.distance / 1000)} · ~{walkMinutes(approachEdit.distance)} min
                  {approachEdit.mode === 'trail' && approachEdit.routedMode === 'direct' && (
                    <span className="text-amber-300"> · sentiers indisponibles, tracé direct</span>
                  )}
                </span>
              ) : (
                <span className="text-zinc-500">Aucun point posé</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex rounded-lg bg-zinc-800/70 p-0.5 text-[11px] font-medium">
                <button
                  onClick={() => computeApproach(approachEdit.spotId, approachEdit.waypoints, 'trail')}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    approachEdit.mode === 'trail' ? 'bg-sky-500/30 text-sky-200' : 'text-zinc-400'
                  }`}
                >
                  Sentiers
                </button>
                <button
                  onClick={() => computeApproach(approachEdit.spotId, approachEdit.waypoints, 'direct')}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    approachEdit.mode === 'direct' ? 'bg-sky-500/30 text-sky-200' : 'text-zinc-400'
                  }`}
                >
                  Direct
                </button>
              </div>
              <button
                title="Retirer le dernier point"
                disabled={!approachEdit.waypoints.length}
                onClick={() =>
                  computeApproach(approachEdit.spotId, approachEdit.waypoints.slice(0, -1), approachEdit.mode)
                }
                className="rounded-lg bg-zinc-800/70 p-2 text-zinc-300 transition hover:bg-zinc-700/70 disabled:opacity-40"
              >
                <Undo2 size={14} />
              </button>
              <span className="flex-1" />
              <button
                onClick={() => setApproachEdit(null)}
                className="rounded-lg bg-zinc-800/70 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700/70"
              >
                Annuler
              </button>
              <button
                onClick={saveApproach}
                disabled={approachEdit.loading}
                className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                <Check size={14} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {!approachEdit && panelOpen && (
        <div
          className={`pointer-events-none absolute bottom-0 right-0 z-[1100] w-full sm:w-[400px] sm:p-3 ${
            formState && adjusting ? '' : 'top-0'
          }`}
        >
          {formState ? (
            <SpotForm
              key={formState.mode === 'edit' ? formState.spot.id : 'new'}
              spot={formState.mode === 'edit' ? formState.spot : null}
              position={draftPos}
              adjusting={adjusting}
              onStartAdjust={handleStartAdjust}
              onEndAdjust={() => setAdjusting(false)}
              onSaved={handleSaved}
              onCancel={cancelAll}
            />
          ) : (
            <SpotDetail
              key={selectedSpot.id}
              spot={selectedSpot}
              onClose={() => setSelectedId(null)}
              onEdit={handleEdit}
              onEditApproach={startApproachEdit}
            />
          )}
        </div>
      )}

      {/* Panneau « Découvrir » */}
      {discover && (
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-[1100] w-full sm:w-[400px] sm:p-3">
          <DiscoverPanel
            discover={discover}
            locating={locating}
            onClose={() => setDiscover(null)}
            onRadius={(km) => setDiscover((d) => (d ? { ...d, radiusKm: km } : d))}
            onSearch={runDiscover}
            onAdd={addDiscovered}
            onSelect={(r) => setFlyTarget({ lat: r.lat, lng: r.lng, zoom: 16, ts: Date.now() })}
            onRecenter={recenterDiscover}
          />
        </div>
      )}

      {/* Contrôles carte (cachés sur mobile quand un panneau plein écran est ouvert) */}
      <div className={sidebarOpen || discover ? 'hidden sm:contents' : 'contents'}>
        <MapControls
          layerId={layerId}
          onLayerChange={setLayerId}
          labelsOn={labelsOn}
          onLabelsToggle={() => setLabelsOn((v) => !v)}
          onLocate={locate}
          locating={locating}
          onZoom={(dir) => (dir > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut())}
          onGoto={(t) => setFlyTarget({ ...t, ts: Date.now() })}
          onOpenDiscover={openDiscover}
          discoverActive={Boolean(discover)}
          shifted={(Boolean(panelOpen) || Boolean(discover)) && !adjusting && !approachEdit}
        />
      </div>

      {/* Bannière mode ajout */}
      {addMode && (
        <div className="glass no-select pointer-events-auto absolute left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-[1200] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-zinc-100 shadow-2xl">
          <span className="hidden sm:inline">🎯 Clique sur la carte pour placer le spot</span>
          <span className="sm:hidden">🎯 Touche la carte pour placer le spot</span>
          <button onClick={() => setAddMode(false)} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bouton ajouter */}
      {!addMode && !formState && !approachEdit && !discover && (
        <button
          onClick={startAdd}
          className={`absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-[1000] -translate-x-1/2 items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 shadow-2xl shadow-amber-400/20 transition hover:bg-amber-300 active:scale-95 ${
            sidebarOpen ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <Plus size={18} strokeWidth={2.5} /> Spot
        </button>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
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
