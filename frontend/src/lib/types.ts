import type { Warning } from './api'

export type Role = 'admin' | 'responsable_site' | 'pompiste'

export type Site = { id: number; code: string; name: string; is_active?: boolean }

export type TankLite = { id: number; code: string; name: string; kind: 'fixe' | 'mobile'; site_id: number; site?: Site }

export type User = {
  id: number
  name: string
  email: string
  role: Role
  is_active: boolean
  tanks: TankLite[]
  site_ids: number[] | null
  permissions: Record<'view' | 'refuel' | 'deliver' | 'inventory' | 'request_correction' | 'approve' | 'manage', boolean>
}

export type VehicleCard = {
  id: number
  code_parc: string
  immatriculation: string
  chassis: string | null
  type_label: string | null
  category: 'camion' | 'engin' | 'vehicule_leger' | 'citerne' | 'autre'
  counter_unit: 'km' | 'h'
  tank_capacity_l: string | null
  status: 'actif' | 'en_panne' | 'inactif'
  status_note: string | null
  site: Site | null
}

export type Candidate = {
  assignment_id: number
  driver_id: number
  driver_name: string
  team_slot: number
  is_replacement: boolean
  starts_on: string
  ends_on: string | null
}

export type ScanResult = {
  at: string
  work_date: string
  tank: { id: number; code: string; name: string; stock_l: string | null }
  dispenser: { id: number; code: string; expected_index_start: string }
  vehicle: VehicleCard
  shift: { id: number; code: string; name: string; start_time: string; end_time: string } | null
  assignment_status: 'ok' | 'aucune' | 'ambigu'
  driver: { id: number; name: string } | null
  candidates: Candidate[]
  counter_unit: 'km' | 'h'
  previous_counter_value: string | null
  warnings: Warning[]
  identified_by: 'qr' | 'manuel'
}

export type Preview = Omit<ScanResult, 'identified_by'> & {
  index_start: string
  index_end: string
  quantity_l: string
  declared_quantity_l: string | null
  counter_value: string | null
  can_submit: boolean
}

export type Attachment = { id: number; kind: string; original_name: string | null; mime: string; size: number; created_at: string }

export type Refuel = {
  id: number
  voucher_number: string
  voucher_seq: number
  paper_voucher_number: string | null
  fuel_tank_id: number
  tank?: { id: number; code: string; name?: string; site?: Site }
  vehicle_id: number
  vehicle_code: string
  vehicle_immatriculation: string
  vehicle_type: string | null
  vehicle_category: string
  driver_id: number | null
  driver_name: string | null
  shift_name: string | null
  site_name: string
  pump_attendant_id: number
  pump_attendant_name: string
  refueled_at: string
  work_date: string
  index_start: string
  index_end: string
  quantity_l: string
  declared_quantity_l: string | null
  expected_index_start: string | null
  counter_value: string | null
  counter_unit: 'km' | 'h'
  previous_counter_value: string | null
  stock_before_l: string
  stock_after_l: string
  remark: string | null
  status: 'valide' | 'annule'
  has_anomaly: boolean
  anomalies_count?: number
  cancelled_at: string | null
  cancel_reason: string | null
  corrects_refuel_id: number | null
  snapshot: Record<string, any>
  attachments?: Attachment[]
}

export type Tank = {
  id: number
  code: string
  name: string
  kind: 'fixe' | 'mobile'
  capacity_l: string
  is_active: boolean
  allow_negative: boolean
  low_stock_threshold_l: string | null
  vehicle_id: number | null
  site: Site | null
  dispensers: { id: number; code: string; name: string; is_active: boolean; current_index: string }[]
  stock_visible: boolean
  initial_stock_l?: string
  total_entries_l?: string
  total_exits_l?: string
  total_adjustments_l?: string
  theoretical_stock_l?: string
  journal_ok?: boolean
  fill_pct?: number | null
  is_low?: boolean
  last_inventory?: { measured_at: string; measured_l: string; theoretical_l: string; difference_l: string } | null
}

export type Anomaly = {
  id: number
  type: string
  severity: 'info' | 'alerte' | 'critique'
  fuel_tank_id: number | null
  tank?: { id: number; code: string } | null
  refuel?: { id: number; voucher_number: string; vehicle_code: string; quantity_l: string; refueled_at: string } | null
  vehicle?: { id: number; code_parc: string } | null
  message: string
  status: 'ouverte' | 'traitee' | 'ignoree'
  resolution_note: string | null
  created_at: string
}
