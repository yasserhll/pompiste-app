import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
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
      { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s } }, aspectRatio: 1 },
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
    return () => {
      if (qr.isScanning) qr.stop().catch(() => {})
    }
  }, [onResult])

  const toggleTorch = async () => {
    if (!ref.current || torch === null) return
    try {
      await ref.current.applyVideoConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch { /* ignoré */ }
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-ink-950">
        <div id="qr-reader" className="h-full w-full" />
        {!running && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-300">Ouverture de la caméra…</p>}
      </div>
      {torch !== null && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={toggleTorch}>{torch ? 'Éteindre la lampe' : 'Allumer la lampe'}</Button>
        </div>
      )}
      {error && <Alert tone="warning">{error}</Alert>}
    </div>
  )
}
