import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, token } from '../lib/api'
import type { User } from '../lib/types'
import { store } from '../lib/util'

type Ctx = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  tankId: number | null
  setTankId: (id: number) => void
}

const AuthCtx = createContext<Ctx | null>(null)
const TANK_KEY = 'pompiste.tank'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!token.get())
  const [tankId, setTank] = useState<number | null>(() => store.get<number | null>(TANK_KEY, null))

  const applyUser = useCallback((u: User | null) => {
    setUser(u)
    if (u) {
      const ids = u.tanks.map((t) => t.id)
      setTank((cur) => (cur && ids.includes(cur) ? cur : ids[0] ?? null))
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!token.get()) { setUser(null); setLoading(false); return }
    try {
      applyUser(await api.get<User>('/me'))
    } catch (e: any) {
      if (e?.status === 401) setUser(null)
    } finally {
      setLoading(false)
    }
  }, [applyUser])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/login', { email, password })
    token.set(res.token)
    applyUser(res.user)
  }, [applyUser])

  const logout = useCallback(async () => {
    try { await api.post('/logout') } catch { /* jeton déjà invalide */ }
    token.set(null)
    setUser(null)
  }, [])

  const setTankId = useCallback((id: number) => { setTank(id); store.set(TANK_KEY, id) }, [])

  const value = useMemo(() => ({ user, loading, login, logout, refresh, tankId, setTankId }), [user, loading, login, logout, refresh, tankId, setTankId])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth hors AuthProvider')
  return c
}
