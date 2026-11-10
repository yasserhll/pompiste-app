import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, Flashlight, FlashlightOff } from 'lucide-react'
import { Alert, Button } from './ui'

/**
 * Lecture QR par la caméra arrière (Android / iPhone). Exige HTTPS (ou localhost)
 * et l'autorisation de la caméra ; sinon, la recherche manuelle reste disponible.
 */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const ref = useRef<Html5Qrcode | null>(null)
  const done = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [torch, setTorch] = useState<boolean | null>(null)

  useEffect(() => {
    if (!window.isSecureContext) {
      setError('La caméra nécessite une connexion sécurisée (HTTPS). Utiliser la recherche par code de parc.')
      return
    }
    const qr = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false })
    ref.current = qr
    done.current = false
    qr.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s } }, aspectRatio: 1 },
      (text) => {
        if (done.current) return
        done.current = true
        if (navigator.vibrate) navigator.vibrate(80)
        qr.stop().catch(() => {}).finally(() => onResult(text))
      },
      () => {},
    ).then(() => {
      setRunning(true)
      try {
        const caps = qr.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean }
        if (caps.torch) setTorch(false)
      } catch { /* non supporté */ }
    }).catch((e: unknown) => {
      const msg = String((e as Error)?.message ?? e)
      setError(/Permission|NotAllowed/i.test(msg)
        ? "Accès à la caméra refusé. Autoriser la caméra dans les réglages du navigateur, ou utiliser la recherche manuelle."
        : 'Caméra indisponible sur cet appareil. Utiliser la recherche par code de parc.')
    })
    return () => { if (qr.isScanning) qr.stop().catch(() => {}) }
  }, [onResult])

  const toggleTorch = async () => {
    if (!ref.current || torch === null) return
    try {
      await ref.current.applyVideoConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch { /* ignoré */ }
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-[min(24rem,62dvh)] overflow-hidden rounded-3xl bg-navy-950 shadow-lift">
        <div id="qr-reader" className="h-full w-full [&_video]:h-full [&_video]:w-full" />
        {/* Cadre de visée */}
        <div className="pointer-events-none absolute inset-[15%]">
          {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl',
            'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-white ${c}`} />
          ))}
          {running && <span className="absolute inset-x-2 h-0.5 animate-scan-line rounded-full bg-gradient-to-r from-transparent via-fuel-400 to-transparent shadow-[0_0_12px_2px_rgba(251,191,36,.6)]" />}
        </div>
        {!running && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-300">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/40" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10"><Camera size={24} /></span>
            </span>
            <p className="text-sm">Ouverture de la caméra…</p>
          </div>
        )}
        {running && <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/80">Placer le QR code du véhicule dans le cadre</p>}
      </div>
      {torch !== null && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" icon={torch ? FlashlightOff : Flashlight} onClick={toggleTorch}>{torch ? 'Éteindre la lampe' : 'Allumer la lampe'}</Button>
        </div>
      )}
      {error && <Alert tone="warning">{error}</Alert>}
    </div>
  )
}
