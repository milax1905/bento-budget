export const CATEGORIES = [
  { id: 'usine', label: 'Usine / Industriel', emoji: '🏭' },
  { id: 'chateau', label: 'Château / Manoir', emoji: '🏰' },
  { id: 'maison', label: 'Maison / Villa', emoji: '🏚️' },
  { id: 'hopital', label: 'Hôpital / Sanatorium', emoji: '🏥' },
  { id: 'eglise', label: 'Église / Religieux', emoji: '⛪' },
  { id: 'ecole', label: 'École / Université', emoji: '🏫' },
  { id: 'militaire', label: 'Militaire / Bunker', emoji: '🪖' },
  { id: 'tunnel', label: 'Tunnel / Souterrain', emoji: '🕳️' },
  { id: 'gare', label: 'Gare / Ferroviaire', emoji: '🚂' },
  { id: 'piscine', label: 'Piscine', emoji: '🏊' },
  { id: 'parc', label: 'Parc / Fête foraine', emoji: '🎡' },
  { id: 'hotel', label: 'Hôtel / Restaurant', emoji: '🏨' },
  { id: 'ferme', label: 'Ferme / Grange', emoji: '🌾' },
  { id: 'autre', label: 'Autre', emoji: '📍' },
]

export const STATUSES = [
  { id: 'fait', label: 'Fait', color: '#10b981', desc: 'Exploré, on y est allés' },
  { id: 'a_faire', label: 'À faire', color: '#f59e0b', desc: 'Trouvé, pas encore exploré' },
  { id: 'repere', label: 'Repéré', color: '#38bdf8', desc: 'À vérifier / rumeur' },
  { id: 'perdu', label: 'Perdu', color: '#a1a1aa', desc: 'Détruit, muré ou inaccessible' },
]

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1]
export const statusById = (id) => STATUSES.find((s) => s.id === id) || STATUSES[2]

export const MAX_PHOTOS = 8
export const MAX_CHECKLIST = 40

// Affichée dans le pied de la liste — incrémentée à chaque livraison pour
// vérifier d'un coup d'œil quelle version est déployée.
export const APP_VERSION = '2.22'

// Fonds de carte. L'imagerie Esri est mise à jour très régulièrement au niveau
// mondial ; l'ortho IGN est la plus détaillée sur la France.
export const BASE_LAYERS = [
  {
    id: 'esri',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 20,
    maxNativeZoom: 19,
    dark: true,
  },
  {
    id: 'ign',
    label: 'Satellite IGN 🇫🇷',
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image%2Fjpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; IGN / Géoplateforme',
    maxZoom: 20,
    maxNativeZoom: 19,
    dark: true,
  },
  {
    id: 'osm',
    label: 'Plan',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
    dark: false,
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    maxNativeZoom: 17,
    dark: false,
  },
]

// Surcouche « noms de lieux » pour les fonds satellite.
export const LABELS_LAYER = {
  url: 'https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; CARTO',
  maxZoom: 20,
  maxNativeZoom: 19,
}

export const DEFAULT_CENTER = [46.8, 2.4]
export const DEFAULT_ZOOM = 6
