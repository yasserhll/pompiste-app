import { Ban, Camera, CheckCircle2, FileDown, Fuel, History, ImageOff, PenLine, Receipt, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api, blobUrl, download } from '../lib/api'
import { counter, dateTime, litres } from '../lib/format'
import type { Anomaly, Attachment, Refuel } from '../lib/types'

type Detail = {
  refuel: Refuel & {
    attachments: Attachment[]
    anomalies: Anomaly[]
    corrections: { id: number; kind: string; reason: string; status: string; created_at: string; requester?: { name: string }; reviewer?: { name: string }; review_note: string | null }[]
    corrects: { id: number; voucher_number: string } | null
    audit_logs: { id: number; action: string; created_at: string; user?: { name: string }; new_values: Record<string, unknown> | null }[]
    tank: { code: string; site?: { name: string } }
  }
  replaced_by: { id: number; voucher_number: string } | null
}

export default function RefuelDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const q = useQuery({ queryKey: ['refuel', id], queryFn: () => api.get<Detail>(`/refuels/${id}`) })
  const [modal, setModal] = useState<null | 'correction' | 'annulation'>(null)

  if (q.isLoading) return <Loading />
  if (q.error || !q.data) return <ErrorBox error={q.error} />
  const { refuel: r, replaced_by } = q.data
  const s = r.snapshot ?? {}

  return (
    <>
      <PageHeader icon={Receipt} title={`Bon ${r.voucher_number}`} sub={`${r.vehicle_code} · ${dateTime(r.refueled_at)}`}
        actions={<>
          <Button variant="secondary" icon={FileDown} onClick={() => download(`/refuels/${r.id}/voucher`)}>Bon PDF</Button>
          {r.status === 'valide' && user?.permissions.request_correction && <Button variant="secondary" icon={PenLine} onClick={() => setModal('correction')}>Demander une correction</Button>}
          {r.status === 'valide' && (user?.role === 'admin' || user?.permissions.request_correction) && (
            <Button variant="danger" icon={Ban} onClick={() => setModal('annulation')}>{user?.role === 'admin' ? 'Annuler le bon' : "Demander l'annulation"}</Button>
          )}
        </>} />

      <div className="mb-4 space-y-2">
        {r.status === 'annule' && <Alert tone="error" title={`Bon annulé le ${dateTime(r.cancelled_at)}`}>{r.cancel_reason}{replaced_by && <> — remplacé par <Link className="font-semibold underline" to={`/bons/${replaced_by.id}`}>{replaced_by.voucher_number}</Link></>}</Alert>}
        {r.corrects && <Alert tone="info">Ce bon corrige le bon <Link className="font-semibold underline" to={`/bons/${r.corrects.id}`}>{r.corrects.voucher_number}</Link>.</Alert>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Opération" icon={Fuel} className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Item k="Véhicule" v={<><b>{r.vehicle_code}</b> — {r.vehicle_immatriculation}<br /><span className="text-ink-500">{r.vehicle_type}</span></>} />
            <Item k="Conducteur" v={<>{r.driver_name ?? <span className="text-amber-700">Non affecté</span>}{s.driver_reason && <span className="block text-xs text-ink-500">Motif : {s.driver_reason}</span>}</>} />
            <Item k="Shift" v={`${r.shift_name ?? '—'} (journée du ${r.work_date?.slice(0, 10).split('-').reverse().join('/')})`} />
            <Item k="Pompiste" v={r.pump_attendant_name} />
            <Item k="Citerne" v={`${r.tank.code} — ${r.site_name}`} />
            <Item k="Identification" v={s.identified_by === 'qr' ? 'QR code scanné' : 'Recherche manuelle'} />
            <Item k="Série départ" v={<>{Number(r.index_start).toLocaleString('fr-FR')}{r.expected_index_start && r.expected_index_start !== r.index_start && <span className="block text-xs text-amber-700">attendue {Number(r.expected_index_start).toLocaleString('fr-FR')}</span>}</>} />
            <Item k="Série fin" v={Number(r.index_end).toLocaleString('fr-FR')} />
            <Item k="Quantité" v={<span className="text-lg font-bold">{litres(r.quantity_l)}</span>} />
            <Item k="Quantité annoncée" v={litres(r.declared_quantity_l)} />
            <Item k="Compteur" v={<>{counter(r.counter_value, r.counter_unit)}{r.previous_counter_value && <span className="block text-xs text-ink-500">précédent {counter(r.previous_counter_value, r.counter_unit)}</span>}</>} />
            <Item k="Stock citerne" v={`${litres(r.stock_before_l)} → ${litres(r.stock_after_l)}`} />
            <Item k="Bon papier" v={r.paper_voucher_number ?? '—'} />
            <Item k="Remarque" v={r.remark ?? '—'} />
            <Item k="Statut" v={r.status === 'annule' ? <Badge color="red">Annulé</Badge> : <Badge color="green">Validé</Badge>} />
          </dl>
        </Card>

        <Card title="Anomalies" icon={ShieldAlert}>
          {r.anomalies.length ? (
            <ul className="space-y-2 text-sm">{r.anomalies.map((a) => (
              <li key={a.id} className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-900">
                <p>{a.message}</p>
                <p className="mt-1 text-xs text-ink-500">{a.status === 'ouverte' ? 'Ouverte' : `${a.status} — ${a.resolution_note ?? ''}`}</p>
              </li>))}</ul>
          ) : <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={17} />Aucune anomalie.</p>}
        </Card>

        <Card title={`Photos / justificatifs (${r.attachments.length})`} icon={Camera} className="lg:col-span-3">
          {r.attachments.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{r.attachments.map((a) => <AttachmentThumb key={a.id} a={a} />)}</div> : <Empty icon={ImageOff}>Aucune photo jointe.</Empty>}
        </Card>

        <Card title="Historique des modifications" icon={History} className="lg:col-span-3" padded={false}>
          <ul className="divide-y divide-ink-100 text-sm">
            {r.corrections.map((c) => (
              <li key={`c${c.id}`} className="px-4 py-2.5">
                <b>Demande de {c.kind}</b> par {c.requester?.name} — « {c.reason} » — <Badge color={c.status === 'approuve' ? 'green' : c.status === 'rejete' ? 'red' : 'amber'}>{c.status.replace('_', ' ')}</Badge>
                {c.reviewer && <span className="text-ink-500"> par {c.reviewer.name}{c.review_note ? ` : ${c.review_note}` : ''}</span>}
              </li>
            ))}
            {r.audit_logs.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span><b>{l.action}</b> — {l.user?.name ?? 'système'}</span><span className="text-ink-500">{dateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {modal && <CorrectionModal refuel={r} kind={modal} direct={modal === 'annulation' && user?.role === 'admin'} onClose={() => setModal(null)} />}
    </>
  )
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-ink-500">{k}</dt><dd className="mt-0.5">{v}</dd></div>
}

function AttachmentThumb({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const isImg = a.mime.startsWith('image/')
  useEffect(() => {
    let u: string | null = null
    if (isImg) blobUrl(`/attachments/${a.id}`).then((x) => { u = x; setUrl(x) }).catch(() => {})
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [a.id, isImg])
  return (
    <>
      <button className="card-hover overflow-hidden rounded-xl border border-ink-200 text-left" onClick={() => (isImg ? setOpen(true) : download(`/attachments/${a.id}`))}>
        <div className="aspect-[4/3] bg-ink-100">{url ? <img src={url} alt={a.original_name ?? ''} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-ink-500">{isImg ? '…' : 'PDF'}</div>}</div>
        <p className="truncate px-2 py-1 text-xs">{a.kind === 'bon_papier' ? 'Bon papier' : a.original_name}</p>
      </button>
      {open && url && (
        <div className="fixed inset-0 z-50 flex animate-fade-up items-center justify-center bg-ink-950/90 p-4 backdrop-blur" onClick={() => setOpen(false)}>
          <img src={url} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  )
}

function CorrectionModal({ refuel, kind, direct, onClose }: { refuel: Refuel; kind: 'correction' | 'annulation'; direct: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [changes, setChanges] = useState({ index_start: '', index_end: '', counter_value: '', paper_voucher_number: '', remark: '' })
  const m = useMutation({
    mutationFn: () => direct
      ? api.post(`/refuels/${refuel.id}/cancel`, { reason })
      : api.post(`/refuels/${refuel.id}/corrections`, {
        kind, reason,
        changes: kind === 'correction' ? Object.fromEntries(Object.entries(changes).filter(([, v]) => v.trim() !== '')) : undefined,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['refuel'] }); qc.invalidateQueries({ queryKey: ['refuels'] }); onClose() },
  })
  const set = (k: keyof typeof changes) => (e: { target: { value: string } }) => setChanges((c) => ({ ...c, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title={direct ? 'Annuler le bon' : kind === 'correction' ? 'Demande de correction' : "Demande d'annulation"}
      footer={<><Button variant="secondary" onClick={onClose}>Fermer</Button>
        <Button variant={kind === 'annulation' ? 'danger' : 'primary'} loading={m.isPending} disabled={reason.trim().length < 5} onClick={() => m.mutate()}>
          {direct ? "Confirmer l'annulation" : 'Envoyer la demande'}</Button></>}>
      <Alert tone="info">Un bon validé n'est jamais modifié : {kind === 'correction' ? "l'original est annulé et un nouveau bon corrigé est créé" : 'il est annulé et la quantité est réintégrée au stock'}{direct ? '.' : ', après approbation par l\'administrateur.'}</Alert>
      {kind === 'correction' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Série départ" hint={`Actuelle : ${refuel.index_start}`}><input className="input" inputMode="decimal" value={changes.index_start} onChange={set('index_start')} /></Field>
          <Field label="Série fin" hint={`Actuelle : ${refuel.index_end}`}><input className="input" inputMode="decimal" value={changes.index_end} onChange={set('index_end')} /></Field>
          <Field label="Compteur" hint={`Actuel : ${refuel.counter_value ?? '—'}`}><input className="input" inputMode="decimal" value={changes.counter_value} onChange={set('counter_value')} /></Field>
          <Field label="Bon papier" hint={`Actuel : ${refuel.paper_voucher_number ?? '—'}`}><input className="input" value={changes.paper_voucher_number} onChange={set('paper_voucher_number')} /></Field>
          <Field label="Remarque" className="col-span-2"><input className="input" value={changes.remark} onChange={set('remark')} /></Field>
        </div>
      )}
      <Field label="Justification (obligatoire)"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
