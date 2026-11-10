import { Droplets, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoPicker, type PhotoItem } from '../components/PhotoPicker'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination } from '../components/ui'
import { WarningList } from '../components/WarningList'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, type Paginated } from '../lib/api'
import { dateTime, litres } from '../lib/format'
import type { Tank } from '../lib/types'
import { uuid } from '../lib/util'

type Delivery = {
  id: number; delivered_at: string; quantity_l: string; supplier: string | null; delivery_note_number: string | null
  delivery_reference: string | null; remark: string | null; status: string; cancel_reason: string | null
  tank: { code: string }; user: { name: string }; attachments_count: number
}

export default function DeliveriesPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [tank, setTank] = useState('')
  const [open, setOpen] = useState(false)
  const [cancel, setCancel] = useState<Delivery | null>(null)
  const tanks = useQuery({ queryKey: ['tanks'], queryFn: () => api.get<Tank[]>('/tanks') })
  const q = useQuery({ queryKey: ['deliveries', page, tank], queryFn: () => api.get<Paginated<Delivery>>('/deliveries', { page, fuel_tank_id: tank }) })
  const canDeliver = user?.role !== 'pompiste' || user?.permissions.deliver

  return (
    <>
      <PageHeader icon={Droplets} title="Entrées de gasoil" sub="Approvisionnements des citernes — le stock augmente à la validation"
        actions={canDeliver && <Button variant="brand" icon={Plus} onClick={() => setOpen(true)}>Nouvelle entrée</Button>} />
      <div className="mb-3 max-w-xs">
        <select className="input" value={tank} onChange={(e) => { setTank(e.target.value); setPage(1) }}>
          <option value="">Toutes les citernes</option>{tanks.data?.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
        </select>
      </div>
      <ErrorBox error={q.error} />
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty icon={Droplets}>Aucune entrée enregistrée.</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th>Date</th><th>Citerne</th><th className="text-right">Quantité</th><th>Fournisseur</th><th>N° BL</th><th>Référence</th><th>Saisi par</th><th>Pièces</th><th>Statut</th><th /></tr></thead>
              <tbody>{q.data.data.map((d) => (
                <tr key={d.id}>
                  <td>{dateTime(d.delivered_at)}</td><td className="font-medium">{d.tank.code}</td>
                  <td className="text-right font-bold tabular-nums text-emerald-600">+{litres(d.quantity_l)}</td>
                  <td>{d.supplier}</td><td>{d.delivery_note_number}</td><td>{d.delivery_reference}</td><td>{d.user.name}</td><td>{d.attachments_count}</td>
                  <td>{d.status === 'annule' ? <Badge color="red">Annulée</Badge> : <Badge color="green">Validée</Badge>}</td>
                  <td>{user?.role === 'admin' && d.status === 'valide' && <Button size="sm" variant="ghost" onClick={() => setCancel(d)}>Annuler</Button>}</td>
                </tr>))}</tbody>
            </table></div>
            <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <DeliveryForm tanks={tanks.data ?? []} onClose={() => setOpen(false)} />}
      {cancel && <CancelDelivery d={cancel} onClose={() => setCancel(null)} />}
    </>
  )
}

function DeliveryForm({ tanks, onClose }: { tanks: Tank[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { tankId } = useAuth()
  const [clientUuid] = useState(uuid())
  const [f, setF] = useState({ fuel_tank_id: String(tankId ?? tanks[0]?.id ?? ''), delivered_at: '', quantity_l: '', supplier: '', delivery_note_number: '', delivery_reference: '', remark: '' })
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [confirmOver, setConfirmOver] = useState(false)
  const m = useMutation({
    mutationFn: () => api.post('/deliveries', {
      ...f, client_uuid: clientUuid, fuel_tank_id: Number(f.fuel_tank_id), delivered_at: f.delivered_at || null,
      attachment_ids: photos.filter((p) => p.id).map((p) => p.id), confirm_over_capacity: confirmOver,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); qc.invalidateQueries({ queryKey: ['tanks'] }); onClose() },
  })
  const err = m.error as ApiError | null
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} icon={Droplets} title="Nouvelle entrée de gasoil"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button loading={m.isPending} disabled={photos.some((p) => p.status === 'envoi')} onClick={() => m.mutate()}>Valider l'entrée</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Citerne" className="col-span-2"><select className="input" value={f.fuel_tank_id} onChange={set('fuel_tank_id')}>{tanks.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.site?.name}</option>)}</select></Field>
        <Field label="Quantité reçue (L)"><input className="input input-lg" inputMode="decimal" value={f.quantity_l} onChange={set('quantity_l')} /></Field>
        <Field label="Date et heure" hint="Vide = maintenant"><input className="input" type="datetime-local" value={f.delivered_at} onChange={set('delivered_at')} /></Field>
        <Field label="Fournisseur"><input className="input" value={f.supplier} onChange={set('supplier')} /></Field>
        <Field label="N° bon de livraison"><input className="input" value={f.delivery_note_number} onChange={set('delivery_note_number')} /></Field>
        <Field label="Référence de livraison"><input className="input" value={f.delivery_reference} onChange={set('delivery_reference')} /></Field>
        <Field label="Remarque"><input className="input" value={f.remark} onChange={set('remark')} /></Field>
      </div>
      <div><p className="label">Pièces justificatives</p><PhotoPicker items={photos} onChange={setPhotos} /></div>
      {err?.requiresConfirmation ? (
        <><WarningList warnings={err.warnings} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} />Je confirme la quantité (une anomalie sera enregistrée)</label></>
      ) : err?.offline ? <Alert tone="warning">Réseau indisponible : réessayer, l'entrée ne sera pas enregistrée deux fois.</Alert> : <ErrorBox error={err} />}
    </Modal>
  )
}

function CancelDelivery({ d, onClose }: { d: Delivery; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const m = useMutation({ mutationFn: () => api.post(`/deliveries/${d.id}/cancel`, { reason }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); onClose() } })
  return (
    <Modal open onClose={onClose} title="Annuler l'entrée" footer={<><Button variant="secondary" onClick={onClose}>Fermer</Button><Button variant="danger" loading={m.isPending} disabled={reason.length < 5} onClick={() => m.mutate()}>Annuler l'entrée</Button></>}>
      <p className="text-sm">{litres(d.quantity_l)} dans {d.tank.code} le {dateTime(d.delivered_at)}. Un mouvement compensatoire sera créé ; refusé si le stock deviendrait négatif.</p>
      <Field label="Motif"><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
