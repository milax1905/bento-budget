import { createClient } from '@supabase/supabase-js'

const LS_CONFIG = 'urbex-atlas:supabase-config'

// URL de projet Supabase standard (la config saisie dans l'app est restreinte
// à ce format pour éviter d'envoyer des identifiants vers un hôte arbitraire).
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/

export function getStoredConfig() {
  try {
    const raw = localStorage.getItem(LS_CONFIG)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStoredConfig(url, anonKey) {
  localStorage.setItem(LS_CONFIG, JSON.stringify({ url, anonKey }))
}

export function clearStoredConfig() {
  localStorage.removeItem(LS_CONFIG)
}

export function isValidSupabaseUrl(url) {
  return typeof url === 'string' && SUPABASE_URL_RE.test(toOrigin(url))
}

// Ne garde que le domaine (protocole + hôte), sans chemin ni slash final :
// une URL collée avec « /rest/v1 », « /auth/v1 » ou un « / » en trop casserait
// toutes les requêtes (le client Supabase ajoute lui-même /auth/v1, /rest/v1…).
function toOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return (url || '').trim().replace(/\/+$/, '')
  }
}

export function getConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (envUrl && envKey) return { url: toOrigin(envUrl), anonKey: envKey, source: 'env' }
  const stored = getStoredConfig()
  if (stored?.url && stored?.anonKey) {
    const origin = toOrigin(stored.url)
    if (isValidSupabaseUrl(origin)) return { url: origin, anonKey: stored.anonKey, source: 'app' }
  }
  return null
}

let client = null

export function getSupabase() {
  if (client) return client
  const config = getConfig()
  if (!config) return null
  try {
    client = createClient(config.url, config.anonKey)
  } catch {
    return null
  }
  return client
}

export const isCloudConfigured = () => getConfig() !== null
