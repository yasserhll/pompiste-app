import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL } from '../lib/format'
import type { Role } from '../lib/types'
import { cls } from '../lib/util'

type Item = { to: string; label: string; icon: string; roles: Role[]; mobile?: boolean }

const NAV: Item[] = [
  { to: '/ravitaillement', label: 'Scanner', icon: '⛽', roles: ['admin', 'pompiste'], mobile: true },
  { to: '/', label: 'Tableau de bord', icon: '📊', roles: ['admin', 'responsable_site', 'pompiste'], mobile: true },
  { to: '/bons', label: 'Historique', icon: '🧾', roles: ['admin', 'responsable_site', 'pompiste'], mobile: true },
  { to: '/citernes', label: 'Citernes', icon: '🛢️', roles: ['admin', 'responsable_site', 'pompiste'], mobile: true },
  { to: '/entrees', label: 'Entrées de gasoil', icon: '🚚', roles: ['admin', 'responsable_site', 'pompiste'] },
  { to: '/inventaires', label: 'Inventaires', icon: '📏', roles: ['admin', 'responsable_site', 'pompiste'] },
  { to: '/anomalies', label: 'Alertes & anomalies', icon: '🚨', roles: ['admin', 'responsable_site'], mobile: true },
  { to: '/rapports', label: 'Rapports Excel', icon: '📑', roles: ['admin', 'responsable_site'] },
  { to: '/qr-codes', label: 'QR codes', icon: '🔳', roles: ['admin'] },
  { to: '/referentiel', label: 'Parc & conducteurs', icon: '🚛', roles: ['admin'] },
  { to: '/parametres', label: 'Paramètres', icon: '⚙️', roles: ['admin'] },
]

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

export function Layout() {
  const { user, logout, tankId, setTankId } = useAuth()
  const online = useOnline()
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  useEffect(() => setMenu(false), [loc.pathname])
  if (!user) return null

  const items = NAV.filter((n) => n.roles.includes(user.role))
  const mobileItems = items.filter((n) => n.mobile).slice(0, 4)
  const link = (n: Item, compact = false): ReactNode => (
    <NavLink key={n.to} to={n.to} end={n.to === '/'}
      className={({ isActive }) => cls(compact
        ? 'flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium'
        : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
        isActive ? (compact ? 'text-brand-600' : 'bg-white/10 text-white') : (compact ? 'text-ink-500' : 'text-ink-300 hover:bg-white/5 hover:text-white'))}>
      <span aria-hidden className={compact ? 'text-xl' : 'text-base'}>{n.icon}</span>{n.label}
    </NavLink>
  )

  const tankPicker = user.tanks.length > 0 && (
    <select aria-label="Citerne" className="w-full rounded-lg border-0 bg-white/10 px-2 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 [&>option]:text-ink-900"
      value={tankId ?? ''} onChange={(e) => setTankId(Number(e.target.value))}>
      {user.tanks.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.site?.name}</option>)}
    </select>
  )

  const sidebar = (
    <div className="flex h-full flex-col gap-4 bg-ink-900 p-4">
      <div className="flex items-center gap-2 px-1">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <div>
          <p className="text-sm font-bold text-white">Gestion du gasoil</p>
          <p className="text-xs text-ink-400">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>
      {tankPicker && <div><p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">Citerne</p>{tankPicker}</div>}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">{items.map((n) => link(n))}</nav>
      <div className="border-t border-white/10 pt-3">
        <p className="truncate px-1 text-sm font-medium text-white">{user.name}</p>
        <p className="truncate px-1 text-xs text-ink-400">{user.email}</p>
        <button onClick={logout} className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-300 hover:bg-white/5 hover:text-white">Se déconnecter</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-ink-950/50" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink-900 px-4 py-3 text-white lg:hidden">
        <button onClick={() => setMenu(true)} className="-ml-1 rounded p-1 text-xl" aria-label="Menu">☰</button>
        <p className="flex-1 truncate font-semibold">{user.tanks.find((t) => t.id === tankId)?.code ?? 'Gasoil'}</p>
        <span className="truncate text-xs text-ink-300">{user.name}</span>
      </header>

      {!online && (
        <div className="sticky top-12 z-20 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-ink-950 lg:top-0">
          Hors connexion — la saisie en cours est conservée sur ce téléphone. Elle sera envoyée quand le réseau revient.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-100 bg-white pb-safe lg:hidden">
        {mobileItems.map((n) => link(n, true))}
      </nav>
    </div>
  )
}
