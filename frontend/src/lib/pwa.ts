import { useEffect, useState } from 'react'

// Installation de l'application (PWA).
//  - Android / Chrome / Edge : événement beforeinstallprompt → bouton « Installer ».
//  - iPhone / iPad (Safari) : pas d'événement → instructions « Partager → Sur l'écran d'accueil ».

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  const standalone = isStandalone()
  return {
    standalone,
    /** Installation native disponible (Android, Chrome, Edge). */
    canPrompt: !standalone && !!deferred,
    /** iPhone / iPad non installé : afficher les instructions. */
    needsIosHelp: !standalone && !deferred && isIOS(),
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}
