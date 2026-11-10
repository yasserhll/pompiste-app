import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity, ArrowRight, CalendarRange, Container, Droplets, FileSpreadsheet, Fuel, Gauge, ScanLine, ShieldAlert, Trophy, Truck,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, ChartTooltip, LevelBar, Sparkline, TankGauge } from '../components/charts'
import { Filters, type FilterValues } from '../components/Filters'
import { Badge, Card, CountUp, Empty, ErrorBox, Skeleton, Stat } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { CATEGORY_LABEL, date, daysAgoISO, litres, todayISO } from '../lib/format'

type Summary = {
  period: { from: string; to: string; report_month: string }
  kpis: { today_l: string; today_count: number; month_l: string; period_l: string; period_count: number; received_l: string; open_anomalies: number | null }
  tanks: { id: number; code: string; name: string; site: string; stock_l: string; capacity_l: string; is_low: boolean; fill_pct: number | null }[]
  daily: { day: string; litres: string; bons: number }[]
  monthly: { month: string; litres: string }[]
  by_site: { site_name: string; litres: string; bons: number }[]
  by_category: { vehicle_category: string; litres: string }[]
  top_vehicles: { vehicle_id: number; vehicle_code: string; vehicle_category: string; litres: string; bons: number }[]
}

const L = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} L`
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export default function DashboardPage() {
  const { user } = useAuth()
  const [f, setF] = useState<FilterValues>({ from: daysAgoISO(29), to: todayISO() })
  const q = useQuery({ queryKey: ['dashboard', f], queryFn: () => api.get<Summary>('/dashboard', f), refetchInterval: 60_000 })
  const [tankId, setTankId] = useState('')
  const historyTank = tankId || (q.data?.tanks[0] ? String(q.data.tanks[0].id) : '')
  const hist = useQuery({
    queryKey: ['stock-history', historyTank, f.from, f.to], enabled: !!historyTank,
    queryFn: () => api.get<{ series: { day: string; stock_l: string }[] }>('/dashboard/stock-history', { fuel_tank_id: historyTank, from: f.from, to: f.to }),
  })
  const d = q.data
  const hour = Number(new Date().toLocaleString('fr-FR', { hour: '2-digit', hour12: false }))
  const greet = hour < 18 ? 'Bonjour' : 'Bonsoir'
  const daily = d?.daily.map((x) => ({ ...x, litres: Number(x.litres), label: date(x.day).slice(0, 5) })) ?? []
  const totalCat = d?.by_category.reduce((s, c) => s + Number(c.litres), 0) ?? 0
  const maxTop = Math.max(1, ...(d?.top_vehicles.map((v) => Number(v.litres)) ?? [1]))

  return (
    <div className="space-y-6">
      {/* Bandeau */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl bg-navy-900 px-5 py-6 text-white shadow-lift sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-fuel-500/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-brand-200">{greet}, {user?.name.split(' ')[0]}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord gasoil</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-300"><CalendarRange size={16} />{d ? `Mois de rapport : ${d.period.report_month}` : 'Chargement…'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user?.role !== 'responsable_site' && (
              <Link to="/ravitaillement" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 shadow transition hover:bg-brand-50">
                <ScanLine size={17} />Nouveau ravitaillement
              </Link>
            )}
            {user?.role !== 'pompiste' && (
              <Link to="/rapports" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15">
                <FileSpreadsheet size={17} />Rapports Excel
              </Link>
            )}
          </div>
        </div>
      </motion.section>

      <Filters value={f} onChange={setF} show={user?.role === 'pompiste' ? ['from', 'to'] : ['from', 'to', 'site_id', 'fuel_tank_id', 'vehicle_category', 'work_shift_id']} />
      <ErrorBox error={q.error} />

      {/* Indicateurs */}
      {!d ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <Stat label="Distribué aujourd'hui" icon={Fuel} iconTone="fuel" value={<CountUp value={Number(d.kpis.today_l)} format={L} />} sub={`${d.kpis.today_count} ravitaillement(s)`} />
          <Stat label="Distribué ce mois" icon={Droplets} value={<CountUp value={Number(d.kpis.month_l)} format={L} />} sub="Mois de rapport en cours" delay={0.05} />
          <Stat label="Distribué sur la période" icon={Activity} iconTone="sky" value={<CountUp value={Number(d.kpis.period_l)} format={L} />} sub={`${d.kpis.period_count.toLocaleString('fr-FR')} bons`} delay={0.1}>
            <Sparkline data={daily.map((x) => x.litres)} color={CHART.brand} />
          </Stat>
          <Stat label="Reçu sur la période" icon={Container} iconTone="green" value={<CountUp value={Number(d.kpis.received_l)} format={L} />} sub="Livraisons validées" delay={0.15} />
          {d.kpis.open_anomalies !== null ? (
            <Link to="/anomalies" className="contents">
              <Stat label="Anomalies ouvertes" icon={ShieldAlert} iconTone={d.kpis.open_anomalies ? 'red' : 'gray'} tone={d.kpis.open_anomalies ? 'red' : undefined}
                value={<CountUp value={d.kpis.open_anomalies} format={(n) => Math.round(n).toString()} />} sub={<span className="inline-flex items-center gap-1 font-medium text-brand-600">Voir le contrôle <ArrowRight size={12} /></span>} delay={0.2} />
            </Link>
          ) : <Stat label="Bons aujourd'hui" icon={Gauge} iconTone="violet" value={<CountUp value={d.kpis.today_count} format={(n) => Math.round(n).toString()} />} delay={0.2} />}
        </div>
      )}

      {/* Citernes */}
      {d && d.tanks.length > 0 && (
        <Card title="Niveau des citernes" subtitle="Stock théorique à l'instant" icon={Container} delay={0.1}
          actions={<Link to="/citernes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">Toutes les citernes <ArrowRight size={15} /></Link>}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.tanks.map((t, i) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
                <Link to={`/citernes/${t.id}`} className="card-hover flex items-center gap-4 rounded-2xl border border-ink-200/70 p-4 sm:gap-5">
                  <TankGauge pct={t.fill_pct ?? 0} low={t.is_low} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[15px] font-bold">{t.code}</p>
                      {t.is_low ? <Badge color="red">Stock faible</Badge> : <Badge color="green">Normal</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-500">{t.site}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums">{litres(t.stock_l)}</p>
                    <p className="text-xs text-ink-500">sur {litres(t.capacity_l)}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* Graphiques */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Consommation quotidienne" subtitle="Litres distribués par jour" icon={Activity} className="xl:col-span-2" delay={0.15}>
          {!d ? <Skeleton className="h-64" /> : daily.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={daily} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.axis} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={CHART.axis} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.brandSoft, strokeDasharray: 4 }} />
                <Area type="monotone" dataKey="litres" stroke={CHART.brand} strokeWidth={2.5} fill="url(#gDaily)" animationDuration={900}
                  activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty icon={Activity}>Aucun ravitaillement sur la période.</Empty>}
        </Card>

        <Card title="Par type de véhicule" subtitle="Répartition sur la période" icon={Truck} delay={0.2}>
          {!d ? <Skeleton className="h-64" /> : d.by_category.length ? (
            <div className="flex flex-col items-center">
              <div className="relative h-48 w-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.by_category.map((c) => ({ name: CATEGORY_LABEL[c.vehicle_category] ?? c.vehicle_category, value: Number(c.litres) }))}
                      dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none" animationDuration={900}>
                      {d.by_category.map((_, i) => <Cell key={i} fill={CHART.palette[i % CHART.palette.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{L(totalCat)}</span><span className="text-[11px] text-ink-500">au total</span>
                </div>
              </div>
              <ul className="mt-4 w-full space-y-2 text-sm">
                {d.by_category.map((c, i) => (
                  <li key={c.vehicle_category} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.palette[i % CHART.palette.length] }} />{CATEGORY_LABEL[c.vehicle_category] ?? c.vehicle_category}</span>
                    <span className="font-semibold tabular-nums">{totalCat ? Math.round((Number(c.litres) * 100) / totalCat) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <Empty icon={Truck}>Aucune donnée.</Empty>}
        </Card>

        <Card title="Consommation mensuelle" subtitle="12 derniers mois" icon={CalendarRange} delay={0.25}>
          {!d ? <Skeleton className="h-60" /> : d.monthly.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.monthly.map((x) => ({ ...x, litres: Number(x.litres), label: MONTHS[Number(x.month.slice(5)) - 1] }))} margin={{ left: -8, right: 4 }}>
                <defs><linearGradient id="gMonth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.fuel} /><stop offset="100%" stopColor="#fbbf24" stopOpacity={0.7} /></linearGradient></defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.axis} tickLine={false} axisLine={false} />
                <YAxis tick={CHART.axis} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="litres" fill="url(#gMonth)" radius={[8, 8, 0, 0]} maxBarSize={34} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>Pas encore de données.</Empty>}
        </Card>

        <Card title="Comparaison des chantiers" subtitle="Litres sur la période" icon={Gauge} delay={0.3}>
          {!d ? <Skeleton className="h-60" /> : d.by_site.length ? (
            <ul className="space-y-4">
              {d.by_site.map((s) => {
                const max = Math.max(...d.by_site.map((x) => Number(x.litres)), 1)
                return (
                  <li key={s.site_name}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-ink-800">{s.site_name}</span>
                      <span className="tabular-nums text-ink-500"><b className="font-semibold text-ink-900">{litres(s.litres)}</b> · {s.bons} bons</span>
                    </div>
                    <LevelBar pct={(Number(s.litres) * 100) / max} />
                  </li>
                )
              })}
            </ul>
          ) : <Empty>Aucune donnée.</Empty>}
        </Card>

        <Card title="Évolution du stock" subtitle="Solde en fin de journée" icon={Container} delay={0.35}
          actions={d && d.tanks.length > 1 && (
            <select className="input h-8 w-auto py-0 text-[13px]" value={historyTank} onChange={(e) => setTankId(e.target.value)}>
              {d.tanks.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
            </select>
          )}>
          {hist.data?.series.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hist.data.series.map((x) => ({ ...x, stock_l: Number(x.stock_l), label: date(x.day).slice(0, 5) }))} margin={{ left: -8, right: 4 }}>
                <defs><linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.fuel} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART.fuel} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.axis} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={CHART.axis} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="stepAfter" dataKey="stock_l" stroke={CHART.fuel} strokeWidth={2.5} fill="url(#gStock)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty icon={Container}>{d?.tanks.length ? 'Aucun mouvement.' : 'Stock non visible.'}</Empty>}
        </Card>
      </div>

      <Card title="Véhicules les plus consommateurs" subtitle="Sur la période sélectionnée" icon={Trophy} padded={false} delay={0.4}>
        {!d ? <div className="p-5"><Skeleton className="h-40" /></div> : d.top_vehicles.length ? (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th className="w-12">#</th><th>Véhicule</th><th>Type</th><th className="w-[30%]">Consommation</th><th className="text-right">Bons</th><th className="text-right">Moyenne / bon</th></tr></thead>
              <tbody>{d.top_vehicles.map((v, i) => (
                <tr key={v.vehicle_id}>
                  <td><span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${i < 3 ? 'bg-fuel-100 text-fuel-800' : 'bg-ink-100 text-ink-600'}`}>{i + 1}</span></td>
                  <td><Link to={`/bons?vehicle_id=${v.vehicle_id}`} className="font-semibold text-ink-900 hover:text-brand-600">{v.vehicle_code}</Link></td>
                  <td>{CATEGORY_LABEL[v.vehicle_category] ?? v.vehicle_category}</td>
                  <td><div className="flex items-center gap-3"><LevelBar pct={(Number(v.litres) * 100) / maxTop} className="flex-1" /><span className="w-20 text-right font-semibold tabular-nums text-ink-900">{litres(v.litres)}</span></div></td>
                  <td className="text-right tabular-nums">{v.bons}</td>
                  <td className="text-right tabular-nums">{litres(Number(v.litres) / v.bons)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty icon={Trophy}>Aucun ravitaillement.</Empty>}
      </Card>
    </div>
  )
}
