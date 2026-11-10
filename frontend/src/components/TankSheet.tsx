import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, CalendarRange, Download, FileCheck2, Sheet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, download } from '../lib/api'
import { date, litres, num, time, todayISO } from '../lib/format'
import { cls } from '../lib/util'
import { ProofThumbs, type Proof } from './ProofThumbs'
import { Badge, Button, Card, Empty, ErrorBox, Loading } from './ui'

type Row = {
  id: number
  type: 'stock_initial' | 'entree' | 'transfert_entree' | 'sortie' | 'ajustement' | 'annulation_sortie' | 'annulation_entree'
  occurred_at: string
  entry_l: string | null
  exit_l: string | null
  balance_l: string
  supplier: string | null
  voucher_seq: number | null
  voucher_number: string | null
  paper_voucher_number: string | null
  refuel_id: number | null
  vehicle_code: string | null
  vehicle_label: string | null
  counter_value: string | null
  counter_unit: 'km' | 'h' | null
  index_start: string | null
  index_end: string | null
  driver_name: string | null
  company: string | null
  remark: string | null
  status: 'valide' | 'annule' | null
  has_anomaly: boolean
  attachments: Proof[]
}
type Ledger = {
  tank: { id: number; code: string; name: string }
  label: string
  opening_l: string
  closing_l: string
  totals: { entries_l: string; exits_l: string; adjustments_l: string; vouchers: number; with_proof: number }
  rows: Row[]
}

const isExit = (r: Row) => r.type === 'sortie' || r.type === 'annulation_sortie'
const striked = (r: Row) => r.status === 'annule' || r.type.startsWith('annulation')

/**
 * Fiche citerne, colonnes du fichier terrain (mobile 1.xlsx, Citerne LOUTA…) :
 * Date | ENTRÉE Qte, Fournisseur | SORTIES N° bon, Heure, Code, Immatriculation, Compteur, Qte, Remarque
 * | Série départ | Série fin | Stock | Justificatifs
 */
export function TankSheet({ tankId, tankCode }: { tankId: number; tankCode: string }) {
  const [mode, setMode] = useState<'mois' | 'periode'>('mois')
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const params = mode === 'mois' ? { period: 'mois', month } : { period: 'periode', from, to }
  const q = useQuery({ queryKey: ['ledger', tankId, params], queryFn: () => api.get<Ledger>(`/tanks/${tankId}/ledger`, params), placeholderData: keepPreviousData })
  const d = q.data
  const proofPct = d && d.totals.vouchers ? Math.round((d.totals.with_proof * 100) / d.totals.vouchers) : null

  return (
    <Card title={`Fiche citerne ${tankCode}`} subtitle={d?.label ?? 'Chargement…'} icon={Sheet} padded={false}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-ink-100 p-0.5 text-[13px] font-medium">
            {(['mois', 'periode'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cls('rounded-lg px-3 py-1.5 transition', mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
                {m === 'mois' ? 'Mois' : 'Période'}
              </button>
            ))}
          </div>
          {mode === 'mois'
            ? <input type="month" className="input h-9 w-auto py-0 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
            : <>
              <input type="date" className="input h-9 w-auto py-0 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" className="input h-9 w-auto py-0 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            </>}
          <Button size="sm" variant="secondary" icon={Download}
            onClick={() => download('/reports/export', { scope: 'citerne', fuel_tank_id: tankId, ...params })}>Excel</Button>
        </div>
      }>
      <ErrorBox error={q.error} />
      {!d ? <Loading /> : (
        <>
          {/* Synthèse de la période */}
          <div className="grid grid-cols-2 gap-px border-b border-ink-100 bg-ink-100 sm:grid-cols-5">
            {[
              ['Stock d\'ouverture', litres(d.opening_l), CalendarRange, 'text-ink-900'],
              ['Entrées', `+${litres(d.totals.entries_l)}`, ArrowDownToLine, 'text-emerald-600'],
              ['Sorties', `−${litres(d.totals.exits_l)}`, ArrowUpFromLine, 'text-fuel-700'],
              ['Stock de clôture', litres(d.closing_l), Sheet, 'text-brand-700'],
              ['Bons justifiés', proofPct === null ? '—' : `${d.totals.with_proof} / ${d.totals.vouchers}`, FileCheck2, proofPct !== null && proofPct < 100 ? 'text-amber-600' : 'text-emerald-600'],
            ].map(([k, v, I, c]) => {
              const Icon = I as typeof Sheet
              return (
                <div key={k as string} className="bg-white px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-ink-500"><Icon size={14} />{k as string}</p>
                  <p className={cls('mt-0.5 text-lg font-bold tabular-nums', c as string)}>{v as string}</p>
                </div>
              )
            })}
          </div>

          {!d.rows.length ? <Empty icon={Sheet}>Aucun mouvement sur la période.</Empty> : (
            <>
              {/* Téléphone : une carte par ligne, justificatifs à côté */}
              <ul className="divide-y divide-ink-100 lg:hidden">
                {d.rows.map((r) => (
                  <li key={r.id} className={cls('flex gap-3 px-4 py-3.5', striked(r) && 'bg-rose-50/40')}>
                    <span className={cls('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      isExit(r) ? 'bg-fuel-50 text-fuel-600' : r.type === 'transfert_entree' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600')}>
                      {isExit(r) ? <ArrowUpFromLine size={17} /> : r.type === 'transfert_entree' ? <ArrowRightLeft size={17} /> : <ArrowDownToLine size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cls('font-semibold', striked(r) && 'line-through decoration-rose-400')}>
                            {isExit(r) ? (r.vehicle_code ?? '—') : (r.supplier ?? 'Entrée')}
                            {r.voucher_seq && <span className="ml-1.5 text-xs font-normal text-ink-500">bon {r.voucher_seq}</span>}
                          </p>
                          <p className="text-xs text-ink-500">{date(r.occurred_at)} · {time(r.occurred_at)}{r.counter_value && ` · ${num(r.counter_value)} ${r.counter_unit === 'h' ? 'H' : 'km'}`}</p>
                        </div>
                        <p className={cls('shrink-0 font-bold tabular-nums', isExit(r) ? 'text-fuel-700' : 'text-emerald-600')}>
                          {isExit(r) ? `−${litres(r.exit_l)}` : `+${litres(r.entry_l)}`}
                        </p>
                      </div>
                      {r.index_start && <p className="mt-1 text-xs tabular-nums text-ink-600">Séries {num(r.index_start)} → {num(r.index_end)}</p>}
                      {r.remark && <p className="mt-0.5 truncate text-xs text-ink-500">{r.remark}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {(isExit(r) || r.attachments.length > 0) ? <ProofThumbs items={r.attachments} size={44} /> : <span />}
                        <span className="text-xs text-ink-500">Stock <b className="tabular-nums text-ink-800">{litres(r.balance_l)}</b></span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Bureau : même disposition que le fichier Excel */}
              <div className="scroll-thin hidden overflow-x-auto lg:block">
                <table className="table-base [&_td]:px-2.5 [&_th]:px-2.5">
                  <thead>
                    <tr className="[&>th]:border-r [&>th]:border-ink-200/60">
                      <th rowSpan={2} className="align-bottom">Date</th>
                      <th colSpan={2} className="bg-emerald-50/70 text-center text-emerald-700">Entrée</th>
                      <th colSpan={8} className="bg-fuel-50/70 text-center text-fuel-800">Sorties</th>
                      <th rowSpan={2} className="align-bottom text-right">Série départ</th>
                      <th rowSpan={2} className="align-bottom text-right">Série fin</th>
                      <th rowSpan={2} className="align-bottom text-right">Stock</th>
                    </tr>
                    <tr className="[&>th]:border-r [&>th]:border-ink-200/60">
                      <th className="text-right">Qte</th><th>Fournisseur</th>
                      <th>N° bon</th><th>Heure</th><th>Code</th><th>Immatriculation</th><th className="text-right">Compteur</th><th className="text-right">Qte</th><th className="bg-brand-50/60 text-brand-700">Justificatifs</th><th>Remarque</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-ink-50/60 italic">
                      <td>{date(d.rows[0]?.occurred_at)}</td><td /><td className="text-ink-500">Stock d'ouverture</td>
                      <td colSpan={10} /><td className="text-right font-semibold tabular-nums">{litres(d.opening_l)}</td>
                    </tr>
                    {d.rows.map((r) => (
                      <tr key={r.id} className={cls(striked(r) && 'bg-rose-50/50 text-rose-900/80')}>
                        <td>{date(r.occurred_at)}</td>
                        <td className="text-right font-semibold tabular-nums text-emerald-600">{r.entry_l ? litres(r.entry_l, false) : ''}</td>
                        <td>{r.supplier}</td>
                        <td>{r.refuel_id ? <Link to={`/bons/${r.refuel_id}`} className="font-semibold text-brand-600 hover:underline">{r.voucher_seq}</Link> : ''}</td>
                        <td className="tabular-nums">{r.voucher_seq || isExit(r) ? time(r.occurred_at) : ''}</td>
                        <td className="font-semibold text-ink-900">{isExit(r) ? r.vehicle_code : ''}</td>
                        <td className="text-ink-500">{isExit(r) ? r.vehicle_label : ''}</td>
                        <td className="text-right tabular-nums">{isExit(r) && r.counter_value ? num(r.counter_value) : ''}</td>
                        <td className="text-right font-bold tabular-nums text-fuel-700">{r.exit_l ? litres(r.exit_l, false) : ''}</td>
                        <td className="bg-brand-50/30">{r.type === 'sortie' || r.attachments.length ? <ProofThumbs items={r.attachments} size={38} /> : ''}</td>
                        <td className="max-w-[13rem] truncate text-xs" title={r.remark ?? ''}>
                          {r.has_anomaly && <Badge color="amber">Anomalie</Badge>} {r.remark}
                        </td>
                        <td className="text-right tabular-nums text-ink-500">{r.index_start ? num(r.index_start) : ''}</td>
                        <td className="text-right tabular-nums text-ink-500">{r.index_end ? num(r.index_end) : ''}</td>
                        <td className="text-right font-semibold tabular-nums">{litres(r.balance_l, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
