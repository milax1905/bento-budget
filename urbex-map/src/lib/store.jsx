import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getSupabase, isCloudConfigured } from './supabase'

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
  visited_at: s.visitedAt,
  created_by: s.createdBy,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
})

function loadLocalSpots() {
  try {
    const raw = localStorage.getItem(LS_SPOTS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function StoreProvider({ children }) {
  const cloud = isCloudConfigured()
  const supabase = cloud ? getSupabase() : null

  const [spots, setSpots] = useState(() => (cloud ? [] : loadLocalSpots()))
  const [loading, setLoading] = useState(cloud)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloud)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((message, kind = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ message, kind })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  // ----- Mode local : persistance localStorage -----
  useEffect(() => {
    if (cloud) return
    try {
      localStorage.setItem(LS_SPOTS, JSON.stringify(spots))
    } catch {
      showToast('Stockage local plein — supprime des photos ou active la synchro cloud', 'error')
    }
  }, [spots, cloud, showToast])

  // ----- Mode cloud : session + auth -----
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // ----- Mode cloud : chargement + temps réel -----
  useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false

    const fetchSpots = async () => {
      setLoading(true)
      const { data, error } = await supabase.from('spots').select('*').order('updated_at', { ascending: false })
      if (cancelled) return
      if (error) {
        showToast(`Chargement impossible : ${error.message}`, 'error')
      } else {
        setSpots(data.map(fromDb))
      }
      setLoading(false)
    }
    fetchSpots()

    const channel = supabase
      .channel('spots-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setSpots((prev) => prev.filter((s) => s.id !== payload.old.id))
        } else {
          const spot = fromDb(payload.new)
          setSpots((prev) => {
            const rest = prev.filter((s) => s.id !== spot.id)
            return [spot, ...rest]
          })
        }
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [supabase, user, showToast])

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

  const updateSpot = useCallback(
    async (id, patch) => {
      let previous = null
      let updated = null
      setSpots((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          previous = s
          updated = { ...s, ...patch, updatedAt: new Date().toISOString() }
          return updated
        })
      )
      if (supabase && updated) {
        const { error } = await supabase.from('spots').update(toDb(updated)).eq('id', id)
        if (error) {
          setSpots((prev) => prev.map((s) => (s.id === id && previous ? previous : s)))
          showToast(`Modification impossible : ${error.message}`, 'error')
        }
      }
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
      const toAdd = imported
        .map((s) => ({
          danger: 2,
          photos: [],
          description: '',
          accessNotes: '',
          visitedAt: null,
          createdBy: '',
          createdAt: now,
          updatedAt: now,
          ...s,
          id: s.id && !existing.has(s.id) ? s.id : newId(),
        }))
        .filter((s) => !existing.has(s.id))
      if (!toAdd.length) {
        showToast('Rien de nouveau à importer', 'info')
        return
      }
      setSpots((prev) => [...toAdd, ...prev])
      if (supabase) {
        const { error } = await supabase.from('spots').upsert(toAdd.map(toDb))
        if (error) showToast(`Import cloud incomplet : ${error.message}`, 'error')
      }
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
      return { needsConfirmation: !data.session }
    },
    [supabase]
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSpots([])
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
