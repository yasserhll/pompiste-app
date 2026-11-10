import { AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Container, EyeOff, Gauge, ListOrdered, Plus, Power, RotateCcw, Scale, Settings2 } from 'lucide-react'
import { TankGauge } from '../components/charts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, IconChip, Loading, Modal, PageHeader, Pagination, Stat } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api, type Paginated } from '../lib/api'
import { dateTime, litres, num } from '../lib/format'
import type { Site, Tank } from '../lib/types'

export default function TanksPage() {
  const { user } = useAuth()
  const q = useQuery({ queryKey: ['tanks', 'all'], queryFn: () => api.get<Tank[]>('/tanks', { include_inactive: user?.role === 'admin' ? 1 : undefined }) })
  const [creating, setCreating] = useState(false)
  return (
    <>
      <PageHeader icon={Container} title="Citernes" sub="Stock théorique = stock initial + entrées − sorties ± ajustements validés"
        actions={user?.role === 'admin' && <Button variant="brand" icon={Plus} onClick={() => setCreating(true)}>Nouvelle citerne</Button>} />
      <ErrorBox error={q.error} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Card><Empty icon={Container}>Aucune citerne. {user?.role === 'admin' && 'Créez la première citerne avec sa capacité et son stock initial réel.'}</Empty></Card> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((t, i) => (
            <Link key={t.id} to={`/citernes/${t.id}`} className="card card-hover block animate-fade-up p-5" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3"><IconChip icon={Container} tone="fuel" /><div><p className="text-lg font-bold">{t.code}</p><p className="text-sm text-ink-500">{t.site?.name}</p></div></div>
                <div className="flex flex-col items-end gap-1">
                  <Badge color={t.kind === 'mobile' ? 'blue' : 'gray'}>{t.kind === 'mobile' ? 'Mobile' : 'Fixe'}</Badge>
                  {!t.is_active && <Badge color="red">Inactive</Badge>}
                  {t.is_low && <Badge color="red">Stock faible</Badge>}
                </div>
              </div>
              {t.stock_visible ? (
                <>
                  <div className="mt-4 flex items-center gap-5">
                    <TankGauge pct={t.fill_pct ?? 0} low={t.is_low} size={96} />
                    <div><p className="text-xs text-ink-500">Stock théorique</p><p className="text-2xl font-bold tabular-nums">{litres(t.theoretical_stock_l)}</p><p className="text-xs text-ink-500">sur {litres(t.capacity_l)}</p></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-1.5 border-t border-ink-100 pt-3 text-xs text-ink-600">
                    <dt>Capacité</dt><dd className="text-right">{litres(t.capacity_l)}</dd>
                    <dt>Entrées</dt><dd className="text-right">{litres(t.total_entries_l)}</dd>
                    <dt>Sorties</dt><dd className="text-right">{litres(t.total_exits_l)}</dd>
                    <dt>Stock réel mesuré</dt><dd className="text-right">{t.last_inventory ? litres(t.last_inventory.measured_l) : 'Aucun inventaire'}</dd>
                  </dl>
                  {!t.journal_ok && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle size={14} />Incohérence journal / stock — vérifier</p>}
                </>
              ) : <p className="mt-4 flex items-center gap-2 text-sm text-ink-500"><EyeOff size={16} />Stock non visible pour votre rôle.</p>}
            </Link>
          ))}
        </div>
      )}
      {creating && <TankForm onClose={() => setCreating(false)} />}
    </>
  )
}

function TankForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const [f, setF] = useState({ site_id: '', code: '', name: '', kind: 'mobile', capacity_l: '', initial_stock_l: '', initial_stock_at: '', low_stock_threshold_l: '', last_voucher_seq: '' })
  const m = useMutation({
    mutationFn: () => api.post('/tanks', {
      ...f, site_id: Number(f.site_id), initial_stock_at: f.initial_stock_at || null,
      low_stock_threshold_l: f.low_stock_threshold_l || null, last_voucher_seq: f.last_voucher_seq ? Number(f.last_voucher_seq) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tanks'] }); onClose() },
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title="Nouvelle citerne" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Créer</Button></>}>
      <Alert tone="info">Le stock initial doit être une mesure réelle. Il ne pourra ensuite évoluer que par les opérations (entrées, sorties, ajustements validés).</Alert>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Site"><select className="input" value={f.site_id} onChange={set('site_id')}><option value="">—</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Type"><select className="input" value={f.kind} onChange={set('kind')}><option value="mobile">Mobile (camion)</option><option value="fixe">Fixe</option></select></Field>
        <Field label="Code"><input className="input uppercase" value={f.code} onChange={set('code')} placeholder="85751A55" /></Field>
        <Field label="Nom"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Capacité (L)"><input className="input" inputMode="decimal" value={f.capacity_l} onChange={set('capacity_l')} /></Field>
        <Field label="Stock initial (L)"><input className="input" inputMode="decimal" value={f.initial_stock_l} onChange={set('initial_stock_l')} /></Field>
        <Field label="Date du stock initial"><input className="input" type="datetime-local" value={f.initial_stock_at} onChange={set('initial_stock_at')} /></Field>
        <Field label="Seuil stock faible (L)"><input className="input" inputMode="decimal" value={f.low_stock_threshold_l} onChange={set('low_stock_threshold_l')} /></Field>
        <Field label="Dernier n° de bon" hint="Pour continuer la numérotation existante" className="col-span-2"><input className="input" inputMode="numeric" value={f.last_voucher_seq} onChange={set('last_voucher_seq')} /></Field>
      </div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

type Movement = { id: number; type: string; quantity_l: string; balance_after_l: string; occurred_at: string; note: string | null }
const MOVE_LABEL: Record<string, string> = {
  stock_initial: 'Stock initial', entree: 'Entrée', sortie: 'Sortie', ajustement: 'Ajustement',
  annulation_sortie: 'Annulation sortie', annulation_entree: 'Annulation entrée',
}

export function TankDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['tank', id], queryFn: () => api.get<Tank & { dispensers_detail: any[]; users: { id: number; name: string; role: string }[] }>(`/tanks/${id}`) })
  const [page, setPage] = useState(1)
  const moves = useQuery({ queryKey: ['tank-moves', id, page], queryFn: () => api.get<Paginated<Movement>>(`/tanks/${id}/movements`, { page }), enabled: !!q.data?.stock_visible })
  const [reset, setReset] = useState<any | null>(null)
  const [threshold, setThreshold] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/tanks/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tank', id] }); qc.invalidateQueries({ queryKey: ['tanks'] }); setThreshold(null) },
  })

  if (q.isLoading) return <Loading />
  if (!q.data) return <ErrorBox error={q.error} />
  const t = q.data
  const isAdmin = user?.role === 'admin'
  return (
    <>
      <PageHeader icon={Container} title={`Citerne ${t.code}`} sub={`${t.name} · ${t.site?.name} · capacité ${litres(t.capacity_l)}`}
        actions={isAdmin && <Button variant="secondary" icon={Power} onClick={() => save.mutate({ is_active: !t.is_active })}>{t.is_active ? 'Désactiver' : 'Réactiver'}</Button>} />
      <ErrorBox error={save.error} />
      {t.stock_visible && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
          {([['Stock initial', t.initial_stock_l, Archive, 'gray'], ['Total entrées', t.total_entries_l, ArrowDownToLine, 'green'], ['Total sorties', t.total_exits_l, ArrowUpFromLine, 'fuel'],
            ['Ajustements', t.total_adjustments_l, Scale, 'violet'], ['Stock théorique', t.theoretical_stock_l, Container, 'brand']] as const).map(([k, v, I, tone], i) => (
            <Stat key={k} label={k} icon={I} iconTone={tone} value={litres(v)} delay={i * 0.05} />
          ))}
          <div className="card p-5">
            <p className="text-xs text-ink-500">Stock réel mesuré</p>
            {t.last_inventory ? <>
              <p className="text-lg font-bold tabular-nums">{litres(t.last_inventory.measured_l)}</p>
              <p className={`text-xs ${Number(t.last_inventory.difference_l) ? 'text-amber-700' : 'text-ink-500'}`}>écart {litres(t.last_inventory.difference_l)} · {t.last_inventory.measured_at}</p>
            </> : <p className="text-sm text-ink-500">Aucun inventaire validé</p>}
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Compteurs de distribution" icon={Gauge} className="lg:col-span-2">
          <ul className="divide-y divide-ink-100">
            {t.dispensers.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div><p className="font-medium">{d.name} <span className="text-xs text-ink-500">({d.code})</span></p>
                  <p className="text-sm text-ink-600">Dernière série fin validée : <b className="tabular-nums">{num(d.current_index)}</b></p></div>
                {isAdmin && <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setReset(d)}>Remise à zéro / changement</Button>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Paramètres" icon={Settings2}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Seuil stock faible</dt>
              <dd>{threshold === null ? <>{litres(t.low_stock_threshold_l)} {isAdmin && <button className="ml-1 text-brand-700" onClick={() => setThreshold(t.low_stock_threshold_l ?? '')}>modifier</button>}</> :
                <span className="flex gap-1"><input className="input w-24 py-1" value={threshold} onChange={(e) => setThreshold(e.target.value)} /><Button size="sm" onClick={() => save.mutate({ low_stock_threshold_l: threshold || null })}>OK</Button></span>}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Stock négatif</dt><dd>{t.allow_negative ? 'Autorisé' : 'Interdit'}</dd></div>
            <div><dt className="text-ink-500">Utilisateurs rattachés</dt><dd className="mt-1 flex flex-wrap gap-1">{t.users?.length ? t.users.map((u) => <Badge key={u.id}>{u.name}</Badge>) : '—'}</dd></div>
          </dl>
        </Card>
      </div>

      {t.stock_visible && (
        <Card title="Journal des mouvements de stock" subtitle="Append-only : chaque litre entré ou sorti" icon={ListOrdered} className="mt-6" padded={false}>
          {moves.isLoading ? <Loading /> : !moves.data?.data.length ? <Empty>Aucun mouvement.</Empty> : (
            <>
              <div className="overflow-x-auto"><table className="table-base">
                <thead><tr><th>Date</th><th>Type</th><th className="text-right">Quantité</th><th className="text-right">Solde après</th><th>Détail</th></tr></thead>
                <tbody>{moves.data.data.map((m) => (
                  <tr key={m.id}><td>{dateTime(m.occurred_at)}</td><td>{MOVE_LABEL[m.type] ?? m.type}</td>
                    <td className={`text-right font-semibold tabular-nums ${Number(m.quantity_l) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(m.quantity_l) > 0 ? '+' : ''}{litres(m.quantity_l)}</td>
                    <td className="text-right tabular-nums">{litres(m.balance_after_l)}</td><td className="text-ink-600">{m.note}</td></tr>))}</tbody>
              </table></div>
              <Pagination page={moves.data.current_page} last={moves.data.last_page} total={moves.data.total} onChange={setPage} />
            </>
          )}
        </Card>
      )}
      {reset && <ResetModal dispenser={reset} onClose={() => setReset(null)} />}
    </>
  )
}

function ResetModal({ dispenser, onClose }: { dispenser: { id: number; name: string; current_index: string }; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ kind: 'remise_a_zero', new_index: '0', reason: '' })
  const m = useMutation({
    mutationFn: () => api.post(`/dispensers/${dispenser.id}/reset`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tank'] }); onClose() },
  })
  return (
    <Modal open onClose={onClose} title={`Compteur ${dispenser.name}`} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} disabled={f.reason.length < 5} onClick={() => m.mutate()}>Enregistrer</Button></>}>
      <Alert tone="warning">Index actuel : {num(dispenser.current_index)}. Cette opération est journalisée ; le prochain ravitaillement partira du nouvel index.</Alert>
      <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
        <option value="remise_a_zero">Remise à zéro</option><option value="changement_compteur">Changement de compteur</option><option value="correction_index">Correction d'index</option></select></Field>
      <Field label="Nouvel index"><input className="input" inputMode="decimal" value={f.new_index} onChange={(e) => setF({ ...f, new_index: e.target.value })} /></Field>
      <Field label="Motif"><textarea className="input" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
