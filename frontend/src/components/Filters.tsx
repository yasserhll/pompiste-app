import { useQuery } from '@tanstack/react-query'
import { Search, SlidersHorizontal } from 'lucide-react'
import { api } from '../lib/api'
import type { Site, Tank } from '../lib/types'

export type FilterValues = Record<string, string>

/** Filtres communs (dates, chantier, citerne, type, shift, statut). Les listes viennent du périmètre serveur. */
export function Filters({ value, onChange, show }: { value: FilterValues; onChange: (v: FilterValues) => void; show: string[] }) {
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/sites'), enabled: show.includes('site_id') })
  const tanks = useQuery({ queryKey: ['tanks'], queryFn: () => api.get<Tank[]>('/tanks'), enabled: show.includes('fuel_tank_id') })
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => api.get<{ id: number; name: string; site?: Site | null }[]>('/shifts'), enabled: show.includes('work_shift_id') })
  const set = (k: string) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })
  const cell = 'min-w-[9.5rem] flex-1'
  const lab = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-500'
  const inp = 'input h-10 py-0 text-sm'

  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
      <span className="hidden h-10 items-center gap-2 pr-1 text-sm font-semibold text-ink-700 xl:flex"><SlidersHorizontal size={16} className="text-brand-600" />Filtres</span>
      {show.includes('from') && <label className={cell}><span className={lab}>Du</span><input type="date" className={inp} value={value.from ?? ''} onChange={set('from')} /></label>}
      {show.includes('to') && <label className={cell}><span className={lab}>Au</span><input type="date" className={inp} value={value.to ?? ''} onChange={set('to')} /></label>}
      {show.includes('site_id') && (
        <label className={cell}><span className={lab}>Chantier</span>
          <select className={inp} value={value.site_id ?? ''} onChange={set('site_id')}>
            <option value="">Tous</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
      )}
      {show.includes('fuel_tank_id') && (
        <label className={cell}><span className={lab}>Citerne</span>
          <select className={inp} value={value.fuel_tank_id ?? ''} onChange={set('fuel_tank_id')}>
            <option value="">Toutes</option>{tanks.data?.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
          </select></label>
      )}
      {show.includes('vehicle_category') && (
        <label className={cell}><span className={lab}>Type de véhicule</span>
          <select className={inp} value={value.vehicle_category ?? ''} onChange={set('vehicle_category')}>
            <option value="">Tous</option><option value="camion">Camions</option><option value="engin">Engins</option>
            <option value="vehicule_leger">Véhicules légers</option><option value="citerne">Citernes</option>
          </select></label>
      )}
      {show.includes('work_shift_id') && (
        <label className={cell}><span className={lab}>Shift</span>
          <select className={inp} value={value.work_shift_id ?? ''} onChange={set('work_shift_id')}>
            <option value="">Tous</option>{shifts.data?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.site ? ` (${s.site.name})` : ''}</option>)}
          </select></label>
      )}
      {show.includes('status') && (
        <label className={cell}><span className={lab}>Statut</span>
          <select className={inp} value={value.status ?? ''} onChange={set('status')}>
            <option value="">Tous</option><option value="valide">Validés</option><option value="annule">Annulés</option>
          </select></label>
      )}
      {show.includes('search') && (
        <label className="min-w-[13rem] flex-[2]"><span className={lab}>Recherche</span>
          <span className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className={`${inp} pl-9`} placeholder="Bon, véhicule, conducteur…" value={value.search ?? ''} onChange={set('search')} />
          </span>
        </label>
      )}
    </div>
  )
}
