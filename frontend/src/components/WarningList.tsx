import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Info, OctagonX } from 'lucide-react'
import type { Warning } from '../lib/api'
import { cls } from '../lib/util'

const STYLE = {
  bloquant: { c: 'border-rose-200 bg-rose-50/80 text-rose-900', i: OctagonX, ic: 'text-rose-600', tag: 'Bloquant' },
  alerte: { c: 'border-amber-200 bg-amber-50/80 text-amber-900', i: AlertTriangle, ic: 'text-amber-600', tag: 'Alerte' },
  info: { c: 'border-sky-200 bg-sky-50/70 text-sky-900', i: Info, ic: 'text-sky-600', tag: 'Info' },
}

/**
 * Contrôles serveur. Les alertes peuvent être cochées : seules les alertes confirmées
 * sont envoyées dans confirmed_warnings (le serveur refuse les autres avec 409).
 */
export function WarningList({ warnings, confirmed, onToggle }: { warnings: Warning[]; confirmed?: string[]; onToggle?: (code: string) => void }) {
  if (!warnings.length) return null
  const order = { bloquant: 0, alerte: 1, info: 2 }
  const sorted = [...warnings].sort((a, b) => order[a.level] - order[b.level])
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {sorted.map((w) => {
          const s = STYLE[w.level]
          const checked = confirmed?.includes(w.code) ?? false
          const body = (
            <>
              <s.i size={18} className={cls('mt-0.5 shrink-0', s.ic)} />
              <span className="min-w-0 flex-1">
                <span className="mr-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{s.tag}</span>
                {w.message}
                {w.level === 'alerte' && onToggle && <span className="mt-1 block text-xs opacity-75">Cocher pour confirmer la vérification — l'opération sera signalée au contrôle.</span>}
              </span>
            </>
          )
          return (
            <motion.li key={w.code + w.message} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className={cls('rounded-xl border px-3.5 py-3 text-sm', s.c)}>
              {w.level === 'alerte' && onToggle ? (
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(w.code)} />
                  <span className={cls('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                    checked ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-400 bg-white')}>
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  {body}
                </label>
              ) : <span className="flex items-start gap-3">{body}</span>}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
