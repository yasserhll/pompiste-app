import { Ruler, Scale } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoPicker, type PhotoItem } from '../components/PhotoPicker'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api, type Paginated } from '../lib/api'
import { dateTime, litres } from '../lib/format'
import type { Tank } from '../lib/types'
import { uuid } from '../lib/util'

type Inventory = {
  id: number; measured_at: string; measured_quantity_l: string; theoretical_quantity_l: string; difference_l: string
  method: string | null; note: string | null; status: string; review_note: string | null
  tank: { code: string }; user: { name: string }; adjustment: { quantity_l: string } | null; attachments_count: number
}
type Adjustment = {
  id: number; quantity_l: string; reason: string; status: string; effective_at: string; review_note: string | null
  tank: { code: string }; requester: { name: string }; fuel_inventory_id: number | null
}
const STATUS = { en_attente: ['amber', 'En attente'], approuve: ['green', 'Approuvé'], rejete: ['red', 'Rejeté'] } as const

export default function InventoriesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const tanks = useQuery({ queryKey: ['tanks'], queryFn: () => api.get<Tank[]>('/tanks') })
  const inv = useQuery({ queryKey: ['inventories'], queryFn: () => api.get<Paginated<Inventory>>('/inventories', { per_page: 100 }) })
  const adj = useQuery({ queryKey: ['adjustments'], queryFn: () => api.get<Paginated<Adjustment>>('/adjustments', { per_page: 100 }) })
  const [form, setForm] = useState<null | 'inventaire' | 'ajustement'>(null)
  const [review, setReview] = useState<{ kind: 'inventories' | 'adjustments'; item: Inventory | Adjustment } | null>(null)

  return (
    <>
      <PageHeader icon={Ruler} title="Inventaires et ajustements" sub="Le stock réel est une mesure physique validée — jamais le stock théorique recopié"
        actions={<><Button variant="brand" icon={Ruler} onClick={() => setForm('inventaire')}>Nouvel inventaire</Button><Button variant="secondary" icon={Scale} onClick={() => setForm('ajustement')}>Demande d'ajustement</Button></>} />
      <div className="space-y-4">
        <Card title="Inventaires physiques" icon={Ruler} padded={false}>
          {inv.isLoading ? <Loading /> : !inv.data?.data.length ? <Empty icon={Ruler}>Aucun inventaire.</Empty> : (
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th>Date de mesure</th><th>Citerne</th><th className="text-right">Mesuré</th><th className="text-right">Théorique</th><th className="text-right">Écart</th><th>Méthode</th><th>Par</th><th>Statut</th><th /></tr></thead>
              <tbody>{inv.data.data.map((i) => (
                <tr key={i.id}>
                  <td>{dateTime(i.measured_at)}</td><td className="font-medium">{i.tank.code}</td>
                  <td className="text-right font-semibold tabular-nums">{litres(i.measured_quantity_l)}</td>
                  <td className="text-right tabular-nums">{litres(i.theoretical_quantity_l)}</td>
                  <td className={`text-right font-semibold tabular-nums ${Number(i.difference_l) ? 'text-amber-700' : ''}`}>{litres(i.difference_l)}</td>
                  <td>{i.method}</td><td>{i.user.name}</td>
                  <td><Badge color={STATUS[i.status as keyof typeof STATUS][0]}>{STATUS[i.status as keyof typeof STATUS][1]}</Badge>{i.adjustment && <span className="ml-1 text-xs text-ink-500">ajusté</span>}</td>
                  <td>{isAdmin && i.status === 'en_attente' && <Button size="sm" variant="secondary" onClick={() => setReview({ kind: 'inventories', item: i })}>Examiner</Button>}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Ajustements de stock" icon={Scale} padded={false}>
          {adj.isLoading ? <Loading /> : !adj.data?.data.length ? <Empty icon={Scale}>Aucun ajustement.</Empty> : (
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th>Date</th><th>Citerne</th><th className="text-right">Quantité</th><th>Motif</th><th>Demandé par</th><th>Statut</th><th /></tr></thead>
              <tbody>{adj.data.data.map((a) => (
                <tr key={a.id}>
                  <td>{dateTime(a.effective_at)}</td><td className="font-medium">{a.tank.code}</td>
                  <td className="text-right font-semibold tabular-nums">{Number(a.quantity_l) > 0 ? '+' : ''}{litres(a.quantity_l)}</td>
                  <td className="max-w-xs truncate whitespace-normal">{a.reason}</td><td>{a.requester.name}</td>
                  <td><Badge color={STATUS[a.status as keyof typeof STATUS][0]}>{STATUS[a.status as keyof typeof STATUS][1]}</Badge></td>
                  <td>{isAdmin && a.status === 'en_attente' && <Button size="sm" variant="secondary" onClick={() => setReview({ kind: 'adjustments', item: a })}>Examiner</Button>}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
      {form && <EntryForm kind={form} tanks={tanks.data ?? []} onClose={() => setForm(null)} />}
      {review && <ReviewModal {...review} onClose={() => setReview(null)} />}
    </>
  )
}

function EntryForm({ kind, tanks, onClose }: { kind: 'inventaire' | 'ajustement'; tanks: Tank[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { tankId } = useAuth()
  const [clientUuid] = useState(uuid())
  const [f, setF] = useState({ fuel_tank_id: String(tankId ?? tanks[0]?.id ?? ''), measured_at: '', quantity: '', method: 'jauge', text: '' })
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const m = useMutation({
    mutationFn: () => kind === 'inventaire'
      ? api.post('/inventories', { client_uuid: clientUuid, fuel_tank_id: Number(f.fuel_tank_id), measured_at: f.measured_at || null,
        measured_quantity_l: f.quantity, method: f.method, note: f.text || null, attachment_ids: photos.filter((p) => p.id).map((p) => p.id) })
      : api.post('/adjustments', { fuel_tank_id: Number(f.fuel_tank_id), quantity_l: f.quantity, reason: f.text, attachment_ids: photos.filter((p) => p.id).map((p) => p.id) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventories'] }); qc.invalidateQueries({ queryKey: ['adjustments'] }); onClose() },
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title={kind === 'inventaire' ? 'Inventaire physique' : "Demande d'ajustement"}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Enregistrer</Button></>}>
      <Field label="Citerne"><select className="input" value={f.fuel_tank_id} onChange={set('fuel_tank_id')}>{tanks.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}</select></Field>
      {kind === 'inventaire' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité mesurée (L)"><input className="input input-lg" inputMode="decimal" value={f.quantity} onChange={set('quantity')} /></Field>
          <Field label="Méthode"><select className="input" value={f.method} onChange={set('method')}><option value="jauge">Jauge</option><option value="pige">Pige</option><option value="compteur">Compteur</option><option value="autre">Autre</option></select></Field>
          <Field label="Date de mesure" hint="Vide = maintenant"><input className="input" type="datetime-local" value={f.measured_at} onChange={set('measured_at')} /></Field>
          <Field label="Note"><input className="input" value={f.text} onChange={set('text')} /></Field>
        </div>
      ) : (
        <>
          <Alert tone="info">Quantité signée : positive pour ajouter au stock, négative pour retirer. Appliqué seulement après approbation.</Alert>
          <Field label="Quantité (L)"><input className="input input-lg" inputMode="decimal" value={f.quantity} onChange={set('quantity')} placeholder="-20" /></Field>
          <Field label="Motif (obligatoire)"><textarea className="input" rows={2} value={f.text} onChange={set('text')} /></Field>
        </>
      )}
      <div><p className="label">Justificatifs</p><PhotoPicker items={photos} onChange={setPhotos} /></div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function ReviewModal({ kind, item, onClose }: { kind: 'inventories' | 'adjustments'; item: Inventory | Adjustment; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [adjust, setAdjust] = useState(true)
  const [allowNeg, setAllowNeg] = useState(false)
  const m = useMutation({
    mutationFn: (approve: boolean) => api.post(`/${kind}/${item.id}/review`, kind === 'inventories'
      ? { approve, note: note || null, create_adjustment: adjust } : { approve, note: note || null, allow_negative: allowNeg }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [kind] }); qc.invalidateQueries({ queryKey: ['adjustments'] }); qc.invalidateQueries({ queryKey: ['tanks'] }); onClose() },
  })
  const inv = kind === 'inventories' ? (item as Inventory) : null
  return (
    <Modal open onClose={onClose} title={inv ? `Inventaire ${inv.tank.code}` : `Ajustement ${(item as Adjustment).tank.code}`}
      footer={<><Button variant="danger" loading={m.isPending} onClick={() => m.mutate(false)}>Rejeter</Button><Button loading={m.isPending} onClick={() => m.mutate(true)}>Approuver</Button></>}>
      {inv ? (
        <>
          <p className="text-sm">Mesuré {litres(inv.measured_quantity_l)} · théorique {litres(inv.theoretical_quantity_l)} · écart <b>{litres(inv.difference_l)}</b></p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
            Passer l'écart en ajustement de stock (le stock théorique devient la mesure)</label>
        </>
      ) : (
        <>
          <p className="text-sm">{litres((item as Adjustment).quantity_l)} — {(item as Adjustment).reason}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={allowNeg} onChange={(e) => setAllowNeg(e.target.checked)} />
            Autoriser exceptionnellement un stock négatif (justification obligatoire)</label>
        </>
      )}
      <Field label="Note de décision"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
