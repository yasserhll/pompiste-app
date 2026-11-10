import { AnimatePresence, animate, motion, useInView } from 'framer-motion'
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Loader2, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cls } from '../lib/util'

// ───────────────────────────────────────────── Boutons

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'fuel'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white shadow-sm hover:bg-ink-800 disabled:bg-ink-300',
  brand: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow hover:from-brand-500 hover:to-brand-700 disabled:from-brand-300 disabled:to-brand-300 disabled:shadow-none',
  fuel: 'bg-gradient-to-b from-fuel-400 to-fuel-500 text-ink-950 shadow-glow-fuel hover:to-fuel-600 disabled:from-fuel-200 disabled:to-fuel-200 disabled:shadow-none',
  secondary: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 shadow-sm hover:bg-ink-50 hover:ring-ink-300 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm hover:to-rose-700 disabled:from-rose-300 disabled:to-rose-300',
}

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, iconRight: IconRight, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; loading?: boolean; icon?: LucideIcon; iconRight?: LucideIcon }) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2', xl: 'h-14 px-6 text-base gap-2.5' }
  const iconSize = size === 'sm' ? 15 : size === 'xl' ? 20 : 17
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cls('inline-flex select-none items-center justify-center rounded-xl font-semibold transition-all duration-150 active:scale-[.98]',
        'focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant], sizes[size], className)}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon && <Icon size={iconSize} strokeWidth={2.2} />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} strokeWidth={2.2} />}
    </button>
  )
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={cls('animate-spin', className)} aria-hidden />
}

// ───────────────────────────────────────────── Conteneurs

export function Card({ title, subtitle, icon: Icon, actions, children, className, padded = true, delay = 0 }:
  { title?: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean; delay?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className={cls('card overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && <IconChip icon={Icon} tone="brand" size="sm" />}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-ink-900">{title}</h2>
              {subtitle && <p className="truncate text-xs text-ink-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
    </motion.section>
  )
}

const CHIP_TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  fuel: 'bg-fuel-50 text-fuel-600 ring-fuel-100',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  red: 'bg-rose-50 text-rose-600 ring-rose-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  gray: 'bg-ink-100 text-ink-600 ring-ink-200',
}
export type Tone = keyof typeof CHIP_TONES

export function IconChip({ icon: Icon, tone = 'brand', size = 'md' }: { icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-8 w-8 rounded-lg', md: 'h-10 w-10 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }[size]
  return (
    <span className={cls('inline-flex shrink-0 items-center justify-center ring-1 ring-inset', s, CHIP_TONES[tone])}>
      <Icon size={size === 'sm' ? 16 : size === 'lg' ? 22 : 19} strokeWidth={2} />
    </span>
  )
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cls('block', className)}>
      <span className="label">{label}</span>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.span key="e" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1.5 flex items-center gap-1 text-[13px] text-rose-600">
            <AlertCircle size={14} />{error}
          </motion.span>
        ) : hint ? <span className="mt-1.5 block text-xs text-ink-500">{hint}</span> : null}
      </AnimatePresence>
    </label>
  )
}

const BADGE: Record<string, string> = {
  gray: 'bg-ink-100 text-ink-700 ring-ink-200', green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200', brand: 'bg-brand-50 text-brand-700 ring-brand-200',
}
const DOT: Record<string, string> = { gray: 'bg-ink-400', green: 'bg-emerald-500', red: 'bg-rose-500', amber: 'bg-amber-500', blue: 'bg-sky-500', brand: 'bg-brand-500' }
export function Badge({ color = 'gray', children, dot = true }: { color?: keyof typeof BADGE; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cls('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', BADGE[color])}>
      {dot && <span className={cls('h-1.5 w-1.5 rounded-full', DOT[color])} />}{children}
    </span>
  )
}

const ALERT = {
  info: { c: 'border-sky-200 bg-sky-50/80 text-sky-900', i: Info, ic: 'text-sky-600' },
  warning: { c: 'border-amber-200 bg-amber-50/80 text-amber-900', i: AlertTriangle, ic: 'text-amber-600' },
  error: { c: 'border-rose-200 bg-rose-50/80 text-rose-900', i: AlertCircle, ic: 'text-rose-600' },
  success: { c: 'border-emerald-200 bg-emerald-50/80 text-emerald-900', i: CheckCircle2, ic: 'text-emerald-600' },
}
export function Alert({ tone = 'info', title, children }: { tone?: keyof typeof ALERT; title?: ReactNode; children?: ReactNode }) {
  const a = ALERT[tone]
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={cls('flex gap-3 rounded-xl border px-4 py-3 text-sm', a.c)} role={tone === 'error' ? 'alert' : undefined}>
      <a.i size={18} className={cls('mt-0.5 shrink-0', a.ic)} />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </motion.div>
  )
}

// ───────────────────────────────────────────── Indicateurs

/** Nombre animé de 0 à la valeur à l'apparition. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (!inView) return
    const c = animate(from.current, value, { duration: 0.9, ease: [0.2, 0.7, 0.2, 1], onUpdate: setShown })
    from.current = value
    return () => c.stop()
  }, [value, inView])
  return <span ref={ref} className="tabular-nums">{format(shown)}</span>
}

export function Stat({ label, value, sub, tone, icon, iconTone = 'brand', delay = 0, children }:
  { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'amber'; icon?: LucideIcon; iconTone?: Tone; delay?: number; children?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className="card card-hover relative overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {icon && <IconChip icon={icon} tone={iconTone} size="sm" />}
      </div>
      <p className={cls('mt-2 break-words text-[clamp(1.25rem,5.2vw,1.65rem)] font-bold leading-tight tracking-tight', tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink-900')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
      {children}
    </motion.div>
  )
}

export function Empty({ children, icon: Icon = Inbox, action }: { children: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400"><Icon size={22} /></span>
      <p className="max-w-sm text-sm text-ink-500">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cls('relative overflow-hidden rounded-lg bg-ink-100', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  )
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={cls('h-10', i % 2 ? 'w-11/12' : 'w-full')} />)}
    </div>
  )
}

export function PageHeader({ title, sub, actions, icon: Icon }: { title: string; sub?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {Icon && <IconChip icon={Icon} tone="brand" size="lg" />}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.div>
  )
}

// ───────────────────────────────────────────── Fenêtre modale

export function Modal({ open, onClose, title, children, footer, icon }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; icon?: LucideIcon }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/55 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="scroll-thin max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-3">
                {icon && <IconChip icon={icon} size="sm" />}
                <h2 className="text-[15px] font-semibold">{title}</h2>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Fermer"><X size={18} /></button>
            </header>
            <div className="space-y-4 p-5">{children}</div>
            {footer && <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-ink-50/80 px-5 py-3.5 pb-safe backdrop-blur">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Pagination({ page, last, total, onChange }: { page: number; last: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-[13px]">
      <span className="text-ink-500"><b className="font-semibold text-ink-700">{total.toLocaleString('fr-FR')}</b> élément(s){last > 1 && <> · page {page} sur {last}</>}</span>
      {last > 1 && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>Précédent</Button>
          <Button size="sm" variant="secondary" iconRight={ChevronRight} disabled={page >= last} onClick={() => onChange(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const e = error as { messages?: string[]; message?: string }
  const msgs = e.messages ?? [e.message ?? 'Erreur inattendue']
  return <Alert tone="error">{msgs.length === 1 ? msgs[0] : <ul className="list-disc pl-4">{msgs.map((m) => <li key={m}>{m}</li>)}</ul>}</Alert>
}

/** Onglets « pilule » avec indicateur animé. */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: LucideIcon; count?: number }[] }) {
  return (
    <div className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl bg-ink-100/80 p-1">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button key={it.value} onClick={() => onChange(it.value)}
            className={cls('relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800')}>
            {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-xl bg-white shadow-card" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
            <span className="relative flex items-center gap-2">
              {it.icon && <it.icon size={16} />}{it.label}
              {it.count !== undefined && <span className="rounded-full bg-ink-200/70 px-1.5 text-[11px] font-semibold text-ink-600">{it.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
