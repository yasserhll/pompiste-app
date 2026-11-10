import { Ban, Eye, Printer, QrCode, RefreshCw, Sparkles } from 'lucide-react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination } from '../components/ui'
import { api, blobUrl, download, type Paginated } from '../lib/api'
import { CATEGORY_LABEL } from '../lib/format'
import type { Site, VehicleCard } from '../lib/types'

type V = VehicleCard & { has_active_qr: boolean }

export default function QrCodesPage() {
  const qc = useQueryClient()
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const [f, setF] = useState({ search: '', site_id: '', category: '' })
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<number[]>([])
  const [show, setShow] = useState<V | null>(null)
  const [action, setAction] = useState<{ v: V; kind: 'regenerate' | 'revoke' } | null>(null)
  const q = useQuery({ queryKey: ['qr-vehicles', f, page], queryFn: () => api.get<Paginated<V>>('/vehicles', { ...f, page, per_page: 100 }), placeholderData: keepPreviousData })

  const gen = useMutation({
    mutationFn: (ids?: number[]) => api.post<{ generated: number }>('/qr-codes/generate', { vehicle_ids: ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qr-vehicles'] }),
  })
  const pdf = useMutation({ mutationFn: (body: { vehicle_ids?: number[]; site_id?: number }) => download('/qr-codes/labels', undefined, 'POST', body) })

  const rows = q.data?.data ?? []
  const allSel = rows.length > 0 && rows.every((r) => sel.includes(r.id))
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <>
      <PageHeader icon={QrCode} title="QR codes du parc" sub="Un QR permanent par véhicule — il ne contient qu'un jeton aléatoire, aucune donnée du véhicule"
        actions={<>
          <Button variant="brand" icon={Sparkles} loading={gen.isPending} onClick={() => gen.mutate(undefined)}>Générer pour tout le parc</Button>
          <Button variant="secondary" icon={Printer} loading={pdf.isPending} onClick={() => pdf.mutate(f.site_id ? { site_id: Number(f.site_id) } : {})}>
            Imprimer {f.site_id ? 'le site' : 'tout le parc'} (PDF)</Button>
        </>} />
      {gen.data && <div className="mb-3"><Alert tone="success">{gen.data.generated} QR code(s) généré(s). Les QR existants n'ont pas été modifiés.</Alert></div>}
      <ErrorBox error={gen.error || pdf.error} />
      <div className="card mb-3 flex flex-wrap gap-3 p-3">
        <input className="input max-w-xs py-2" placeholder="Code de parc, immatriculation…" value={f.search} onChange={(e) => { setF({ ...f, search: e.target.value }); setPage(1) }} />
        <select className="input max-w-[12rem] py-2" value={f.site_id} onChange={(e) => { setF({ ...f, site_id: e.target.value }); setPage(1) }}>
          <option value="">Tous les sites</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input max-w-[12rem] py-2" value={f.category} onChange={(e) => { setF({ ...f, category: e.target.value }); setPage(1) }}>
          <option value="">Tous types</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {sel.length > 0 && <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => gen.mutate(sel)}>Générer ({sel.length})</Button>
          <Button size="sm" onClick={() => pdf.mutate({ vehicle_ids: sel })}>Imprimer la sélection ({sel.length})</Button>
        </div>}
      </div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !rows.length ? <Empty icon={QrCode}>Aucun véhicule. Importer le parc depuis le fichier d'affectation.</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? [] : rows.map((r) => r.id))} /></th>
                <th>Code parc</th><th>Immatriculation</th><th>Type</th><th>Site</th><th>QR</th><th /></tr></thead>
              <tbody>{rows.map((v) => (
                <tr key={v.id}>
                  <td><input type="checkbox" checked={sel.includes(v.id)} onChange={() => toggle(v.id)} /></td>
                  <td className="font-semibold">{v.code_parc}</td><td>{v.immatriculation}</td><td>{v.type_label}</td><td>{v.site?.name}</td>
                  <td>{v.has_active_qr ? <Badge color="green">Actif</Badge> : <Badge>Aucun</Badge>}</td>
                  <td className="space-x-1 text-right">
                    {v.has_active_qr ? <>
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => setShow(v)}>Voir</Button>
                      <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setAction({ v, kind: 'regenerate' })}>Remplacer</Button>
                      <Button size="sm" variant="ghost" icon={Ban} onClick={() => setAction({ v, kind: 'revoke' })}>Désactiver</Button>
                    </> : <Button size="sm" variant="secondary" onClick={() => gen.mutate([v.id])}>Générer</Button>}
                  </td>
                </tr>))}</tbody>
            </table></div>
            <Pagination page={q.data!.current_page} last={q.data!.last_page} total={q.data!.total} onChange={setPage} />
          </>
        )}
      </Card>
      {show && <QrPreview v={show} onClose={() => setShow(null)} />}
      {action && <QrAction {...action} onClose={() => setAction(null)} />}
    </>
  )
}

function QrPreview({ v, onClose }: { v: V; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    blobUrl(`/qr-codes/${v.id}/png`).then((x) => { u = x; setUrl(x) }).catch(() => {})
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [v.id])
  return (
    <Modal open onClose={onClose} title={`QR ${v.code_parc}`} footer={<Button onClick={() => download('/qr-codes/labels', undefined, 'POST', { vehicle_ids: [v.id] })}>Étiquette PDF</Button>}>
      <div className="flex flex-col items-center gap-2">
        {url ? <img src={url} alt={`QR ${v.code_parc}`} className="h-64 w-64" /> : <Loading />}
        <p className="text-3xl font-bold">{v.code_parc}</p><p className="text-sm text-ink-500">{v.immatriculation}</p>
      </div>
    </Modal>
  )
}

function QrAction({ v, kind, onClose }: { v: V; kind: 'regenerate' | 'revoke'; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const m = useMutation({ mutationFn: () => api.post(`/qr-codes/${v.id}/${kind}`, { reason }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['qr-vehicles'] }); onClose() } })
  return (
    <Modal open onClose={onClose} title={`${kind === 'regenerate' ? 'Remplacer' : 'Désactiver'} le QR de ${v.code_parc}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button variant="danger" loading={m.isPending} disabled={reason.length < 3} onClick={() => m.mutate()}>Confirmer</Button></>}>
      <Alert tone="warning">L'étiquette actuelle ne fonctionnera plus.{kind === 'regenerate' && ' Une nouvelle étiquette devra être imprimée et collée.'}</Alert>
      <Field label="Motif"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Étiquette abîmée, perdue…" /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
