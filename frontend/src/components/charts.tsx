import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cls } from '../lib/util'

export const CHART = {
  brand: '#4f46e5',
  brandSoft: '#a5b4fc',
  fuel: '#f59e0b',
  ink: '#334155',
  grid: '#eef2f6',
  axis: { fontSize: 11, fill: '#64748b' },
  palette: ['#4f46e5', '#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6', '#f43f5e', '#64748b'],
}

/** Tooltip sobre commun aux graphiques. */
export function ChartTooltip({ active, payload, label, unit = 'L' }: { active?: boolean; payload?: { value: number; name?: string; color?: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white/95 px-3 py-2 text-xs shadow-lift backdrop-blur">
      {label && <p className="mb-1 font-semibold text-ink-700">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? CHART.brand }} />
          <span className="font-semibold tabular-nums text-ink-900">{Number(p.value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {unit}</span>
        </p>
      ))}
    </div>
  )
}

export function Sparkline({ data, color = CHART.brand }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const id = `sp-${color.slice(1)}`
  return (
    <div className="mt-3 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Jauge circulaire animée du niveau de citerne. */
export function TankGauge({ pct, low, size = 104 }: { pct: number; low?: boolean; size?: number }) {
  const p = Math.max(0, Math.min(100, pct))
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = low ? '#f43f5e' : p < 35 ? '#f59e0b' : '#4f46e5'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - p / 100) }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cls('text-xl font-bold tabular-nums', low ? 'text-rose-600' : 'text-ink-900')}>{Math.round(p)}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">rempli</span>
      </div>
    </div>
  )
}

/** Barre de niveau horizontale animée. */
export function LevelBar({ pct, low, className }: { pct: number; low?: boolean; className?: string }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className={cls('h-2 overflow-hidden rounded-full bg-ink-100', className)}>
      <motion.div className={cls('h-full rounded-full', low ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-gradient-to-r from-brand-600 to-brand-400')}
        initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }} />
    </div>
  )
}
