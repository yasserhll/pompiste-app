import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Filters, type FilterValues } from '../components/Filters'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { CATEGORY_LABEL, date, daysAgoISO, int, litres, todayISO } from '../lib/format'

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

const AXIS = { fontSize: 11, fill: '#667491' }
const tooltipL = (v: number) => [litres(v), 'Litres']

export default function DashboardPage() {
  const { user } = useAuth()
  const [f, setF] = useState<FilterValues>({ from: daysAgoISO(29), to: todayISO() })
  const q = useQuery({ queryKey: ['dashboard', f], queryFn: () => api.get<Summary>('/dashboard', f), refetchInterval: 60_000 })
  const [tankId, setTankId] = useState<string>('')
  const firstTank = q.data?.tanks[0]?.id
  const historyTank = tankId || (firstTank ? String(firstTank) : '')
  const hist = useQuery({
    queryKey: ['stock-history', historyTank, f.from, f.to], enabled: !!historyTank,
    queryFn: () => api.get<{ series: { day: string; stock_l: string }[] }>('/dashboard/stock-history', { fuel_tank_id: historyTank, from: f.from, to: f.to }),
  })

  const d = q.data
  return (
    <>
      <PageHeader title="Tableau de bord gasoil" sub={d ? `Mois de rapport : ${d.period.report_month}` : undefined} />
      <Filters value={f} onChange={setF} show={user?.role === 'pompiste' ? ['from', 'to'] : ['from', 'to', 'site_id', 'fuel_tank_id', 'vehicle_category', 'work_shift_id']} />
      <ErrorBox error={q.error} />
      {q.isLoading || !d ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Distribué aujourd'hui" value={litres(d.kpis.today_l)} sub={`${d.kpis.today_count} ravitaillement(s)`} />
            <Stat label="Distribué ce mois" value={litres(d.kpis.month_l)} sub="Mois de rapport" />
            <Stat label="Distribué (période)" value={litres(d.kpis.period_l)} sub={`${int(d.kpis.period_count)} bons`} />
            <Stat label="Reçu (période)" value={litres(d.kpis.received_l)} />
            {d.kpis.open_anomalies !== null && <Link to="/anomalies"><Stat label="Anomalies ouvertes" value={int(d.kpis.open_anomalies)} tone={d.kpis.open_anomalies ? 'red' : undefined} /></Link>}
          </div>

          {d.tanks.length > 0 && (
            <Card title="Stock théorique par citerne">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.tanks.map((t) => (
                  <Link key={t.id} to={`/citernes/${t.id}`} className="rounded-lg border border-ink-100 p-3 hover:border-ink-300">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.code}</span>
                      {t.is_low ? <Badge color="red">Stock faible</Badge> : <span className="text-xs text-ink-500">{t.site}</span>}
                    </div>
                    <p className="mt-1 text-xl font-bold tabular-nums">{litres(t.stock_l)} <span className="text-sm font-normal text-ink-500">/ {litres(t.capacity_l)}</span></p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className={`h-full rounded-full ${t.is_low ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(0, Math.min(100, t.fill_pct ?? 0))}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Consommation quotidienne">
              {d.daily.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={d.daily.map((x) => ({ ...x, litres: Number(x.litres), label: date(x.day).slice(0, 5) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} /><YAxis tick={AXIS} width={48} />
                    <Tooltip formatter={tooltipL} /><Bar dataKey="litres" fill="#f2760b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty>Aucun ravitaillement sur la période.</Empty>}
            </Card>
            <Card title="Consommation mensuelle (12 mois)">
              {d.monthly.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={d.monthly.map((x) => ({ ...x, litres: Number(x.litres) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis dataKey="month" tick={AXIS} /><YAxis tick={AXIS} width={48} />
                    <Tooltip formatter={tooltipL} /><Bar dataKey="litres" fill="#394053" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty>Pas encore de données.</Empty>}
            </Card>
            <Card title="Comparaison des chantiers">
              {d.by_site.length ? (
                <ResponsiveContainer width="100%" height={Math.max(160, d.by_site.length * 42)}>
                  <BarChart layout="vertical" data={d.by_site.map((x) => ({ ...x, litres: Number(x.litres) }))} margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" horizontal={false} />
                    <XAxis type="number" tick={AXIS} /><YAxis type="category" dataKey="site_name" tick={AXIS} width={90} />
                    <Tooltip formatter={tooltipL} /><Bar dataKey="litres" fill="#f2760b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty>Aucune donnée.</Empty>}
              {d.by_category.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {d.by_category.map((c) => <Badge key={c.vehicle_category}>{CATEGORY_LABEL[c.vehicle_category] ?? c.vehicle_category} : {litres(c.litres)}</Badge>)}
                </div>
              )}
            </Card>
            <Card title="Évolution du stock" actions={d.tanks.length > 1 && (
              <select className="input w-auto py-1 text-sm" value={historyTank} onChange={(e) => setTankId(e.target.value)}>
                {d.tanks.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
              </select>
            )}>
              {hist.data?.series.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={hist.data.series.map((x) => ({ ...x, stock_l: Number(x.stock_l), label: date(x.day).slice(0, 5) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} /><YAxis tick={AXIS} width={52} />
                    <Tooltip formatter={(v: number) => [litres(v), 'Stock']} /><Line type="stepAfter" dataKey="stock_l" stroke="#d65406" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <Empty>{d.tanks.length ? 'Aucun mouvement.' : 'Stock non visible.'}</Empty>}
            </Card>
          </div>

          <Card title="Véhicules les plus consommateurs (période)" padded={false}>
            {d.top_vehicles.length ? (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>#</th><th>Véhicule</th><th>Type</th><th className="text-right">Litres</th><th className="text-right">Bons</th><th className="text-right">Moy./bon</th></tr></thead>
                  <tbody>{d.top_vehicles.map((v, i) => (
                    <tr key={v.vehicle_id}>
                      <td className="text-ink-500">{i + 1}</td>
                      <td className="font-semibold"><Link to={`/bons?vehicle_id=${v.vehicle_id}`} className="hover:underline">{v.vehicle_code}</Link></td>
                      <td>{CATEGORY_LABEL[v.vehicle_category] ?? v.vehicle_category}</td>
                      <td className="text-right font-medium tabular-nums">{litres(v.litres)}</td>
                      <td className="text-right tabular-nums">{v.bons}</td>
                      <td className="text-right tabular-nums">{litres(Number(v.litres) / v.bons)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            ) : <Empty>Aucun ravitaillement.</Empty>}
          </Card>
        </div>
      )}
    </>
  )
}
