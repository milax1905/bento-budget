import { createClient } from '@supabase/supabase-js'

const LS_CONFIG = 'urbex-atlas:supabase-config'

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

export function getConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: 'env' }
  const stored = getStoredConfig()
  if (stored?.url && stored?.anonKey) return { ...stored, source: 'app' }
  return null
}

let client = null

export function getSupabase() {
  if (client) return client
  const config = getConfig()
  if (!config) return null
  client = createClient(config.url, config.anonKey)
  return client
}

export const isCloudConfigured = () => getConfig() !== null
