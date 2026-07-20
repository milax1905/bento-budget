import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getSupabase } from './supabase'
import { idbGet, idbSet } from './localdb'

const LS_SPOTS = 'urbex-atlas:spots'

const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

const newId = () =>
  crypto.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

const fromDb = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  status: row.status,
  lat: row.lat,
  lng: row.lng,
  description: row.description || '',
  accessNotes: row.access_notes || '',
  danger: row.danger ?? 2,
  photos: Array.isArray(row.photos) ? row.photos : [],
  approach: row.approach || null,
  visitedAt: row.visited_at || null,
  createdBy: row.created_by || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toDb = (s) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  status: s.status,
  lat: s.lat,
  lng: s.lng,
  description: s.description,
  access_notes: s.accessNotes,
  danger: s.danger,
  photos: s.photos,
  approach: s.approach ?? null,
  visited_at: s.visitedAt,
  created_by: s.createdBy,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
})

// Colonnes autorisées pour un update partiel (on n'envoie jamais la ligne
// entière, pour ne pas écraser les modifications concurrentes du coéquipier).
const PATCH_COLUMNS = {
  name: 'name',
  category: 'category',
  status: 'status',
  lat: 'lat',
  lng: 'lng',
  description: 'description',
  accessNotes: 'access_notes',
  danger: 'danger',
  photos: 'photos',
  approach: 'approach',
  visitedAt: 'visited_at',
  updatedAt: 'updated_at',
}

const patchToDb = (patch) => {
  const row = {}
  for (const [key, value] of Object.entries(patch)) {
    const col = PATCH_COLUMNS[key]
    if (col) row[col] = value
  }
  return row
}

const isValidSpot = (s) =>
  s && typeof s === 'object' && typeof s.name === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lng)

function loadLocalSpots() {
  try {
    const raw = localStorage.getItem(LS_SPOTS)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data.filter(isValidSpot) : []
  } catch {
    return []
  }
}

export function StoreProvider({ children }) {
  // getSupabase() renvoie null si aucune config (ou une config invalide) :
  // dans ce cas l'app fonctionne en mode local.
  const supabase = getSupabase()
  const cloud = supabase != null

  const [spots, setSpots] = useState(() => (cloud ? [] : loadLocalSpots()))
  const [loading, setLoading] = useState(cloud)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloud)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const loadedOnce = useRef(false)
  const localReady = useRef(false)

  const showToast = useCallback((message, kind = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ message, kind })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  // ----- Mode local : chargement depuis IndexedDB (avec migration depuis
  // l'ancien stockage localStorage, limité à ~5 Mo sur iOS) -----
  useEffect(() => {
    if (cloud) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = await idbGet(LS_SPOTS)
        if (cancelled) return
        if (Array.isArray(stored)) {
          setSpots(stored.filter(isValidSpot))
        } else {
          const legacy = loadLocalSpots()
          if (legacy.length) await idbSet(LS_SPOTS, legacy)
        }
      } catch {
        /* IndexedDB indisponible : on reste sur le localStorage déjà chargé */
      } finally {
        if (!cancelled) localReady.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud])

  // ----- Mode local : persistance IndexedDB (repli localStorage) -----
  useEffect(() => {
    if (cloud || !localReady.current) return
    idbSet(LS_SPOTS, spots).catch(() => {
      try {
        localStorage.setItem(LS_SPOTS, JSON.stringify(spots))
      } catch {
        showToast('Stockage local plein — supprime des photos ou active la synchro cloud', 'error')
      }
    })
  }, [spots, cloud, showToast])

  // ----- Mode cloud : session + auth -----
  useEffect(() => {
    if (!supabase) return
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null)
        setAuthReady(true)
      })
      .catch(() => setAuthReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Ne remplace l'objet user que si l'identité change (évite de casser le
      // canal realtime à chaque rafraîchissement de jeton).
      setUser((prev) => (prev?.id === session?.user?.id ? prev : (session?.user ?? null)))
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // ----- Mode cloud : temps réel + chargement (une fois abonné) -----
  const userId = user?.id
  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false

    const applyRow = (row) => {
      const spot = fromDb(row)
      setSpots((prev) => [spot, ...prev.filter((s) => s.id !== spot.id)])
    }

    const fetchSpots = async () => {
      if (!loadedOnce.current) setLoading(true)
      const { data, error } = await supabase.from('spots').select('*').order('updated_at', { ascending: false })
      if (cancelled) return
      if (error) {
        showToast(`Chargement impossible : ${error.message}`, 'error')
      } else {
        setSpots(data.map(fromDb))
        loadedOnce.current = true
      }
      setLoading(false)
    }

    const channel = supabase
      .channel('spots-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, async (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          setSpots((prev) => prev.filter((s) => s.id !== payload.old.id))
          return
        }
        const row = payload.new
        if (!row?.id) return
        // Les gros payloads (photos) peuvent être tronqués par le temps réel :
        // dans ce cas on recharge la ligne complète au lieu d'écraser l'état
        // avec des données partielles.
        const truncated = (Array.isArray(payload.errors) && payload.errors.length > 0) || row.photos == null
        if (truncated) {
          const { data } = await supabase.from('spots').select('*').eq('id', row.id).single()
          if (!cancelled && data) applyRow(data)
        } else {
          applyRow(row)
        }
      })
      .subscribe((status) => {
        if (cancelled) return
        // Chargement une fois abonné (et re-chargement après reconnexion) :
        // aucun événement ne peut se perdre entre le fetch et l'abonnement.
        if (status === 'SUBSCRIBED') fetchSpots()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          showToast('Connexion temps réel interrompue — recharge la page si ça persiste', 'error')
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, showToast])

  const profileName = user?.user_metadata?.pseudo || user?.email?.split('@')[0] || ''

  // ----- CRUD (optimiste : état local d'abord, puis push) -----
  const addSpot = useCallback(
    async (draft) => {
      const now = new Date().toISOString()
      const spot = {
        id: newId(),
        danger: 2,
        photos: [],
        description: '',
        accessNotes: '',
        visitedAt: null,
        ...draft,
        createdBy: cloud ? profileName : draft.createdBy || 'moi',
        createdAt: now,
        updatedAt: now,
      }
      setSpots((prev) => [spot, ...prev])
      if (supabase) {
        const { error } = await supabase.from('spots').insert(toDb(spot))
        if (error) {
          setSpots((prev) => prev.filter((s) => s.id !== spot.id))
          showToast(`Ajout impossible : ${error.message}`, 'error')
          return null
        }
      }
      return spot
    },
    [supabase, cloud, profileName, showToast]
  )

  // Renvoie true si la modification est enregistrée (l'appelant peut alors
  // fermer son formulaire), false si elle a été annulée suite à une erreur.
  const updateSpot = useCallback(
    async (id, patch) => {
      let previous = null
      const stamped = { ...patch, updatedAt: new Date().toISOString() }
      setSpots((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          previous = s
          return { ...s, ...stamped }
        })
      )
      if (supabase) {
        const { error } = await supabase.from('spots').update(patchToDb(stamped)).eq('id', id)
        if (error) {
          setSpots((prev) => prev.map((s) => (s.id === id && previous ? previous : s)))
          showToast(`Modification impossible : ${error.message}`, 'error')
          return false
        }
      }
      return true
    },
    [supabase, showToast]
  )

  const deleteSpot = useCallback(
    async (id) => {
      const removed = spots.find((s) => s.id === id)
      setSpots((prev) => prev.filter((s) => s.id !== id))
      if (supabase) {
        const { error } = await supabase.from('spots').delete().eq('id', id)
        if (error) {
          if (removed) setSpots((prev) => [removed, ...prev])
          showToast(`Suppression impossible : ${error.message}`, 'error')
        }
      }
    },
    [supabase, spots, showToast]
  )

  const importSpots = useCallback(
    async (imported) => {
      const now = new Date().toISOString()
      const existing = new Set(spots.map((s) => s.id))
      const seen = new Set(existing)
      const toAdd = []
      for (const s of imported) {
        // Un id déjà présent = le même spot : on ne le duplique pas.
        if (s.id && existing.has(s.id)) continue
        const id = s.id && !seen.has(s.id) ? s.id : newId()
        seen.add(id)
        toAdd.push({
          danger: 2,
          photos: [],
          description: '',
          accessNotes: '',
          visitedAt: null,
          createdBy: '',
          createdAt: now,
          updatedAt: now,
          ...s,
          id,
        })
      }
      if (!toAdd.length) {
        showToast('Rien de nouveau à importer', 'info')
        return
      }
      if (supabase) {
        // Cloud d'abord : en cas d'échec, l'état local reste intact.
        // ignoreDuplicates protège les lignes déjà en base d'un écrasement.
        const { error } = await supabase.from('spots').upsert(toAdd.map(toDb), { ignoreDuplicates: true })
        if (error) {
          showToast(`Import impossible : ${error.message}`, 'error')
          return
        }
      }
      setSpots((prev) => [...toAdd, ...prev])
      showToast(`${toAdd.length} spot(s) importé(s)`, 'success')
    },
    [supabase, spots, showToast]
  )

  // ----- Auth -----
  const signIn = useCallback(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    [supabase]
  )

  const signUp = useCallback(
    async (email, password, pseudo) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { pseudo } },
      })
      if (error) throw error
      // Avec la confirmation d'email activée, Supabase renvoie un user sans
      // identité quand l'adresse est déjà prise (pour ne pas la divulguer).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('Un compte existe déjà avec cet email — connecte-toi.')
      }
      return { needsConfirmation: !data.session }
    },
    [supabase]
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSpots([])
    loadedOnce.current = false
  }, [supabase])

  const value = {
    mode: cloud ? 'cloud' : 'local',
    spots,
    loading,
    user,
    authReady,
    profileName,
    addSpot,
    updateSpot,
    deleteSpot,
    importSpots,
    signIn,
    signUp,
    signOut,
    toast,
    showToast,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
