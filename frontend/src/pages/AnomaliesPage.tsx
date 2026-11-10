import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api, type Paginated } from '../lib/api'
import { dateTime, litres } from '../lib/format'
import type { Anomaly } from '../lib/types'

export const ANOMALY_LABEL: Record<string, string> = {
  serie_incoherente: 'Série incohérente', ecart_quantite_annoncee: 'Écart quantité annoncée', depasse_reservoir: 'Dépasse le réservoir',
  quantite_elevee: 'Quantité élevée', compteur_absent: 'Compteur absent', compteur_en_baisse: 'Compteur en baisse', compteur_saut: 'Saut de compteur',
  doublon_probable: 'Doublon probable', bon_papier_deja_utilise: 'Bon papier déjà utilisé', vehicule_sans_affectation: 'Véhicule sans affectation',
  affectations_contradictoires: 'Affectations contradictoires', conducteur_non_affecte: 'Conducteur non affecté', vehicule_inactif: 'Véhicule inactif / en panne',
  vehicule_autre_site: 'Véhicule d\'un autre site', stock_faible: 'Stock faible', depasse_capacite_citerne: 'Capacité citerne dépassée',
  hors_shift: 'Hors horaires de shift', shifts_non_configures: 'Shifts non configurés', shifts_chevauchants: 'Shifts chevauchants',
}
const SEVERITY = { critique: 'red', alerte: 'amber', info: 'blue' } as const

type Correction = {
  id: number; kind: 'annulation' | 'correction'; reason: string; status: string; created_at: string; proposed_changes: Record<string, string> | null
  refuel: { id: number; voucher_number: string; vehicle_code: string; quantity_l: string; status: string }; requester: { name: string }
}

export default function AnomaliesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'anomalies' | 'corrections'>('anomalies')
  return (
    <>
      <PageHeader title="Alertes et anomalies" sub="Opérations à contrôler et demandes de correction" />
      <div className="mb-4 flex gap-2">
        {(['anomalies', 'corrections'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200'}`}>
            {t === 'anomalies' ? 'Anomalies' : 'Corrections / annulations'}
          </button>
        ))}
      </div>
      {tab === 'anomalies' ? <AnomalyList /> : <CorrectionList canReview={user?.role === 'admin'} />}
    </>
  )
}

function AnomalyList() {
  const [status, setStatus] = useState('ouverte')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [handle, setHandle] = useState<Anomaly | null>(null)
  const q = useQuery({ queryKey: ['anomalies', status, type, page], queryFn: () => api.get<Paginated<Anomaly>>('/anomalies', { status, type, page }), placeholderData: keepPreviousData })
  return (
    <>
      <div className="card mb-3 flex flex-wrap gap-3 p-3">
        <select className="input max-w-[12rem] py-2" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="ouverte">Ouvertes</option><option value="traitee">Traitées</option><option value="ignoree">Ignorées</option><option value="">Toutes</option></select>
        <select className="input max-w-xs py-2" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
          <option value="">Tous les types</option>{Object.entries(ANOMALY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <ErrorBox error={q.error} />
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty>Aucune anomalie {status === 'ouverte' ? 'ouverte' : ''}.</Empty> : (
          <>
            <ul className="divide-y divide-ink-100">
              {q.data.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={SEVERITY[a.severity]}>{a.severity}</Badge>
                      <span className="font-semibold">{ANOMALY_LABEL[a.type] ?? a.type}</span>
                      <span className="text-xs text-ink-500">{dateTime(a.created_at)} · {a.tank?.code}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-700">{a.message}</p>
                    {a.refuel && <Link to={`/bons/${a.refuel.id}`} className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline">Bon {a.refuel.voucher_number} — {a.refuel.vehicle_code} — {litres(a.refuel.quantity_l)}</Link>}
                    {a.resolution_note && <p className="mt-1 text-xs text-ink-500">Traitement : {a.resolution_note}</p>}
                  </div>
                  {a.status === 'ouverte' && <Button size="sm" variant="secondary" onClick={() => setHandle(a)}>Traiter</Button>}
                </li>
              ))}
            </ul>
            <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {handle && <HandleModal a={handle} onClose={() => setHandle(null)} />}
    </>
  )
}

function HandleModal({ a, onClose }: { a: Anomaly; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: (status: string) => api.put(`/anomalies/${a.id}`, { status, resolution_note: note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anomalies'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose() },
  })
  return (
    <Modal open onClose={onClose} title={ANOMALY_LABEL[a.type] ?? a.type}
      footer={<><Button variant="secondary" loading={m.isPending} disabled={!note} onClick={() => m.mutate('ignoree')}>Ignorer</Button>
        <Button loading={m.isPending} disabled={!note} onClick={() => m.mutate('traitee')}>Marquer traitée</Button></>}>
      <p className="text-sm">{a.message}</p>
      <Field label="Commentaire de contrôle (obligatoire)"><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function CorrectionList({ canReview }: { canReview: boolean }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState('en_attente')
  const q = useQuery({ queryKey: ['corrections', status], queryFn: () => api.get<Paginated<Correction>>('/corrections', { status, per_page: 100 }) })
  const [review, setReview] = useState<Correction | null>(null)
  const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: (approve: boolean) => api.post(`/corrections/${review!.id}/review`, { approve, note: note || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['corrections'] }); qc.invalidateQueries({ queryKey: ['refuels'] }); setReview(null); setNote('') },
  })
  return (
    <>
      <div className="mb-3 max-w-[12rem]"><select className="input py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="en_attente">En attente</option><option value="approuve">Approuvées</option><option value="rejete">Rejetées</option><option value="">Toutes</option></select></div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty>Aucune demande.</Empty> : (
          <ul className="divide-y divide-ink-100">{q.data.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="text-sm">
                <p><Badge color={c.kind === 'annulation' ? 'red' : 'blue'}>{c.kind}</Badge> <Link className="font-semibold hover:underline" to={`/bons/${c.refuel.id}`}>{c.refuel.voucher_number}</Link> — {c.refuel.vehicle_code} — {litres(c.refuel.quantity_l)}</p>
                <p className="mt-1 text-ink-700">« {c.reason} » — {c.requester.name}, {dateTime(c.created_at)}</p>
                {c.proposed_changes && <p className="mt-1 text-xs text-ink-500">Modifications : {Object.entries(c.proposed_changes).map(([k, v]) => `${k} = ${v}`).join(', ')}</p>}
              </div>
              {canReview && c.status === 'en_attente' && <Button size="sm" onClick={() => setReview(c)}>Examiner</Button>}
            </li>))}</ul>
        )}
      </Card>
      {review && (
        <Modal open onClose={() => setReview(null)} title={`Demande sur ${review.refuel.voucher_number}`}
          footer={<><Button variant="danger" loading={m.isPending} onClick={() => m.mutate(false)}>Rejeter</Button><Button loading={m.isPending} onClick={() => m.mutate(true)}>Approuver</Button></>}>
          <p className="text-sm">{review.kind === 'annulation' ? 'Le bon sera annulé et la quantité réintégrée au stock.' : "Le bon sera annulé et remplacé par un bon corrigé (l'historique est conservé)."}</p>
          <Field label="Note"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ErrorBox error={m.error} />
        </Modal>
      )}
    </>
  )
}
