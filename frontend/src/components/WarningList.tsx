import type { Warning } from '../lib/api'
import { cls } from '../lib/util'

const ICON = { bloquant: '⛔', alerte: '⚠️', info: 'ℹ️' }
const TONE = {
  bloquant: 'border-red-200 bg-red-50 text-red-900',
  alerte: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
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
      {sorted.map((w) => (
        <li key={w.code + w.message} className={cls('rounded-lg border px-3 py-2.5 text-sm', TONE[w.level])}>
          {w.level === 'alerte' && onToggle ? (
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600" checked={confirmed?.includes(w.code) ?? false} onChange={() => onToggle(w.code)} />
              <span><span aria-hidden>{ICON[w.level]} </span>{w.message}<span className="mt-0.5 block text-xs opacity-75">Je confirme avoir vérifié — sera signalé au contrôle.</span></span>
            </label>
          ) : (
            <span><span aria-hidden>{ICON[w.level]} </span>{w.message}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
