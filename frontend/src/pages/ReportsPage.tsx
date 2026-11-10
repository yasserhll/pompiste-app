import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, ErrorBox, Field, PageHeader } from '../components/ui'
import { api, download, type Paginated } from '../lib/api'
import { todayISO } from '../lib/format'
import type { Site, Tank, VehicleCard } from '../lib/types'

export default function ReportsPage() {
  const tanks = useQuery({ queryKey: ['tanks'], queryFn: () => api.get<Tank[]>('/tanks') })
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites') })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/settings') })
  const today = todayISO()
  const [f, setF] = useState({
    scope: 'citerne', fuel_tank_id: '', site_id: '', vehicle_id: '', period: 'mois',
    date: today, month: today.slice(0, 7), from: `${today.slice(0, 8)}01`, to: today, month_start_day: '',
  })
  const [vehicleQ, setVehicleQ] = useState('')
  const [vehicles, setVehicles] = useState<VehicleCard[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (f.scope !== 'vehicule' || vehicleQ.length < 1) return
    const t = setTimeout(() => api.get<Paginated<VehicleCard>>('/vehicles', { search: vehicleQ, per_page: 15 }).then((r) => setVehicles(r.data)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [vehicleQ, f.scope])

  const startDay = f.month_start_day || String(settings.data?.report_month_start_day ?? 27)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const base: Record<string, string> = { scope: f.scope, period: f.period }
      if (f.scope === 'citerne') base.fuel_tank_id = f.fuel_tank_id || String(tanks.data?.[0]?.id ?? '')
      if (f.scope === 'site') base.site_id = f.site_id || String(sites.data?.[0]?.id ?? '')
      if (f.scope === 'vehicule') base.vehicle_id = f.vehicle_id
      if (f.period === 'jour' || f.period === 'semaine') base.date = f.date
      if (f.period === 'mois') { base.month = f.month; base.month_start_day = startDay }
      if (f.period === 'periode') { base.from = f.from; base.to = f.to }
      await download('/reports/export', base)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Rapports Excel" sub="Générés depuis la base de données, au format du fichier terrain « mobile 1.xlsx »" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Paramètres du rapport" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rapport">
              <select className="input" value={f.scope} onChange={set('scope')}>
                <option value="citerne">Par citerne</option><option value="site">Par site</option>
                <option value="global">Global (toutes les citernes)</option><option value="vehicule">Par camion ou engin</option>
              </select>
            </Field>
            {f.scope === 'citerne' && <Field label="Citerne"><select className="input" value={f.fuel_tank_id} onChange={set('fuel_tank_id')}>{tanks.data?.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.site?.name}</option>)}</select></Field>}
            {f.scope === 'site' && <Field label="Site"><select className="input" value={f.site_id} onChange={set('site_id')}>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            {f.scope === 'vehicule' && (
              <Field label="Véhicule">
                <input className="input" placeholder="Code de parc" value={vehicleQ} onChange={(e) => { setVehicleQ(e.target.value); setF((x) => ({ ...x, vehicle_id: '' })) }} />
                {vehicles.length > 0 && !f.vehicle_id && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-ink-100 text-sm">
                    {vehicles.map((v) => <li key={v.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-ink-50" onClick={() => { setF((x) => ({ ...x, vehicle_id: String(v.id) })); setVehicleQ(`${v.code_parc} — ${v.immatriculation}`) }}>{v.code_parc} <span className="text-ink-500">{v.immatriculation}</span></button></li>)}
                  </ul>
                )}
              </Field>
            )}
            <Field label="Période">
              <select className="input" value={f.period} onChange={set('period')}>
                <option value="jour">Journalier</option><option value="semaine">Hebdomadaire</option><option value="mois">Mensuel</option><option value="periode">Période personnalisée</option>
              </select>
            </Field>
            {(f.period === 'jour' || f.period === 'semaine') && <Field label={f.period === 'jour' ? 'Date' : 'Un jour de la semaine'}><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>}
            {f.period === 'mois' && <>
              <Field label="Mois"><input type="month" className="input" value={f.month} onChange={set('month')} /></Field>
              <Field label="Début du mois" hint={startDay === '1' ? 'Mois calendaire' : `Du ${startDay} du mois précédent au ${Number(startDay) - 1} du mois choisi`}>
                <select className="input" value={startDay} onChange={set('month_start_day')}>
                  <option value="1">1er → dernier jour</option>
                  {Array.from({ length: 27 }, (_, i) => i + 2).map((d) => <option key={d} value={d}>Du {d} au {d - 1}</option>)}
                </select>
              </Field>
            </>}
            {f.period === 'periode' && <>
              <Field label="Du"><input type="date" className="input" value={f.from} onChange={set('from')} /></Field>
              <Field label="Au"><input type="date" className="input" value={f.to} onChange={set('to')} /></Field>
            </>}
          </div>
          <div className="mt-4 space-y-3">
            <ErrorBox error={error} />
            <Button variant="brand" size="lg" loading={busy} disabled={f.scope === 'vehicule' && !f.vehicle_id} onClick={run}>Télécharger le rapport Excel</Button>
          </div>
        </Card>
        <Card title="Contenu du fichier">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-ink-700">
            <li>Une feuille par citerne, colonnes du modèle : Date, Qte, Fournisseur, N° de bon, Heure, Code, Immatriculation, Kilométrage, Qte, Remarque, Série départ, Série fin, Stock réel.</li>
            <li>Ligne de stock d'ouverture, puis chaque mouvement dans l'ordre chronologique ; le solde est une formule (M = précédent + entrée − sortie).</li>
            <li>Feuille « Synthèse » (entrées, sorties, ajustements, stock théorique, dernier inventaire, écart) et feuille « Anomalies ».</li>
          </ul>
          <div className="mt-3"><Alert tone="info">Les bons annulés restent visibles avec leur ligne d'annulation, pour que le solde corresponde au journal de stock.</Alert></div>
        </Card>
      </div>
    </>
  )
}
