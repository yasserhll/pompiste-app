import { CalendarClock, MapPin, Plus, Truck, Users } from 'lucide-react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Tabs } from '../components/ui'
import { api, type Paginated } from '../lib/api'
import { CATEGORY_LABEL, date, STATUS_LABEL, todayISO } from '../lib/format'
import type { Site, VehicleCard } from '../lib/types'

type Tab = 'vehicules' | 'conducteurs' | 'affectations' | 'sites'

export default function ReferencePage() {
  const [tab, setTab] = useState<Tab>('vehicules')
  const tabs: [Tab, string][] = [['vehicules', 'Véhicules'], ['conducteurs', 'Conducteurs'], ['affectations', 'Affectations'], ['sites', 'Sites']]
  return (
    <>
      <PageHeader icon={Truck} title="Parc et conducteurs" sub="Référentiel utilisé pour le scan et l'affectation automatique" />
      <Tabs value={tab} onChange={setTab} items={tabs.map(([k, l]) => ({ value: k, label: l, icon: { vehicules: Truck, conducteurs: Users, affectations: CalendarClock, sites: MapPin }[k] }))} />
      {tab === 'vehicules' && <Vehicles />}
      {tab === 'conducteurs' && <Drivers />}
      {tab === 'affectations' && <Assignments />}
      {tab === 'sites' && <Sites />}
    </>
  )
}

function Vehicles() {
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const [f, setF] = useState({ search: '', site_id: '', category: '', status: '' })
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<VehicleCard | 'new' | null>(null)
  const q = useQuery({ queryKey: ['vehicles', f, page], queryFn: () => api.get<Paginated<VehicleCard>>('/vehicles', { ...f, page, per_page: 50 }), placeholderData: keepPreviousData })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1) }
  return (
    <>
      <div className="card mb-3 flex flex-wrap gap-3 p-3">
        <input className="input max-w-xs py-2" placeholder="Code, immatriculation, châssis" value={f.search} onChange={set('search')} />
        <select className="input max-w-[11rem] py-2" value={f.site_id} onChange={set('site_id')}><option value="">Tous les sites</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input max-w-[11rem] py-2" value={f.category} onChange={set('category')}><option value="">Toutes catégories</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input max-w-[11rem] py-2" value={f.status} onChange={set('status')}><option value="">Tous statuts</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Button className="ml-auto" icon={Plus} onClick={() => setEdit('new')}>Ajouter un véhicule</Button>
      </div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty>Aucun véhicule.</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th>Code parc</th><th>Immatriculation</th><th>Type</th><th>Catégorie</th><th>Compteur</th><th>Réservoir</th><th>Site</th><th>Statut</th><th /></tr></thead>
              <tbody>{q.data.data.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold text-ink-900">{v.code_parc}</td><td>{v.immatriculation}</td><td>{v.type_label}</td><td>{CATEGORY_LABEL[v.category]}</td>
                  <td>{v.counter_unit === 'h' ? 'Heures' : 'Km'}</td><td>{v.tank_capacity_l ? `${Number(v.tank_capacity_l)} L` : '—'}</td><td>{v.site?.name}</td>
                  <td><Badge color={v.status === 'actif' ? 'green' : v.status === 'en_panne' ? 'amber' : 'red'}>{STATUS_LABEL[v.status]}</Badge></td>
                  <td><Button size="sm" variant="ghost" onClick={() => setEdit(v)}>Modifier</Button></td>
                </tr>))}</tbody>
            </table></div>
            <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {edit && <VehicleForm v={edit === 'new' ? null : edit} sites={sites.data ?? []} onClose={() => setEdit(null)} />}
    </>
  )
}

function VehicleForm({ v, sites, onClose }: { v: VehicleCard | null; sites: Site[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    code_parc: v?.code_parc ?? '', immatriculation: v?.immatriculation ?? '', chassis: v?.chassis ?? '', type_label: v?.type_label ?? '',
    site_id: v?.site?.id ? String(v.site.id) : '', category: v?.category ?? 'camion', counter_unit: v?.counter_unit ?? 'km',
    tank_capacity_l: v?.tank_capacity_l ? String(Number(v.tank_capacity_l)) : '', status: v?.status ?? 'actif', status_note: v?.status_note ?? '',
  })
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, site_id: f.site_id ? Number(f.site_id) : null, tank_capacity_l: f.tank_capacity_l || null, chassis: f.chassis || null, status_note: f.status_note || null }
      return v ? api.put(`/vehicles/${v.id}`, body) : api.post('/vehicles', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); onClose() },
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title={v ? `Véhicule ${v.code_parc}` : 'Nouveau véhicule'} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code de parc"><input className="input" value={f.code_parc} onChange={set('code_parc')} /></Field>
        <Field label="Immatriculation"><input className="input" value={f.immatriculation} onChange={set('immatriculation')} /></Field>
        <Field label="N° de châssis"><input className="input" value={f.chassis} onChange={set('chassis')} /></Field>
        <Field label="Type"><input className="input" value={f.type_label} onChange={set('type_label')} /></Field>
        <Field label="Site"><select className="input" value={f.site_id} onChange={set('site_id')}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Catégorie"><select className="input" value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Compteur"><select className="input" value={f.counter_unit} onChange={set('counter_unit')}><option value="km">Kilomètres</option><option value="h">Heures moteur</option></select></Field>
        <Field label="Capacité réservoir (L)" hint="Pour détecter les quantités anormales"><input className="input" inputMode="decimal" value={f.tank_capacity_l} onChange={set('tank_capacity_l')} /></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={set('status')}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Note de statut"><input className="input" value={f.status_note} onChange={set('status_note')} /></Field>
      </div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

type Driver = { id: number; name: string; matricule: string | null; phone: string | null }

function Drivers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const q = useQuery({ queryKey: ['drivers', search], queryFn: () => api.get<Driver[]>('/drivers', { search }) })
  const [f, setF] = useState({ name: '', matricule: '', phone: '' })
  const m = useMutation({ mutationFn: () => api.post('/drivers', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setF({ name: '', matricule: '', phone: '' }) } })
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Conducteurs" className="lg:col-span-2" padded={false}>
        <div className="p-3"><input className="input max-w-xs py-2" placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty>Aucun conducteur enregistré. La liste des conducteurs par camion reste à importer.</Empty> : (
          <div className="overflow-x-auto"><table className="table-base"><thead><tr><th>Nom</th><th>Matricule</th><th>Téléphone</th></tr></thead>
            <tbody>{q.data.map((d) => <tr key={d.id}><td className="font-medium">{d.name}</td><td>{d.matricule ?? '—'}</td><td>{d.phone ?? '—'}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      <Card title="Ajouter un conducteur">
        <div className="space-y-3">
          <Field label="Nom complet"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Matricule"><input className="input" value={f.matricule} onChange={(e) => setF({ ...f, matricule: e.target.value })} /></Field>
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <ErrorBox error={m.error} />
          <Button loading={m.isPending} disabled={!f.name.trim()} onClick={() => m.mutate()}>Ajouter</Button>
        </div>
      </Card>
    </div>
  )
}

type Assignment = { id: number; team_slot: number; starts_on: string; ends_on: string | null; is_replacement: boolean; vehicle: { id: number; code_parc: string }; driver: { id: number; name: string }; site: Site | null }

function Assignments() {
  const qc = useQueryClient()
  const [activeOn, setActiveOn] = useState(todayISO())
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['assignments', activeOn, page], queryFn: () => api.get<Paginated<Assignment>>('/assignments', { active_on: activeOn, page, per_page: 100 }) })
  const [open, setOpen] = useState(false)
  const end = useMutation({ mutationFn: (a: Assignment) => api.post(`/assignments/${a.id}/end`, { ends_on: todayISO() }), onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }) })
  return (
    <>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label="En vigueur le"><input type="date" className="input py-2" value={activeOn} onChange={(e) => { setActiveOn(e.target.value); setPage(1) }} /></Field>
        <Button className="ml-auto" icon={Plus} onClick={() => setOpen(true)}>Nouvelle affectation</Button>
      </div>
      <Alert tone="info">Équipe 1 = shift du matin, équipe 2 = shift du soir (selon les horaires des Paramètres). Une affectation n'est jamais supprimée : elle est clôturée, et les anciens bons conservent le conducteur du moment.</Alert>
      <ErrorBox error={end.error} />
      <Card className="mt-3" padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty>Aucune affectation en vigueur à cette date.</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="table-base">
              <thead><tr><th>Véhicule</th><th>Équipe</th><th>Conducteur</th><th>Du</th><th>Au</th><th>Site</th><th /></tr></thead>
              <tbody>{q.data.data.map((a) => (
                <tr key={a.id}>
                  <td className="font-semibold">{a.vehicle.code_parc}</td><td>{a.team_slot}{a.is_replacement && <Badge color="amber">remplaçant</Badge>}</td>
                  <td>{a.driver.name}</td><td>{date(a.starts_on)}</td><td>{a.ends_on ? date(a.ends_on) : 'En cours'}</td><td>{a.site?.name ?? '—'}</td>
                  <td>{!a.ends_on && <Button size="sm" variant="ghost" onClick={() => end.mutate(a)}>Clôturer aujourd'hui</Button>}</td>
                </tr>))}</tbody>
            </table></div>
            <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <AssignmentForm onClose={() => setOpen(false)} />}
    </>
  )
}

function AssignmentForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [vq, setVq] = useState('')
  const [dq, setDq] = useState('')
  const vehicles = useQuery({ queryKey: ['vehicles-pick', vq], queryFn: () => api.get<Paginated<VehicleCard>>('/vehicles', { search: vq, per_page: 10 }), enabled: vq.length > 0 })
  const drivers = useQuery({ queryKey: ['drivers', dq], queryFn: () => api.get<Driver[]>('/drivers', { search: dq }), enabled: dq.length > 1 })
  const [f, setF] = useState({ vehicle: null as VehicleCard | null, driver: null as Driver | null, team_slot: '1', starts_on: todayISO(), ends_on: '', is_replacement: false, close_previous: true })
  const m = useMutation({
    mutationFn: () => api.post('/assignments', {
      vehicle_id: f.vehicle!.id, driver_id: f.driver!.id, team_slot: Number(f.team_slot), site_id: f.vehicle!.site?.id ?? null,
      starts_on: f.starts_on, ends_on: f.ends_on || null, is_replacement: f.is_replacement, close_previous: f.close_previous,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assignments'] }); onClose() },
  })
  return (
    <Modal open onClose={onClose} title="Nouvelle affectation" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} disabled={!f.vehicle || !f.driver} onClick={() => m.mutate()}>Enregistrer</Button></>}>
      <Field label="Véhicule">
        {f.vehicle ? <p className="flex justify-between rounded-lg bg-ink-50 px-3 py-2"><b>{f.vehicle.code_parc}</b><button className="text-sm text-brand-700" onClick={() => setF({ ...f, vehicle: null })}>changer</button></p> : <>
          <input className="input" placeholder="Code de parc" value={vq} onChange={(e) => setVq(e.target.value)} />
          <ul className="mt-1 max-h-36 overflow-y-auto text-sm">{vehicles.data?.data.map((v) => <li key={v.id}><button className="w-full px-2 py-1 text-left hover:bg-ink-50" onClick={() => setF({ ...f, vehicle: v })}>{v.code_parc} <span className="text-ink-500">{v.immatriculation} · {v.site?.name}</span></button></li>)}</ul></>}
      </Field>
      <Field label="Conducteur">
        {f.driver ? <p className="flex justify-between rounded-lg bg-ink-50 px-3 py-2"><b>{f.driver.name}</b><button className="text-sm text-brand-700" onClick={() => setF({ ...f, driver: null })}>changer</button></p> : <>
          <input className="input" placeholder="Nom" value={dq} onChange={(e) => setDq(e.target.value)} />
          <ul className="mt-1 max-h-36 overflow-y-auto text-sm">{drivers.data?.map((d) => <li key={d.id}><button className="w-full px-2 py-1 text-left hover:bg-ink-50" onClick={() => setF({ ...f, driver: d })}>{d.name}</button></li>)}</ul></>}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Équipe"><select className="input" value={f.team_slot} onChange={(e) => setF({ ...f, team_slot: e.target.value })}><option value="1">1 (matin)</option><option value="2">2 (soir)</option></select></Field>
        <Field label="Du"><input type="date" className="input" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
        <Field label="Au (facultatif)"><input type="date" className="input" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.is_replacement} onChange={(e) => setF({ ...f, is_replacement: e.target.checked })} />Remplaçant temporaire (prioritaire sur le titulaire)</label>
      {!f.is_replacement && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.close_previous} onChange={(e) => setF({ ...f, close_previous: e.target.checked })} />Clôturer l'affectation précédente de cette équipe</label>}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function Sites() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const [f, setF] = useState({ code: '', name: '' })
  const m = useMutation({ mutationFn: () => api.post('/sites', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); setF({ code: '', name: '' }) } })
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Sites / chantiers" className="lg:col-span-2" padded={false}>
        {q.isLoading ? <Loading /> : <ul className="divide-y divide-ink-100">{q.data?.map((s) => <li key={s.id} className="flex justify-between px-4 py-2.5"><span className="font-medium">{s.name}</span><span className="text-sm text-ink-500">{s.code}</span></li>)}</ul>}
      </Card>
      <Card title="Ajouter un site">
        <div className="space-y-3">
          <Field label="Code"><input className="input uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <ErrorBox error={m.error} />
          <Button loading={m.isPending} disabled={!f.code || !f.name} onClick={() => m.mutate()}>Ajouter</Button>
        </div>
      </Card>
    </div>
  )
}
