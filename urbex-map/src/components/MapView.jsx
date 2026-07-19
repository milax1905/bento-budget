import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { BASE_LAYERS, LABELS_LAYER, DEFAULT_CENTER, DEFAULT_ZOOM, categoryById, statusById } from '../lib/constants'

const PIN_SVG = (color) =>
  `<svg viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.16 0 0 7.16 0 16c0 10.8 16 26 16 26s16-15.2 16-26C32 7.16 24.84 0 16 0z" fill="${color}"/><circle cx="16" cy="15.5" r="10.5" fill="rgba(0,0,0,0.38)"/></svg>`

const iconCache = new Map()

function spotIcon(spot, selected) {
  const st = statusById(spot.status)
  const cat = categoryById(spot.category)
  const key = `${st.id}|${cat.id}|${selected ? 1 : 0}`
  if (iconCache.has(key)) return iconCache.get(key)
  const size = selected ? 46 : 36
  const icon = L.divIcon({
    className: 'urbex-pin',
    html: `<div class="pin ${selected ? 'pin-selected' : ''}"><span class="pin-emoji" style="font-size:${Math.round(size * 0.38)}px">${cat.emoji}</span>${PIN_SVG(st.color)}</div>`,
    iconSize: [size, size * 1.31],
    iconAnchor: [size / 2, size * 1.31],
  })
  iconCache.set(key, icon)
  return icon
}

const draftIcon = L.divIcon({
  className: 'urbex-pin',
  html: `<div class="pin pin-draft"><span class="pin-emoji" style="font-size:17px">📍</span>${PIN_SVG('#f43f5e')}</div>`,
  iconSize: [44, 58],
  iconAnchor: [22, 58],
})

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng)
    },
  })
  return null
}

function FlyController({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 16), { duration: 0.9 })
  }, [target, map])
  return null
}

function CursorController({ addMode }) {
  const map = useMap()
  useEffect(() => {
    map.getContainer().style.cursor = addMode ? 'crosshair' : ''
  }, [addMode, map])
  return null
}

// Expose la carte au parent (pour le zoom custom).
function MapRefBinder({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    return () => {
      mapRef.current = null
    }
  }, [map, mapRef])
  return null
}

export default function MapView({
  spots,
  selectedId,
  onSelect,
  layerId,
  labelsOn,
  addMode,
  draftPos,
  onMapClick,
  onDraftMove,
  userPos,
  flyTarget,
  mapRef,
}) {
  const layer = BASE_LAYERS.find((l) => l.id === layerId) || BASE_LAYERS[0]

  const markers = useMemo(
    () =>
      spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={spotIcon(spot, spot.id === selectedId)}
          zIndexOffset={spot.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(spot.id) }}
        />
      )),
    [spots, selectedId, onSelect]
  )

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      className="h-full w-full"
      worldCopyJump
    >
      <TileLayer
        key={layer.id}
        url={layer.url}
        attribution={layer.attribution}
        maxZoom={layer.maxZoom}
        maxNativeZoom={layer.maxNativeZoom}
      />
      {labelsOn && layer.dark && (
        <TileLayer
          key={`labels-${layer.id}`}
          url={LABELS_LAYER.url}
          attribution={LABELS_LAYER.attribution}
          maxZoom={LABELS_LAYER.maxZoom}
          maxNativeZoom={LABELS_LAYER.maxNativeZoom}
          pane="overlayPane"
        />
      )}

      <ClickHandler onMapClick={onMapClick} />
      <FlyController target={flyTarget} />
      <CursorController addMode={addMode} />
      <MapRefBinder mapRef={mapRef} />

      {markers}

      {draftPos && (
        <Marker
          position={[draftPos.lat, draftPos.lng]}
          icon={draftIcon}
          draggable
          zIndexOffset={2000}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng()
              onDraftMove?.({ lat, lng })
            },
          }}
        />
      )}

      {userPos && (
        <>
          <CircleMarker
            center={[userPos.lat, userPos.lng]}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }}
          />
          <CircleMarker
            center={[userPos.lat, userPos.lng]}
            radius={16}
            pathOptions={{ color: '#3b82f6', weight: 1, opacity: 0.4, fillColor: '#3b82f6', fillOpacity: 0.12 }}
          />
        </>
      )}
    </MapContainer>
  )
}
