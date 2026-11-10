import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PhotoPicker, type PhotoItem } from '../components/PhotoPicker'
import { QrScanner } from '../components/QrScanner'
import { Alert, Badge, Button, Card, ErrorBox, Field, Spinner } from '../components/ui'
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
}
type Draft = { client_uuid: string; tankId: number; step: Step; scan: ScanResult; form: Form; photos: PhotoItem[]; confirmed: string[]; savedAt: string }

const EMPTY: Form = { index_start: '', index_end: '', declared_quantity_l: '', counter_value: '', paper_voucher_number: '', remark: '', driver_id: '', driver_reason: '' }

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
      setForm({ ...EMPTY, index_start: Number(res.dispenser.expected_index_start) > 0 ? String(Number(res.dispenser.expected_index_start)) : '' })
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

  if (!user) return null
  if (!user.tanks.length) return <Alert tone="warning" title="Aucune citerne autorisée">Demandez à l'administrateur de vous rattacher à une citerne.</Alert>

  // ───────────────────────────────────────────── écran : terminé
  if (step === 'termine' && done) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="card p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
          <h1 className="mt-3 text-xl font-bold">Ravitaillement enregistré</h1>
          {replayed && <p className="mt-1 text-sm text-ink-500">Ce bon avait déjà été reçu : aucun doublon n'a été créé.</p>}
          <p className="mt-4 text-sm text-ink-500">Numéro du bon</p>
          <p className="text-2xl font-bold tracking-wide tabular-nums">{done.voucher_number}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
            <dt className="text-ink-500">Véhicule</dt><dd className="font-medium">{done.vehicle_code}</dd>
            <dt className="text-ink-500">Quantité</dt><dd className="font-semibold">{litres(done.quantity_l)}</dd>
            <dt className="text-ink-500">Conducteur</dt><dd>{done.driver_name ?? 'Non affecté'}</dd>
            <dt className="text-ink-500">Date</dt><dd>{dateTime(done.refueled_at)}</dd>
          </dl>
        </div>
        <Button variant="brand" size="xl" className="w-full" onClick={reset}>⛽ Scanner le véhicule suivant</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => download(`/refuels/${done.id}/voucher`)}>Bon PDF</Button>
          <Link to={`/bons/${done.id}`} className="inline-flex items-center justify-center rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold">Voir le détail</Link>
        </div>
      </div>
    )
  }

  // ───────────────────────────────────────────── écran : scan
  if (step === 'scan' || !scan) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-xl font-bold">Nouveau ravitaillement</h1>
          <p className="text-sm text-ink-500">Citerne {user.tanks.find((t) => t.id === tankId)?.code}</p>
        </div>
        {scanning ? <div className="card flex flex-col items-center gap-3 p-10 text-ink-500"><Spinner className="h-8 w-8" />Recherche du véhicule…</div>
          : manual ? <ManualSearch onPick={(v) => identify({ vehicle_id: v.id })} onCancel={() => setManual(false)} />
          : <Card><QrScanner onResult={(text) => identify({ qr: text })} /></Card>}
        <ErrorBox error={scanError} />
        {!manual && !scanning && (
          <Button variant="secondary" size="lg" className="w-full" onClick={() => setManual(true)}>🔎 Recherche manuelle par code de parc</Button>
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

      <VehicleHeader scan={scan} onChange={reset} />

      {step === 'saisie' && (
        <>
          <Card title="Conducteur">
            <DriverChoice scan={scan} value={form.driver_id} reason={form.driver_reason}
              onChange={(id, reason) => setForm((f) => ({ ...f, driver_id: id, driver_reason: reason }))} />
          </Card>

          <Card title="Séries du compteur de distribution">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Série départ" hint={`Dernière série fin : ${Number(scan.dispenser.expected_index_start).toLocaleString('fr-FR')}`}
                error={parseNum(form.index_start).ok ? null : (parseNum(form.index_start) as { error: string }).error}>
                <input className="input input-lg" inputMode="decimal" autoComplete="off" value={form.index_start} onChange={set('index_start')} placeholder="66 4508" />
              </Field>
              <Field label="Série fin" error={parseNum(form.index_end).ok ? null : (parseNum(form.index_end) as { error: string }).error}>
                <input className="input input-lg" inputMode="decimal" autoComplete="off" value={form.index_end} onChange={set('index_end')} placeholder="66 4735" autoFocus />
              </Field>
            </div>
            <div className={`mt-3 flex items-center justify-between rounded-lg px-4 py-3 ${qty.error ? 'bg-red-50 text-red-800' : 'bg-ink-900 text-white'}`}>
              <span className="text-sm">Quantité calculée</span>
              <span className="text-2xl font-bold tabular-nums">{qty.error ? qty.error : qty.value ? litres(qty.value) : '— L'}</span>
            </div>
            <Field className="mt-3" label="Quantité annoncée (facultatif)" hint="Comparée à la quantité calculée"
              error={declaredParsed.ok ? null : (declaredParsed as { error: string }).error}>
              <input className="input" inputMode="decimal" value={form.declared_quantity_l} onChange={set('declared_quantity_l')} />
            </Field>
          </Card>

          <Card title={`Compteur du véhicule (${v.counter_unit === 'h' ? 'heures moteur' : 'kilométrage'})`}>
            <Field label={v.counter_unit === 'h' ? 'Heures (H)' : 'Kilomètres'}
              hint={scan.previous_counter_value ? `Dernier relevé : ${counter(scan.previous_counter_value, v.counter_unit)}` : 'Aucun relevé précédent'}
              error={counterParsed.ok ? null : (counterParsed as { error: string }).error}>
              <input className="input input-lg" inputMode="decimal" value={form.counter_value} onChange={set('counter_value')} placeholder={v.counter_unit === 'h' ? '3 808' : '125 400'} />
            </Field>
          </Card>

          <Card title="Bon papier et remarque">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="N° du bon papier (facultatif)"><input className="input" inputMode="numeric" value={form.paper_voucher_number} onChange={set('paper_voucher_number')} placeholder="0075952" /></Field>
              <Field label="Remarque (facultatif)"><input className="input" value={form.remark} onChange={set('remark')} maxLength={500} /></Field>
            </div>
          </Card>

          <Card title="Photos / justificatifs">
            <PhotoPicker items={photos} onChange={setPhotos} />
          </Card>

          <Card title={<span className="flex items-center gap-2">Contrôles {previewing && <Spinner className="h-4 w-4 text-ink-400" />}</span>}>
            {warnings.length ? <WarningList warnings={warnings} /> : <p className="text-sm text-emerald-700">Aucune anomalie détectée.</p>}
          </Card>

          <div className="sticky bottom-16 z-10 lg:bottom-4">
            <Button variant="brand" size="xl" className="w-full shadow-lg" disabled={!formReady || uploading || blocking.length > 0} onClick={() => setStep('recap')}>
              {uploading ? 'Envoi des photos…' : 'Continuer vers le récapitulatif'}
            </Button>
          </div>
        </>
      )}

      {step === 'recap' && (
        <>
          <Card title="Récapitulatif">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
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
              <dt className="text-ink-500">Photos</dt><dd>{photos.filter((p) => p.status === 'ok').length} jointe(s)</dd>
            </dl>
          </Card>

          {(alerts.length > 0 || blocking.length > 0) && (
            <Card title={unconfirmed.length ? `Confirmer ${unconfirmed.length} alerte(s)` : 'Alertes confirmées'}>
              <WarningList warnings={warnings} confirmed={confirmed} onToggle={toggle} />
            </Card>
          )}

          {submitError && !submitError.requiresConfirmation && (
            submitError.offline
              ? <Alert tone="warning" title="Réseau indisponible">La saisie est conservée. Appuyer à nouveau sur « Valider » quand le réseau revient : le bon ne sera pas enregistré deux fois.</Alert>
              : <ErrorBox error={submitError} />
          )}
          {submitError?.requiresConfirmation && <Alert tone="warning">De nouveaux contrôles sont apparus au moment de la validation (autre opération sur la citerne). Les vérifier puis valider.</Alert>}

          <div className="sticky bottom-16 z-10 space-y-2 lg:bottom-4">
            <Button variant="brand" size="xl" className="w-full shadow-lg" loading={submitting}
              disabled={submitting || blocking.length > 0 || unconfirmed.length > 0 || uploading} onClick={submit}>
              VALIDER LE RAVITAILLEMENT
            </Button>
            <Button variant="secondary" className="w-full" disabled={submitting} onClick={() => setStep('saisie')}>Modifier la saisie</Button>
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
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 bg-ink-900 p-4 text-white">
        <div>
          <p className="text-3xl font-bold tracking-wide">{v.code_parc}</p>
          <p className="text-sm text-ink-300">{v.immatriculation} · {v.type_label ?? CATEGORY_LABEL[v.category]}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge color={scan.identified_by === 'qr' ? 'green' : 'amber'}>{scan.identified_by === 'qr' ? 'QR scanné' : 'Saisie manuelle'}</Badge>
          {v.status !== 'actif' && <Badge color="red">{STATUS_LABEL[v.status]}</Badge>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-500">Chantier</dt><dd className="font-medium">{v.site?.name ?? '—'}</dd></div>
        <div><dt className="text-ink-500">Shift</dt><dd className="font-medium">{scan.shift?.name ?? '—'}</dd></div>
        <div><dt className="text-ink-500">Citerne</dt><dd className="font-medium">{scan.tank.code}</dd></div>
        <div><dt className="text-ink-500">Stock</dt><dd className="font-medium">{scan.tank.stock_l != null ? litres(scan.tank.stock_l) : '—'}</dd></div>
      </dl>
      <div className="border-t border-ink-100 px-4 py-2 text-right">
        <button className="text-sm font-semibold text-brand-700" onClick={onChange}>Changer de véhicule</button>
      </div>
    </div>
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
        <p className="text-sm">Proposé automatiquement : <span className="text-base font-semibold">{scan.driver.name}</span></p>
      )}
      {scan.assignment_status === 'ambigu' && <Alert tone="warning">Plusieurs conducteurs sont affectés : sélectionner celui présent.</Alert>}
      {scan.assignment_status === 'aucune' && <Alert tone="warning">Aucun conducteur affecté à ce véhicule pour ce shift.</Alert>}

      {scan.candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scan.candidates.map((c) => {
            const active = value ? String(c.driver_id) === value : scan.driver?.id === c.driver_id && scan.assignment_status === 'ok'
            return (
              <button key={c.assignment_id} type="button" onClick={() => { setOther(false); onChange(String(c.driver_id), '') }}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/30' : 'border-ink-200 bg-white'}`}>
                <span className="block font-semibold">{c.driver_name}</span>
                <span className="text-xs text-ink-500">Équipe {c.team_slot}{c.is_replacement ? ' · remplaçant' : ''}</span>
              </button>
            )
          })}
        </div>
      )}

      {!other ? (
        <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setOther(true)}>Autre conducteur (remplaçant non prévu)…</button>
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
    <Card title="Recherche par code de parc" actions={<Button size="sm" variant="ghost" onClick={onCancel}>Revenir au scan</Button>}>
      <input className="input input-lg uppercase" autoFocus placeholder="D222, E81, immatriculation…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3">
        {loading && <Spinner className="mx-auto h-5 w-5 text-ink-400" />}
        <ul className="divide-y divide-ink-100">
          {list.map((v) => (
            <li key={v.id}>
              <button className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => onPick(v)}>
                <span><span className="text-lg font-bold">{v.code_parc}</span> <span className="text-sm text-ink-500">{v.immatriculation}</span>
                  <span className="block text-xs text-ink-500">{v.type_label} · {v.site?.name}</span></span>
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
