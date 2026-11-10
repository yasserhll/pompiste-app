import { CheckCircle2, Clock, Cog, Save, ScrollText, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Tabs } from '../components/ui'
import { api, type Paginated } from '../lib/api'
import { dateTime, ROLE_LABEL } from '../lib/format'
import type { Role, Site, Tank } from '../lib/types'

type Tab = 'regles' | 'shifts' | 'utilisateurs' | 'audit'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('regles')
  const tabs: [Tab, string][] = [['regles', 'Règles de contrôle'], ['shifts', 'Horaires des shifts'], ['utilisateurs', 'Utilisateurs'], ['audit', "Journal d'audit"]]
  return (
    <>
      <PageHeader icon={Cog} title="Paramètres du module" sub="Règles appliquées par le serveur, horaires, comptes et traçabilité" />
      <Tabs value={tab} onChange={setTab} items={tabs.map(([k, l]) => ({ value: k, label: l, icon: { regles: ShieldCheck, shifts: Clock, utilisateurs: UsersIcon, audit: ScrollText }[k] }))} />
      {tab === 'regles' && <Rules />}
      {tab === 'shifts' && <Shifts />}
      {tab === 'utilisateurs' && <Users />}
      {tab === 'audit' && <Audit />}
    </>
  )
}

const RULES: { key: string; label: string; hint?: string; type: 'number' | 'bool' }[] = [
  { key: 'report_month_start_day', label: 'Début du mois de rapport (jour)', hint: '27 = du 27 au 26 ; 1 = mois calendaire', type: 'number' },
  { key: 'low_stock_threshold_l', label: 'Seuil de stock faible par défaut (L)', type: 'number' },
  { key: 'declared_quantity_tolerance_l', label: 'Tolérance quantité annoncée / calculée (L)', type: 'number' },
  { key: 'max_refuel_l', label: 'Quantité max. sans capacité de réservoir connue (L)', type: 'number' },
  { key: 'tank_capacity_margin_pct', label: 'Marge au-delà de la capacité du réservoir (%)', type: 'number' },
  { key: 'duplicate_window_minutes', label: 'Délai de doublon probable (minutes)', type: 'number' },
  { key: 'max_counter_jump_h', label: 'Saut de compteur anormal (heures)', type: 'number' },
  { key: 'max_counter_jump_km', label: 'Saut de compteur anormal (km)', type: 'number' },
  { key: 'require_photo', label: 'Photo du bon obligatoire', type: 'bool' },
  { key: 'pompiste_can_view_stock', label: 'Les pompistes voient le stock de leur citerne', type: 'bool' },
  { key: 'pompiste_can_record_delivery', label: 'Les pompistes peuvent saisir les entrées de gasoil', type: 'bool' },
]

function Rules() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/settings') })
  const [v, setV] = useState<Record<string, unknown>>({})
  useEffect(() => { if (q.data) setV(q.data) }, [q.data])
  const m = useMutation({
    mutationFn: () => api.put('/settings', Object.fromEntries(RULES.map((r) => [r.key, r.type === 'bool' ? !!v[r.key] : Number(v[r.key])]))),
    onSuccess: (d) => { qc.setQueryData(['settings'], d) },
  })
  if (q.isLoading) return <Loading />
  return (
    <Card title="Règles appliquées par le serveur" icon={ShieldCheck}>
      <div className="grid gap-4 sm:grid-cols-2">
        {RULES.map((r) => r.type === 'bool' ? (
          <label key={r.key} className="flex items-center gap-3 rounded-lg border border-ink-100 p-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!v[r.key]} onChange={(e) => setV({ ...v, [r.key]: e.target.checked })} />{r.label}
          </label>
        ) : (
          <Field key={r.key} label={r.label} hint={r.hint}><input className="input" type="number" min={0} value={String(v[r.key] ?? '')} onChange={(e) => setV({ ...v, [r.key]: e.target.value })} /></Field>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button icon={Save} loading={m.isPending} onClick={() => m.mutate()}>Enregistrer</Button>
        {m.isSuccess && <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} />Enregistré</span>}
      </div>
      <div className="mt-3"><ErrorBox error={m.error} /></div>
    </Card>
  )
}

type Shift = { id: number; site_id: number | null; site?: Site | null; code: string; name: string; team_slot: number; start_time: string; end_time: string; is_active: boolean }

function Shifts() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['shifts'], queryFn: () => api.get<Shift[]>('/shifts') })
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const [edit, setEdit] = useState<Partial<Shift> | null>(null)
  const m = useMutation({
    mutationFn: () => {
      const body = { site_id: edit!.site_id ?? null, code: edit!.code, name: edit!.name, team_slot: edit!.team_slot,
        start_time: edit!.start_time?.slice(0, 5), end_time: edit!.end_time?.slice(0, 5), is_active: edit!.is_active ?? true }
      return edit!.id ? api.put(`/shifts/${edit!.id}`, body) : api.post('/shifts', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); setEdit(null) },
  })
  return (
    <>
      <Alert tone="warning">Les horaires 07:00–19:00 / 19:00–07:00 sont des valeurs de départ : les remplacer par les horaires réels. Un shift dont la fin précède le début traverse minuit (les heures après minuit comptent pour la journée de la veille). Des horaires propres à un site remplacent ceux par défaut pour ce site.</Alert>
      <Card className="mt-3" title="Shifts" actions={<Button size="sm" onClick={() => setEdit({ team_slot: 1, start_time: '07:00', end_time: '19:00', is_active: true })}>Ajouter</Button>} padded={false}>
        {q.isLoading ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table-base">
            <thead><tr><th>Site</th><th>Nom</th><th>Code</th><th>Équipe</th><th>Début</th><th>Fin</th><th>Statut</th><th /></tr></thead>
            <tbody>{q.data?.map((s) => (
              <tr key={s.id}><td>{s.site?.name ?? 'Tous (défaut)'}</td><td className="font-medium">{s.name}</td><td>{s.code}</td><td>{s.team_slot}</td>
                <td>{s.start_time.slice(0, 5)}</td><td>{s.end_time.slice(0, 5)}{s.end_time <= s.start_time && <span className="ml-1 text-xs text-ink-500">(lendemain)</span>}</td>
                <td>{s.is_active ? <Badge color="green">Actif</Badge> : <Badge>Inactif</Badge>}</td>
                <td><Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Modifier</Button></td></tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Modifier le shift' : 'Nouveau shift'} footer={<Button loading={m.isPending} onClick={() => m.mutate()}>Enregistrer</Button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Site"><select className="input" value={edit.site_id ?? ''} onChange={(e) => setEdit({ ...edit, site_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Tous (défaut)</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Équipe (colonne de l'affectation)"><select className="input" value={edit.team_slot} onChange={(e) => setEdit({ ...edit, team_slot: Number(e.target.value) })}><option value={1}>Équipe 1</option><option value={2}>Équipe 2</option><option value={3}>Équipe 3</option></select></Field>
            <Field label="Nom"><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Code"><input className="input" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="matin" /></Field>
            <Field label="Début"><input type="time" className="input" value={edit.start_time?.slice(0, 5) ?? ''} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} /></Field>
            <Field label="Fin"><input type="time" className="input" value={edit.end_time?.slice(0, 5) ?? ''} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Actif</label>
          <ErrorBox error={m.error} />
        </Modal>
      )}
    </>
  )
}

type U = { id: number; name: string; email: string; role: Role; is_active: boolean; sites: Site[]; fuel_tanks: { id: number; code: string }[] }

function Users() {
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<U[]>('/users') })
  const [edit, setEdit] = useState<U | 'new' | null>(null)
  return (
    <>
      <Card title="Comptes" actions={<Button size="sm" onClick={() => setEdit('new')}>Nouveau compte</Button>} padded={false}>
        {q.isLoading ? <Loading /> : !q.data?.length ? <Empty>Aucun compte.</Empty> : (
          <div className="overflow-x-auto"><table className="table-base">
            <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Périmètre</th><th>Statut</th><th /></tr></thead>
            <tbody>{q.data.map((u) => (
              <tr key={u.id}><td className="font-medium">{u.name}</td><td>{u.email}</td><td>{ROLE_LABEL[u.role]}</td>
                <td className="text-xs">{u.role === 'admin' ? 'Tout' : u.role === 'responsable_site' ? u.sites.map((s) => s.name).join(', ') || '—' : u.fuel_tanks.map((t) => t.code).join(', ') || '—'}</td>
                <td>{u.is_active ? <Badge color="green">Actif</Badge> : <Badge color="red">Désactivé</Badge>}</td>
                <td><Button size="sm" variant="ghost" onClick={() => setEdit(u)}>Modifier</Button></td></tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {edit && <UserForm u={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function UserForm({ u, onClose }: { u: U | null; onClose: () => void }) {
  const qc = useQueryClient()
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const tanks = useQuery({ queryKey: ['tanks', 'all'], queryFn: () => api.get<Tank[]>('/tanks', { include_inactive: 1 }) })
  const [f, setF] = useState({ name: u?.name ?? '', email: u?.email ?? '', password: '', role: u?.role ?? 'pompiste' as Role, is_active: u?.is_active ?? true,
    site_ids: u?.sites.map((s) => s.id) ?? [], tank_ids: u?.fuel_tanks.map((t) => t.id) ?? [] })
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { ...f }
      if (!f.password) delete body.password
      return u ? api.put(`/users/${u.id}`, body) : api.post('/users', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
  })
  const toggle = (k: 'site_ids' | 'tank_ids', id: number) => setF((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((i) => i !== id) : [...x[k], id] }))
  return (
    <Modal open onClose={onClose} title={u ? `Compte ${u.name}` : 'Nouveau compte'} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={u ? 'Nouveau mot de passe' : 'Mot de passe'} hint="8 caractères minimum"><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Rôle"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      {f.role === 'responsable_site' && (
        <Field label="Sites autorisés"><div className="flex flex-wrap gap-2">{sites.data?.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-2 py-1 text-sm"><input type="checkbox" checked={f.site_ids.includes(s.id)} onChange={() => toggle('site_ids', s.id)} />{s.name}</label>))}</div></Field>
      )}
      {f.role === 'pompiste' && (
        <Field label="Citernes autorisées">{tanks.data?.length ? <div className="flex flex-wrap gap-2">{tanks.data.map((t) => (
          <label key={t.id} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-2 py-1 text-sm"><input type="checkbox" checked={f.tank_ids.includes(t.id)} onChange={() => toggle('tank_ids', t.id)} />{t.code}</label>))}</div>
          : <p className="text-sm text-ink-500">Aucune citerne créée.</p>}</Field>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Compte actif</label>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

type Log = { id: number; action: string; created_at: string; user?: { name: string }; auditable_type: string | null; auditable_id: number | null; new_values: unknown; ip: string | null }

function Audit() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const q = useQuery({ queryKey: ['audit', page, action], queryFn: () => api.get<Paginated<Log>>('/audit-logs', { page, action }), placeholderData: keepPreviousData })
  return (
    <Card title="Journal des actions sensibles" padded={false}>
      <div className="p-3"><input className="input max-w-xs py-2" placeholder="Filtrer : ravitaillement, qr, citerne…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} /></div>
      {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty>Aucune entrée.</Empty> : (
        <>
          <div className="overflow-x-auto"><table className="table-base">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Détail</th><th>IP</th></tr></thead>
            <tbody>{q.data.data.map((l) => (
              <tr key={l.id}><td>{dateTime(l.created_at)}</td><td>{l.user?.name ?? '—'}</td><td className="font-medium">{l.action}</td>
                <td className="text-xs">{l.auditable_type?.split('\\').pop()} {l.auditable_id}</td>
                <td className="max-w-md truncate text-xs text-ink-500" title={JSON.stringify(l.new_values)}>{l.new_values ? JSON.stringify(l.new_values) : ''}</td><td className="text-xs">{l.ip}</td></tr>))}</tbody>
          </table></div>
          <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </Card>
  )
}
