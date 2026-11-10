import { History, Paperclip, ShieldAlert } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Filters, type FilterValues } from '../components/Filters'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui'
import { api, type Paginated } from '../lib/api'
import { counter, dateTime, daysAgoISO, litres, todayISO } from '../lib/format'
import type { Refuel } from '../lib/types'

export default function RefuelsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [f, setF] = useState<FilterValues>({ from: daysAgoISO(6), to: todayISO(), vehicle_id: params.get('vehicle_id') ?? '' })
  const [page, setPage] = useState(1)
  const [anomaliesOnly, setAnomaliesOnly] = useState(false)
  const q = useQuery({
    queryKey: ['refuels', f, page, anomaliesOnly],
    queryFn: () => api.get<Paginated<Refuel>>('/refuels', { ...f, page, anomalies_only: anomaliesOnly ? 1 : undefined }),
    placeholderData: keepPreviousData,
  })
  const update = (v: FilterValues) => { setF(v); setPage(1) }

  return (
    <>
      <PageHeader icon={History} title="Historique des ravitaillements" sub="Bons validés et annulés — détail, séries et justificatifs" />
      <Filters value={f} onChange={update} show={['from', 'to', 'site_id', 'fuel_tank_id', 'vehicle_category', 'work_shift_id', 'status', 'search']} />
      <label className="mb-4 inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
        <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={anomaliesOnly} onChange={(e) => { setAnomaliesOnly(e.target.checked); setPage(1) }} />
        <ShieldAlert size={16} className="text-amber-600" />Uniquement les bons avec anomalie
        {f.vehicle_id && <button className="ml-3 text-brand-700 underline" onClick={() => update({ ...f, vehicle_id: '' })}>Retirer le filtre véhicule</button>}
      </label>
      <ErrorBox error={q.error} />
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty icon={History}>Aucun bon pour ces critères.</Empty> : (
          <>
            {/* Mobile : cartes */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {q.data.data.map((r) => (
                <li key={r.id}>
                  <Link to={`/bons/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.vehicle_code} <span className="text-xs font-normal text-ink-500">{r.voucher_number}</span></p>
                      <p className="truncate text-xs text-ink-500">{dateTime(r.refueled_at)} · {r.driver_name ?? 'Sans conducteur'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">{litres(r.quantity_l)}</p>
                      {r.status === 'annule' ? <Badge color="red">Annulé</Badge> : r.has_anomaly ? <Badge color="amber">Anomalie</Badge> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Bureau : tableau */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead><tr><th>N° bon</th><th>Date</th><th>Véhicule</th><th>Conducteur</th><th>Pompiste</th><th>Citerne</th>
                  <th className="text-right">Séries</th><th className="text-right">Qté</th><th className="text-right">Compteur</th><th>Photos</th><th>Statut</th></tr></thead>
                <tbody>
                  {q.data.data.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/bons/${r.id}`)}>
                      <td className="font-semibold text-ink-900">{r.voucher_number}{r.paper_voucher_number && <span className="block text-xs text-ink-500">papier {r.paper_voucher_number}</span>}</td>
                      <td>{dateTime(r.refueled_at)}</td>
                      <td><span className="font-semibold">{r.vehicle_code}</span><span className="block text-xs text-ink-500">{r.vehicle_immatriculation}</span></td>
                      <td>{r.driver_name ?? '—'}<span className="block text-xs text-ink-500">{r.shift_name}</span></td>
                      <td>{r.pump_attendant_name}</td>
                      <td>{r.tank?.code}</td>
                      <td className="text-right text-xs tabular-nums">{Number(r.index_start).toLocaleString('fr-FR')}<br />{Number(r.index_end).toLocaleString('fr-FR')}</td>
                      <td className="text-right font-bold tabular-nums text-ink-900">{litres(r.quantity_l)}</td>
                      <td className="text-right tabular-nums">{counter(r.counter_value, r.counter_unit)}</td>
                      <td><span className="inline-flex items-center gap-1 text-ink-500"><Paperclip size={14} />{r.attachments?.length ?? 0}</span></td>
                      <td>{r.status === 'annule' ? <Badge color="red">Annulé</Badge> : r.has_anomaly ? <Badge color="amber">Anomalie</Badge> : <Badge color="green">Validé</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
