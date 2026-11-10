import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Download, MoreVertical, PlusSquare, RefreshCw, Share, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useInstall } from '../lib/pwa'
import { store } from '../lib/util'
import { Button, Modal } from './ui'

/** Nouvelle version / prêt hors connexion. Le rechargement n'est jamais forcé (saisie en cours). */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie les mises à jour toutes les 30 min quand l'application reste ouverte
      if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
    },
  })
  const show = needRefresh || offlineReady
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] mx-auto max-w-md lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0">
          <div className="flex items-center gap-3 rounded-2xl bg-navy-900 p-3.5 pl-4 text-white shadow-2xl ring-1 ring-white/10">
            {needRefresh ? <RefreshCw size={20} className="shrink-0 text-brand-300" /> : <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />}
            <p className="min-w-0 flex-1 text-sm">{needRefresh ? 'Une nouvelle version est disponible.' : "L'application fonctionne maintenant hors connexion."}</p>
            {needRefresh && <Button size="sm" variant="brand" onClick={() => updateServiceWorker(true)}>Mettre à jour</Button>}
            <button aria-label="Fermer" className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10" onClick={() => { setNeedRefresh(false); setOfflineReady(false) }}><X size={16} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Bouton « Installer l'application » + aide iPhone. `variant` : carte (menu, connexion) ou bandeau (mobile). */
export function InstallButton({ variant = 'card' }: { variant?: 'card' | 'banner' | 'dark' }) {
  const install = useInstall()
  const [help, setHelp] = useState(false)
  const [hidden, setHidden] = useState(() => store.get('pompiste.install.hidden', false))
  if (install.standalone || (!install.canPrompt && !install.needsIosHelp)) return null

  const onClick = async () => {
    if (install.canPrompt) await install.prompt()
    else setHelp(true)
  }

  const modal = (
    <Modal open={help} onClose={() => setHelp(false)} title="Installer sur l'iPhone" icon={Smartphone}>
      <ol className="space-y-4 text-sm text-ink-700">
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
          <span>Ouvrir cette page dans <b>Safari</b>, puis toucher le bouton <b>Partager</b> <Share size={16} className="inline -translate-y-0.5 text-brand-600" /> en bas de l'écran.</span></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
          <span>Choisir <b>Sur l'écran d'accueil</b> <PlusSquare size={16} className="inline -translate-y-0.5 text-brand-600" />.</span></li>
        <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">3</span>
          <span>Toucher <b>Ajouter</b>. L'icône « Pompiste » apparaît : l'application s'ouvre en plein écran, comme une application normale.</span></li>
      </ol>
      <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-500">Sur Android : menu <MoreVertical size={13} className="inline" /> de Chrome → <b>Installer l'application</b>.</p>
    </Modal>
  )

  if (variant === 'banner') {
    if (hidden) return null
    return (
      <>
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 p-3.5 text-white shadow-glow lg:hidden">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Smartphone size={20} /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Installer l'application</p><p className="text-xs text-brand-100">Accès direct depuis l'écran d'accueil, plein écran.</p></div>
          <Button size="sm" variant="secondary" onClick={onClick}>Installer</Button>
          <button aria-label="Masquer" className="rounded-lg p-1 text-brand-100 hover:bg-white/10" onClick={() => { setHidden(true); store.set('pompiste.install.hidden', true) }}><X size={16} /></button>
        </motion.div>
        {modal}
      </>
    )
  }

  return (
    <>
      <button onClick={onClick} className={variant === 'dark'
        ? 'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/10'
        : 'flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left text-sm font-semibold text-ink-800 shadow-sm transition hover:border-brand-300 hover:bg-brand-50'}>
        <Download size={18} className={variant === 'dark' ? 'text-fuel-400' : 'text-brand-600'} />
        <span className="flex-1">Installer l'application</span>
      </button>
      {modal}
    </>
  )
}
