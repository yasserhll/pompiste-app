import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cls } from '../lib/util'

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300',
  brand: 'bg-brand-500 text-ink-950 hover:bg-brand-400 disabled:bg-brand-200 disabled:text-ink-500',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-ink-100 disabled:text-ink-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; loading?: boolean }) {
  const sizes = { sm: 'px-2.5 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-base', xl: 'px-6 py-5 text-lg' }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cls('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed',
        VARIANTS[variant], sizes[size], className)}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cls('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cls('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cls('block', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  )
}

const BADGE: Record<string, string> = {
  gray: 'bg-ink-100 text-ink-700', green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20', blue: 'bg-sky-50 text-sky-700 ring-sky-600/20', brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
}
export function Badge({ color = 'gray', children }: { color?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cls('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent', BADGE[color])}>{children}</span>
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: ReactNode; children?: ReactNode }) {
  const t = {
    info: 'border-sky-200 bg-sky-50 text-sky-900', warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]
  return (
    <div className={cls('rounded-lg border px-3 py-2.5 text-sm', t)} role={tone === 'error' ? 'alert' : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cls('mt-1 text-2xl font-bold tabular-nums', tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink-900')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-ink-500">{children}</p>
}

export function Loading() {
  return <div className="flex justify-center py-12 text-ink-400"><Spinner className="h-7 w-7" /></div>
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Fermer">✕</button>
        </header>
        <div className="space-y-4 p-4">{children}</div>
        {footer && <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-white px-4 py-3 pb-safe">{footer}</footer>}
      </div>
    </div>
  )
}

export function Pagination({ page, last, total, onChange }: { page: number; last: number; total: number; onChange: (p: number) => void }) {
  if (last <= 1) return <p className="px-4 py-3 text-xs text-ink-500">{total} élément(s)</p>
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-ink-500">{total} élément(s) — page {page}/{last}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Précédent</Button>
        <Button size="sm" variant="secondary" disabled={page >= last} onClick={() => onChange(page + 1)}>Suivant</Button>
      </div>
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const e = error as { messages?: string[]; message?: string }
  const msgs = e.messages ?? [e.message ?? 'Erreur inattendue']
  return <Alert tone="error">{msgs.length === 1 ? msgs[0] : <ul className="list-disc pl-4">{msgs.map((m) => <li key={m}>{m}</li>)}</ul>}</Alert>
}
