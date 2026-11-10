import { motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, ArrowRightLeft, Building2, Camera, Fuel, CheckCircle2, ClipboardCheck, FileDown, FileText, Gauge, Info, PenLine, ScanLine, Search,
  ShieldCheck, Truck, UserRound, UserRoundCog,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PhotoPicker, type PhotoItem } from '../components/PhotoPicker'
import { QrScanner } from '../components/QrScanner'
import { Alert, Badge, Button, Card, ErrorBox, Field, IconChip, Spinner } from '../components/ui'
import { WarningList } from '../components/WarningList'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, download, type Paginated, type Warning } from '../lib/api'
import { CATEGORY_LABEL, counter, dateTime, litres, STATUS_LABEL } from '../lib/format'
import { parseNum, quantity } from '../lib/num'
import type { Preview, Refuel, ScanResult, VehicleCard } from '../lib/types'
import { store, uuid } from '../lib/util'

type Step = 'scan' | 'saisie' | 'recap' | 'termine'
type Form = {
  index_start: string
  index_end: string
  declared_quantity_l: string
  counter_value: string
  paper_voucher_number: string
  remark: string
  driver_id: string          // '' = proposition automatique
  driver_reason: string
  company: string            // case cochée sur le bon : TRANSWIN, LAHLAL, LEL… ou nom (AUTRES)
  external_driver_name: string
  external_driver_cin: string
  purpose: '' | 'consommation' | 'transfert' // '' = selon la quantité
}
type Draft = { client_uuid: string; tankId: number; step: Step; scan: ScanResult; form: Form; photos: PhotoItem[]; confirmed: string[]; savedAt: string }

const EMPTY: Form = { index_start: '', index_end: '', declared_quantity_l: '', counter_value: '', paper_voucher_number: '', remark: '', driver_id: '', driver_reason: '',
  company: '', external_driver_name: '', external_driver_cin: '', purpose: '' }

export default function RefuelPage() {
  const { user, tankId } = useAuth()
  const { token } = useParams()
  const navigate = useNavigate()
  const draftKey = `pompiste.draft.${user?.id}`

  const restored = useRef(store.get<Draft | null>(draftKey, null))
  const [step, setStep] = useState<Step>(restored.current?.step === 'termine' ? 'scan' : restored.current?.step ?? 'scan')
  const [clientUuid, setClientUuid] = useState(restored.current?.client_uuid ?? uuid())
  const [scan, setScan] = useState<ScanResult | null>(restored.current?.scan ?? null)
  const [form, setForm] = useState<Form>(restored.current?.form ?? EMPTY)
  const [photos, setPhotos] = useState<PhotoItem[]>((restored.current?.photos ?? []).filter((p) => p.status === 'ok').map((p) => ({ ...p, preview: null })))
  const [confirmed, setConfirmed] = useState<string[]>(restored.current?.confirmed ?? [])
  const [restoredNotice, setRestoredNotice] = useState(!!restored.current && restored.current.step !== 'scan')

  const [scanError, setScanError] = useState<unknown>(null)
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitError, setSubmitError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Refuel | null>(null)
  const [replayed, setReplayed] = useState(false)


  // ── Brouillon : conservé à chaque modification (coupure réseau, fermeture du navigateur)
  useEffect(() => {
    if (!user || !scan || step === 'termine' || step === 'scan') return
    store.set(draftKey, { client_uuid: clientUuid, tankId: scan.tank.id, step, scan, form, confirmed,
      photos: photos.map(({ file: _f, preview: _p, ...p }) => ({ ...p, preview: null })), savedAt: new Date().toISOString() } satisfies Draft)
  }, [user, draftKey, clientUuid, step, scan, form, photos, confirmed])

  const reset = useCallback(() => {
    store.remove(draftKey)
    setStep('scan'); setScan(null); setForm(EMPTY); setPhotos([]); setConfirmed([]); setPreview(null)
    setSubmitError(null); setDone(null); setScanError(null); setManual(false); setRestoredNotice(false); setReplayed(false)
    setClientUuid(uuid())
  }, [draftKey])

  // ── Identification du véhicule
  const identify = useCallback(async (by: { qr?: string; vehicle_id?: number }) => {
    if (!tankId) return
    setScanning(true); setScanError(null)
    try {
      const res = await api.post<ScanResult>('/scan', { fuel_tank_id: tankId, ...by })
      setScan(res)
      setForm({ ...EMPTY, company: res.company ?? '', index_start: Number(res.dispenser.expected_index_start) > 0 ? String(Number(res.dispenser.expected_index_start)) : '' })
      setConfirmed([]); setPhotos([]); setPreview(null); setClientUuid(uuid())
      setStep('saisie')
    } catch (e) {
      setScanError(e)
    } finally {
      setScanning(false)
    }
  }, [tankId])

  // Lien ouvert depuis l'appareil photo du téléphone : /scan/<jeton>
  useEffect(() => {
    if (token && tankId && step === 'scan') {
      identify({ qr: token })
      navigate('/ravitaillement', { replace: true })
    }
  }, [token, tankId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calcul local immédiat + contrôle serveur (aperçu, sans écriture)
  const qty = useMemo(() => quantity(form.index_start, form.index_end), [form.index_start, form.index_end])
  const counterParsed = parseNum(form.counter_value)
  const declaredParsed = parseNum(form.declared_quantity_l)

  const payload = useCallback(() => ({
    fuel_tank_id: scan!.tank.id,
    fuel_dispenser_id: scan!.dispenser.id,
    vehicle_id: scan!.vehicle.id,
    identified_by: scan!.identified_by,
    index_start: form.index_start,
    index_end: form.index_end,
    declared_quantity_l: form.declared_quantity_l || null,
    counter_value: form.counter_value || null,
    paper_voucher_number: form.paper_voucher_number.trim() || null,
    remark: form.remark.trim() || null,
    driver_id: form.driver_id ? Number(form.driver_id) : (scan!.driver?.id ?? null),
    driver_reason: form.driver_reason.trim() || null,
    company: form.company.trim() || null,
    external_driver_name: form.external_driver_name.trim() || null,
    external_driver_cin: form.external_driver_cin.trim() || null,
    purpose: form.purpose || null,
    attachment_ids: photos.filter((p) => p.status === 'ok' && p.id).map((p) => p.id),
  }), [scan, form, photos])

  useEffect(() => {
    if (!scan || step === 'scan' || step === 'termine' || !qty.value || qty.error || !counterParsed.ok || !declaredParsed.ok) { setPreview(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setPreviewing(true)
      try {
        setPreview(await api.post<Preview>('/refuels/preview', payload()))
      } catch (e) {
        if (e instanceof ApiError && !e.offline) setPreview(null)
      } finally { setPreviewing(false) }
    }, 500)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [scan, step, qty.value, qty.error, counterParsed.ok, declaredParsed.ok, payload])

  const warnings: Warning[] = submitError?.requiresConfirmation ? submitError.warnings : preview?.warnings ?? scan?.warnings ?? []
  const alerts = warnings.filter((w) => w.level === 'alerte')
  const blocking = warnings.filter((w) => w.level === 'bloquant')
  const unconfirmed = alerts.filter((w) => !confirmed.includes(w.code))
  const uploading = photos.some((p) => p.status === 'envoi')
  const toggle = (code: string) => setConfirmed((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]))
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const formReady = !!qty.value && !qty.error && counterParsed.ok && declaredParsed.ok && !(scan?.assignment_status === 'ambigu' && !form.driver_id)

  // ── Validation (idempotente : même client_uuid à chaque nouvelle tentative)
  const submit = async () => {
    setSubmitting(true); setSubmitError(null)
    try {
      const res = await api.post<{ refuel: Refuel; replayed: boolean }>('/refuels', { ...payload(), client_uuid: clientUuid, confirmed_warnings: confirmed })
      store.remove(draftKey)
      setDone(res.refuel); setReplayed(res.replayed); setStep('termine')
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e : new ApiError(0, null, true))
    } finally {
      setSubmitting(false)
    }
  }

  // Validation interrompue par une coupure : renvoi automatique dès le retour du réseau (même client_uuid)
  useEffect(() => {
    if (!submitError?.offline || step !== 'recap') return
    const retry = () => { if (!submitting) submit() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null
  if (!user.tanks.length) return <Alert tone="warning" title="Aucune citerne autorisée">Demandez à l'administrateur de vous rattacher à une citerne.</Alert>

  // ───────────────────────────────────────────── écran : terminé
  if (step === 'termine' && done) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card overflow-hidden text-center">
          <div className="relative bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 pb-8 pt-10 text-white">
            <div className="pointer-events-none absolute inset-0 bg-grid" />
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
              className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-8 ring-white/10">
              <svg viewBox="0 0 52 52" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M14 27 l8 8 l16 -18" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.45 }} />
              </svg>
            </motion.div>
            <h1 className="relative mt-4 text-xl font-bold">Ravitaillement enregistré</h1>
            <p className="relative mt-1 text-sm text-emerald-50">Stock de la citerne mis à jour</p>
          </div>
          <div className="space-y-2 p-6">
            {replayed && <Alert tone="info">Ce bon avait déjà été reçu : aucun doublon n'a été créé.</Alert>}
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Numéro du bon</p>
            <p className="text-2xl font-bold tracking-wide tabular-nums">{done.voucher_number}</p>
            <dl className="grid grid-cols-2 gap-3 pt-3 text-left text-sm">
              {[['Véhicule', done.vehicle_code], ['Quantité', litres(done.quantity_l)], ['Conducteur', done.driver_name ?? 'Non affecté'], ['Date', dateTime(done.refueled_at)]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-ink-50 px-3 py-2.5"><dt className="text-xs text-ink-500">{k}</dt><dd className="mt-0.5 font-semibold text-ink-900">{v}</dd></div>
              ))}
            </dl>
          </div>
        </motion.div>
        <Button variant="brand" size="xl" className="w-full" icon={ScanLine} onClick={reset}>Scanner le véhicule suivant</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={FileDown} onClick={() => download(`/refuels/${done.id}/voucher`)}>Bon PDF</Button>
          <Link to={`/bons/${done.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-ink-800 shadow-sm ring-1 ring-inset ring-ink-200 hover:bg-ink-50"><FileText size={17} />Voir le détail</Link>
        </div>
      </div>
    )
  }

  // ───────────────────────────────────────────── écran : scan
  if (step === 'scan' || !scan) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Steps step={0} />
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Scanner un véhicule</h1>
          <p className="mt-1 text-sm text-ink-500">Citerne <b className="text-ink-800">{user.tanks.find((t) => t.id === tankId)?.code}</b> · visez le QR code collé sur le camion ou l'engin</p>
        </div>
        {scanning ? <div className="card flex flex-col items-center gap-3 p-12 text-ink-500"><Spinner className="h-8 w-8 text-brand-600" />Identification du véhicule…</div>
          : manual ? <ManualSearch onPick={(v) => identify({ vehicle_id: v.id })} onCancel={() => setManual(false)} />
          : <QrScanner onResult={(text) => identify({ qr: text })} />}
        <ErrorBox error={scanError} />
        {!manual && !scanning && (
          <Button variant="secondary" size="lg" className="w-full" icon={Search} onClick={() => setManual(true)}>Recherche manuelle par code de parc</Button>
        )}
      </div>
    )
  }

  // ───────────────────────────────────────────── écran : saisie / récapitulatif
  const v = scan.vehicle
  const driverName = form.driver_id
    ? scan.candidates.find((c) => String(c.driver_id) === form.driver_id)?.driver_name ?? otherDriverName(form.driver_id)
    : scan.driver?.name
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {restoredNotice && (
        <Alert tone="info" title="Saisie en cours restaurée">
          La saisie interrompue a été récupérée sur ce téléphone.{' '}
          <button className="font-semibold underline" onClick={reset}>Abandonner et recommencer</button>
        </Alert>
      )}

      <Steps step={step === 'recap' ? 2 : 1} />
      <VehicleHeader scan={scan} onChange={reset} />

      {step === 'saisie' && (
        <>
          <Card title="Conducteur" subtitle={scan.shift ? `Shift ${scan.shift.name} · ${scan.shift.start_time.slice(0, 5)} → ${scan.shift.end_time.slice(0, 5)}` : undefined} icon={UserRound}>
            <DriverChoice scan={scan} value={form.driver_id} reason={form.driver_reason}
              onChange={(id, reason) => setForm((f) => ({ ...f, driver_id: id, driver_reason: reason }))} />
          </Card>

          <Card title="Séries du compteur de distribution" subtitle="Index avant et après remplissage" icon={Gauge}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Série départ" hint={`Dernière série fin : ${Number(scan.dispenser.expected_index_start).toLocaleString('fr-FR')}`}
                error={parseNum(form.index_start).ok ? null : (parseNum(form.index_start) as { error: string }).error}>
                <input className="input input-lg" inputMode="decimal" autoComplete="off" value={form.index_start} onChange={set('index_start')} placeholder="66 4508" />
              </Field>
              <Field label="Série fin" error={parseNum(form.index_end).ok ? null : (parseNum(form.index_end) as { error: string }).error}>
                <input className="input input-lg" inputMode="decimal" autoComplete="off" value={form.index_end} onChange={set('index_end')} placeholder="66 4735" autoFocus />
              </Field>
            </div>
            <div className={`relative mt-4 flex flex-wrap items-center justify-between gap-x-3 overflow-hidden rounded-2xl px-4 py-4 sm:px-5 ${qty.error ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200' : 'bg-navy-900 text-white'}`}>
              {!qty.error && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fuel-500/30 blur-2xl" />}
              <span className="relative text-sm font-medium opacity-80">Quantité calculée</span>
              <motion.span key={qty.value ?? qty.error ?? 'vide'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`relative font-bold tabular-nums ${qty.error ? 'text-base' : 'text-3xl text-fuel-300'}`}>{qty.error ? qty.error : qty.value ? litres(qty.value) : '— L'}</motion.span>
            </div>
            <Field className="mt-3" label="Quantité annoncée (facultatif)" hint="Comparée à la quantité calculée"
              error={declaredParsed.ok ? null : (declaredParsed as { error: string }).error}>
              <input className="input" inputMode="decimal" value={form.declared_quantity_l} onChange={set('declared_quantity_l')} />
            </Field>
          </Card>

          <Card title="Compteur du véhicule" subtitle={v.counter_unit === 'h' ? 'Heures moteur' : 'Kilométrage'} icon={Truck}>
            <Field label={v.counter_unit === 'h' ? 'Heures (H)' : 'Kilomètres'}
              hint={scan.previous_counter_value ? `Dernier relevé : ${counter(scan.previous_counter_value, v.counter_unit)}` : 'Aucun relevé précédent'}
              error={counterParsed.ok ? null : (counterParsed as { error: string }).error}>
              <input className="input input-lg" inputMode="decimal" value={form.counter_value} onChange={set('counter_value')} placeholder={v.counter_unit === 'h' ? '3 808' : '125 400'} />
            </Field>
          </Card>

          {(preview?.transfer ?? scan.transfer) && (
            <TransferChoice t={(preview?.transfer ?? scan.transfer)!} qty={qty.value} value={form.purpose} onChange={(v) => setForm((f) => ({ ...f, purpose: v }))} />
          )}

          <Card title="Bon papier" subtitle="Reprendre les informations du bon rempli" icon={PenLine}>
            <p className="label">Société</p>
            <CompanyChoice companies={scan.companies ?? ['TRANSWIN', 'LAHLAL', 'LEL']} value={form.company}
              onChange={(c) => setForm((f) => ({ ...f, company: c }))} />
            {form.company && !(scan.companies ?? []).map((c) => c.toUpperCase()).includes(form.company.toUpperCase()) && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Nom du conducteur (autres)"><input className="input" value={form.external_driver_name} onChange={set('external_driver_name')} /></Field>
                <Field label="CIN du conducteur"><input className="input uppercase" value={form.external_driver_cin} onChange={set('external_driver_cin')} placeholder="AB123456" /></Field>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="N° du bon papier (facultatif)"><input className="input" inputMode="numeric" value={form.paper_voucher_number} onChange={set('paper_voucher_number')} placeholder="0075952" /></Field>
              <Field label="Remarque (facultatif)"><input className="input" value={form.remark} onChange={set('remark')} maxLength={500} /></Field>
            </div>
          </Card>

          <Card title="Photos / justificatifs" subtitle="Bon papier, compteur, pièces" icon={Camera}>
            <PhotoPicker items={photos} onChange={setPhotos} />
          </Card>

          <Card title={<span className="flex items-center gap-2">Contrôles automatiques {previewing && <Spinner className="h-4 w-4 text-ink-400" />}</span>} icon={ShieldCheck}>
            {warnings.length ? <WarningList warnings={warnings} /> : <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={18} />Aucune anomalie détectée.</p>}
          </Card>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-10 lg:bottom-4">
            <Button variant="brand" size="xl" className="w-full" iconRight={ArrowRight} disabled={!formReady || uploading || blocking.length > 0} onClick={() => setStep('recap')}>
              {uploading ? 'Envoi des photos…' : 'Continuer vers le récapitulatif'}
            </Button>
          </div>
        </>
      )}

      {step === 'recap' && (
        <>
          <Card title="Récapitulatif" subtitle="Vérifier avant validation" icon={ClipboardCheck}>
            <div className="relative mb-5 flex items-center justify-between overflow-hidden rounded-2xl bg-navy-900 px-5 py-4 text-white">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fuel-500/30 blur-2xl" />
              <div className="relative"><p className="text-xs uppercase tracking-wider text-ink-400">Quantité</p><p className="text-3xl font-bold tabular-nums text-fuel-300">{litres(qty.value)}</p></div>
              <div className="relative text-right"><p className="text-xs uppercase tracking-wider text-ink-400">Véhicule</p><p className="text-xl font-bold">{v.code_parc}</p></div>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2.5 text-sm sm:gap-x-6 [&_dd]:min-w-0 [&_dd]:break-words">
              <dt className="text-ink-500">Véhicule</dt><dd className="font-semibold">{v.code_parc} — {v.immatriculation}</dd>
              <dt className="text-ink-500">Conducteur</dt><dd>{driverName ?? <span className="text-amber-700">Non affecté</span>}{scan.shift && ` · shift ${scan.shift.name}`}</dd>
              <dt className="text-ink-500">Site</dt><dd>{v.site?.name ?? '—'}</dd>
              <dt className="text-ink-500">Citerne</dt><dd>{scan.tank.code}</dd>
              <dt className="text-ink-500">Pompiste</dt><dd>{user.name}</dd>
              <dt className="text-ink-500">Date et heure</dt><dd>Heure du serveur à la validation</dd>
              <dt className="text-ink-500">Séries</dt><dd className="tabular-nums">{form.index_start} → {form.index_end}</dd>
              <dt className="text-ink-500">Quantité</dt><dd className="text-lg font-bold">{litres(qty.value)}</dd>
              <dt className="text-ink-500">Compteur</dt><dd>{form.counter_value ? `${form.counter_value} ${v.counter_unit === 'h' ? 'H' : 'km'}` : '—'}</dd>
              {form.paper_voucher_number && <><dt className="text-ink-500">Bon papier</dt><dd>{form.paper_voucher_number}</dd></>}
              {form.company && <><dt className="text-ink-500">Société</dt><dd>{form.company}{form.external_driver_cin && ` · CIN ${form.external_driver_cin}`}</dd></>}
              {(preview?.transfer?.purpose === 'transfert') && <><dt className="text-ink-500">Transfert</dt><dd className="font-semibold text-sky-700">Remis à la citerne {preview.transfer.tank.code}</dd></>}
              <dt className="text-ink-500">Photos</dt><dd>{photos.filter((p) => p.status === 'ok').length} jointe(s)</dd>
            </dl>
          </Card>

          {(alerts.length > 0 || blocking.length > 0) && (
            <Card title={unconfirmed.length ? `Confirmer ${unconfirmed.length} alerte(s)` : 'Alertes confirmées'} icon={ShieldCheck}>
              <WarningList warnings={warnings} confirmed={confirmed} onToggle={toggle} />
            </Card>
          )}

          {submitError && !submitError.requiresConfirmation && (
            submitError.offline
              ? <Alert tone="warning" title="Réseau indisponible">La saisie est conservée sur le téléphone et sera envoyée automatiquement au retour du réseau (ou appuyer à nouveau sur « Valider »). Le bon ne sera jamais enregistré deux fois.</Alert>
              : <ErrorBox error={submitError} />
          )}
          {submitError?.requiresConfirmation && <Alert tone="warning">De nouveaux contrôles sont apparus au moment de la validation (autre opération sur la citerne). Les vérifier puis valider.</Alert>}

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-10 space-y-2 lg:bottom-4">
            <Button variant="brand" size="xl" className="w-full" icon={CheckCircle2} loading={submitting}
              disabled={submitting || blocking.length > 0 || unconfirmed.length > 0 || uploading} onClick={submit}>
              VALIDER LE RAVITAILLEMENT
            </Button>
            <Button variant="secondary" className="w-full" icon={ArrowLeft} disabled={submitting} onClick={() => setStep('saisie')}>Modifier la saisie</Button>
          </div>
        </>
      )}
    </div>
  )
}

const otherDrivers = new Map<string, string>()
const otherDriverName = (id: string) => otherDrivers.get(id)

function VehicleHeader({ scan, onChange }: { scan: ScanResult; onChange: () => void }) {
  const v: VehicleCard = scan.vehicle
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="relative flex items-start justify-between gap-3 overflow-hidden bg-navy-900 p-5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Truck size={26} /></span>
          <div>
            <p className="text-3xl font-bold tracking-wide">{v.code_parc}</p>
            <p className="text-sm text-ink-300">{v.immatriculation} · {v.type_label ?? CATEGORY_LABEL[v.category]}</p>
          </div>
        </div>
        <div className="relative flex flex-col items-end gap-1.5">
          <Badge color={scan.identified_by === 'qr' ? 'green' : 'amber'}>{scan.identified_by === 'qr' ? 'QR scanné' : 'Saisie manuelle'}</Badge>
          {v.status !== 'actif' && <Badge color="red">{STATUS_LABEL[v.status]}</Badge>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-ink-100 text-sm sm:grid-cols-4">
        {[['Chantier', v.site?.name ?? '—'], ['Shift', scan.shift?.name ?? '—'], ['Citerne', scan.tank.code], ['Stock citerne', scan.tank.stock_l != null ? litres(scan.tank.stock_l) : '—']].map(([k, val]) => (
          <div key={k} className="bg-white px-4 py-3"><dt className="text-xs text-ink-500">{k}</dt><dd className="mt-0.5 font-semibold text-ink-900">{val}</dd></div>
        ))}
      </dl>
      <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-ink-500"><Info size={14} />Heure enregistrée par le serveur à la validation</span>
        <button className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={onChange}><ScanLine size={15} />Changer</button>
      </div>
    </motion.div>
  )
}

function DriverChoice({ scan, value, reason, onChange }: { scan: ScanResult; value: string; reason: string; onChange: (id: string, reason: string) => void }) {
  const [other, setOther] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: number; name: string }[]>([])
  const isCandidate = !value || scan.candidates.some((c) => String(c.driver_id) === value)

  useEffect(() => {
    if (!other || q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => api.get<{ id: number; name: string }[]>('/drivers', { search: q }).then(setResults).catch(() => setResults([])), 300)
    return () => clearTimeout(t)
  }, [other, q])

  return (
    <div className="space-y-3">
      {scan.assignment_status === 'ok' && scan.driver && !value && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-600"><CheckCircle2 size={17} className="text-emerald-600" />Proposé automatiquement : <span className="text-base font-semibold text-ink-900">{scan.driver.name}</span></p>
      )}
      {scan.assignment_status === 'ambigu' && <Alert tone="warning">Plusieurs conducteurs sont affectés : sélectionner celui présent.</Alert>}
      {scan.assignment_status === 'aucune' && <Alert tone="warning">Aucun conducteur affecté à ce véhicule pour ce shift.</Alert>}

      {scan.candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scan.candidates.map((c) => {
            const active = value ? String(c.driver_id) === value : scan.driver?.id === c.driver_id && scan.assignment_status === 'ok'
            return (
              <button key={c.assignment_id} type="button" onClick={() => { setOther(false); onChange(String(c.driver_id), '') }}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${active ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10' : 'border-ink-200 bg-white hover:border-ink-300'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>{c.driver_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                <span><span className="block font-semibold">{c.driver_name}</span>
                <span className="text-xs text-ink-500">Équipe {c.team_slot}{c.is_replacement ? ' · remplaçant' : ''}</span></span>
              </button>
            )
          })}
        </div>
      )}

      {!other ? (
        <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => setOther(true)}><UserRoundCog size={16} />Autre conducteur (remplaçant non prévu)</button>
      ) : (
        <div className="space-y-2 rounded-lg border border-ink-200 p-3">
          <Field label="Rechercher un conducteur"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom" /></Field>
          {results.length > 0 && (
            <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
              {results.map((d) => (
                <li key={d.id}><button type="button" className={`w-full px-3 py-2 text-left text-sm ${String(d.id) === value ? 'bg-brand-50 font-semibold' : ''}`}
                  onClick={() => { otherDrivers.set(String(d.id), d.name); onChange(String(d.id), reason) }}>{d.name}</button></li>
              ))}
            </ul>
          )}
          {value && !isCandidate && (
            <Field label="Motif (obligatoire)"><input className="input" value={reason} onChange={(e) => onChange(value, e.target.value)} placeholder="Ex. remplacement, conducteur absent" /></Field>
          )}
        </div>
      )}
    </div>
  )
}

function ManualSearch({ onPick, onCancel }: { onPick: (v: VehicleCard) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<VehicleCard[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 1) { setList([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try { setList((await api.get<Paginated<VehicleCard>>('/vehicles', { search: q.trim(), per_page: 20 })).data) } catch { setList([]) } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Card title="Recherche par code de parc" icon={Search} actions={<Button size="sm" variant="ghost" icon={ScanLine} onClick={onCancel}>Revenir au scan</Button>}>
      <span className="relative block"><Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input input-lg pl-12 uppercase" autoFocus placeholder="D222, E81, immatriculation…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
      <div className="mt-3">
        {loading && <Spinner className="mx-auto h-5 w-5 text-ink-400" />}
        <ul className="divide-y divide-ink-100">
          {list.map((v) => (
            <li key={v.id}>
              <button className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-ink-50" onClick={() => onPick(v)}>
                <span className="flex items-center gap-3"><IconChip icon={Truck} tone="gray" size="sm" /><span><span className="text-lg font-bold">{v.code_parc}</span> <span className="text-sm text-ink-500">{v.immatriculation}</span>
                  <span className="block text-xs text-ink-500">{v.type_label} · {v.site?.name}</span></span></span>
                {v.status !== 'actif' && <Badge color="red">{STATUS_LABEL[v.status]}</Badge>}
              </button>
            </li>
          ))}
        </ul>
        {q && !loading && !list.length && <p className="py-4 text-center text-sm text-ink-500">Aucun véhicule trouvé.</p>}
      </div>
    </Card>
  )
}

const STEPS = ['Véhicule', 'Saisie', 'Validation']

function Steps({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <li key={label} className={`flex items-center gap-2 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white shadow-glow' : 'bg-ink-200 text-ink-500'}`}>
            {i < step ? <CheckCircle2 size={15} /> : i + 1}
          </span>
          <span className={`hidden text-sm font-medium sm:inline ${i <= step ? 'text-ink-900' : 'text-ink-400'}`}>{label}</span>
          {i < STEPS.length - 1 && (
            <span className="relative h-0.5 flex-1 overflow-hidden rounded bg-ink-200">
              <motion.span className="absolute inset-y-0 left-0 bg-emerald-500" initial={false} animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Cases du bon papier : TRANSWIN / LAHLAL / LEL / AUTRES (nom libre). */
function CompanyChoice({ companies, value, onChange }: { companies: string[]; value: string; onChange: (c: string) => void }) {
  const known = companies.map((c) => c.toUpperCase())
  const isOther = value !== '' && !known.includes(value.toUpperCase())
  const [other, setOther] = useState(isOther)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {companies.map((c) => {
          const on = value.toUpperCase() === c.toUpperCase() && !other
          return (
            <button key={c} type="button" onClick={() => { setOther(false); onChange(c) }}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/10' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'}`}>
              <Building2 size={15} />{c}
            </button>
          )
        })}
        <button type="button" onClick={() => { setOther(true); onChange(isOther ? value : '') }}
          className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${other ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/10' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'}`}>
          AUTRES
        </button>
      </div>
      {other && <input className="input" autoFocus placeholder="Nom de la société" value={isOther ? value : ''} onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}

/** Camion-citerne : transfert vers sa citerne (« remis à la citerne ») ou plein de son propre moteur. */
function TransferChoice({ t, qty, value, onChange }: {
  t: NonNullable<ScanResult['transfer']>; qty: string | null; value: Form['purpose']; onChange: (v: Form['purpose']) => void
}) {
  const auto = qty && Number(qty) >= Number(t.min_litres) ? 'transfert' : 'consommation'
  const current = value || auto
  const opts = [
    { v: 'transfert' as const, icon: ArrowRightLeft, title: `Remis à la citerne ${t.tank.code}`, text: `Le gasoil entre dans la citerne${t.tank_stock_l ? ` (stock actuel ${Number(t.tank_stock_l).toLocaleString('fr-FR')} L)` : ''}.` },
    { v: 'consommation' as const, icon: Fuel, title: 'Plein du moteur du camion', text: 'Consommation du véhicule lui-même.' },
  ]
  return (
    <Card title="Camion-citerne" subtitle={`Au-delà de ${Number(t.min_litres).toLocaleString('fr-FR')} L, c'est un transfert par défaut`} icon={ArrowRightLeft}>
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${current === o.v ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10' : 'border-ink-200 bg-white hover:border-ink-300'}`}>
            <o.icon size={20} className={current === o.v ? 'text-brand-600' : 'text-ink-400'} />
            <span><span className="block text-sm font-semibold">{o.title}</span><span className="text-xs text-ink-500">{o.text}</span></span>
          </button>
        ))}
      </div>
    </Card>
  )
}
