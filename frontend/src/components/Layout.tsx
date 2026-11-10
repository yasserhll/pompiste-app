import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown, Cog, Container, Droplets, FileSpreadsheet, History, LayoutDashboard, LogOut, Menu, QrCode, Ruler,
  ScanLine, ShieldAlert, Truck, Wifi, WifiOff, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { InstallButton } from './PwaPrompts'
import { ROLE_LABEL } from '../lib/format'
import type { Role } from '../lib/types'
import { cls } from '../lib/util'

type Item = { to: string; label: string; icon: LucideIcon; roles: Role[]; mobile?: boolean }
type Section = { title: string; items: Item[] }

const ALL: Role[] = ['admin', 'responsable_site', 'pompiste']
const MGR: Role[] = ['admin', 'responsable_site']

const SECTIONS: Section[] = [
  { title: 'Opérations', items: [
    { to: '/ravitaillement', label: 'Scanner un véhicule', icon: ScanLine, roles: ['admin', 'pompiste'], mobile: true },
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: ALL, mobile: true },
    { to: '/bons', label: 'Historique des bons', icon: History, roles: ALL, mobile: true },
  ] },
  { title: 'Stock', items: [
    { to: '/citernes', label: 'Citernes', icon: Container, roles: ALL, mobile: true },
    { to: '/entrees', label: 'Entrées de gasoil', icon: Droplets, roles: ALL },
    { to: '/inventaires', label: 'Inventaires & ajustements', icon: Ruler, roles: ALL },
  ] },
  { title: 'Contrôle', items: [
    { to: '/anomalies', label: 'Alertes & anomalies', icon: ShieldAlert, roles: MGR, mobile: true },
    { to: '/rapports', label: 'Rapports Excel', icon: FileSpreadsheet, roles: MGR },
  ] },
  { title: 'Administration', items: [
    { to: '/qr-codes', label: 'QR codes', icon: QrCode, roles: ['admin'] },
    { to: '/referentiel', label: 'Parc & conducteurs', icon: Truck, roles: ['admin'] },
    { to: '/parametres', label: 'Paramètres', icon: Cog, roles: ['admin'] },
  ] },
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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

export function Layout() {
  const { user, logout, tankId, setTankId } = useAuth()
  const online = useOnline()
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  const outlet = useOutlet()
  useEffect(() => setMenu(false), [loc.pathname])
  if (!user) return null

  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(user.role)) })).filter((s) => s.items.length)
  const flat = sections.flatMap((s) => s.items)
  const current = flat.filter((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to))).sort((a, b) => b.to.length - a.to.length)[0]
  const canScan = user.role !== 'responsable_site'
  const mobileItems = flat.filter((n) => n.mobile && n.to !== '/ravitaillement').slice(0, 4)
  const tank = user.tanks.find((t) => t.id === tankId)

  const sidebar = (layoutKey: string) => (
    <div className="relative flex h-full flex-col bg-navy-900 text-ink-300">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-600/25 blur-3xl" />

      <div className="relative flex items-center gap-3 px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuel-400 to-fuel-600 text-navy-950 shadow-glow-fuel">
          <Droplets size={20} strokeWidth={2.4} />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-white">Pompiste</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Gestion du gasoil</p>
        </div>
      </div>

      {user.tanks.length > 0 && (
        <div className="relative px-4 pb-4">
          <label className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Citerne active</label>
          <div className="relative">
            <Container size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fuel-400" />
            <select aria-label="Citerne active" value={tankId ?? ''} onChange={(e) => setTankId(Number(e.target.value))}
              className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-8 text-sm font-medium text-white outline-none transition hover:bg-white/10 focus:border-brand-400 [&>option]:text-ink-900">
              {user.tanks.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.site?.name}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>
        </div>
      )}

      <nav className="scroll-thin relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-ink-500">{s.title}</p>
            <div className="space-y-0.5">
              {s.items.map((n) => {
                const active = current?.to === n.to
                return (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'}
                    className={cls('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                      active ? 'text-white' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100')}>
                    {active && <motion.span layoutId={`nav-${layoutKey}`} className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-600/90 to-brand-500/70 shadow-glow"
                      transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                    <n.icon size={18} strokeWidth={2} className={cls('relative shrink-0', active ? 'text-white' : 'text-ink-500 group-hover:text-ink-300')} />
                    <span className="relative truncate">{n.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative space-y-3 border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <InstallButton variant="dark" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white ring-2 ring-white/10">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-ink-400">{ROLE_LABEL[user.role]}</p>
          </div>
          <button onClick={logout} title="Se déconnecter" aria-label="Se déconnecter" className="rounded-lg p-2 text-ink-400 transition hover:bg-white/10 hover:text-white"><LogOut size={18} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh] lg:pl-[17rem]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] lg:block">{sidebar('desk')}</aside>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMenu(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] shadow-2xl" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
              {sidebar('mob')}
              <button onClick={() => setMenu(false)} className="absolute right-3 top-[calc(env(safe-area-inset-top)+1.5rem)] rounded-lg p-1.5 text-ink-400 hover:bg-white/10" aria-label="Fermer le menu"><X size={18} /></button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
          <button onClick={() => setMenu(true)} className="-ml-1 rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Menu"><Menu size={20} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink-900">{current?.label ?? 'Pompiste'}</p>
            <p className="hidden truncate text-xs text-ink-500 sm:block">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {tank && (
            <span className="hidden items-center gap-2 rounded-full bg-fuel-50 px-3 py-1.5 text-xs font-semibold text-fuel-800 ring-1 ring-fuel-200 sm:inline-flex">
              <Container size={14} />{tank.code}
            </span>
          )}
          <span className={cls('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ring-1',
            online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200')}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="hidden sm:inline">{online ? 'En ligne' : 'Hors ligne'}</span>
          </span>
          {canScan && loc.pathname !== '/ravitaillement' && (
            <NavLink to="/ravitaillement" className="hidden items-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:to-brand-700 md:inline-flex">
              <ScanLine size={17} />Scanner
            </NavLink>
          )}
        </div>
        <AnimatePresence>
          {!online && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-amber-500 text-center text-[13px] font-medium text-ink-950">
              <p className="px-4 py-2">Hors connexion — la saisie en cours est conservée sur cet appareil et sera envoyée au retour du réseau.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="mx-auto max-w-[90rem] px-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8">
        <InstallButton variant="banner" />
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation mobile + bouton de scan central */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/70 bg-white/90 pb-safe backdrop-blur-xl lg:hidden">
        <div className="relative mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5">
          {mobileItems.slice(0, 2).map((n) => <MobileLink key={n.to} n={n} />)}
          {canScan && (
            <NavLink to="/ravitaillement" aria-label="Scanner un véhicule" className="relative -mt-7 flex flex-col items-center gap-1">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow ring-4 ring-white">
                <ScanLine size={24} strokeWidth={2.2} />
              </span>
              <span className="text-[11px] font-semibold text-brand-700">Scanner</span>
            </NavLink>
          )}
          {mobileItems.slice(2, 4).map((n) => <MobileLink key={n.to} n={n} />)}
        </div>
      </nav>
    </div>
  )
}

function MobileLink({ n }: { n: Item }) {
  return (
    <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cls('flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors', isActive ? 'text-brand-700' : 'text-ink-500')}>
      {({ isActive }) => (
        <>
          <span className={cls('flex h-8 w-12 items-center justify-center rounded-full transition', isActive && 'bg-brand-50')}><n.icon size={20} strokeWidth={isActive ? 2.4 : 2} /></span>
          <span className="max-w-[5.5rem] truncate">{n.label.split(' ')[0]}</span>
        </>
      )}
    </NavLink>
  )
}

