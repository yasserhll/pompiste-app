import { motion } from 'framer-motion'
import { BarChart3, Droplets, Lock, Mail, QrCode, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, ErrorBox } from '../components/ui'
import { InstallButton } from '../components/PwaPrompts'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: QrCode, title: 'Scan QR des véhicules', text: 'Le véhicule, son chantier et son conducteur sont reconnus instantanément.' },
  { icon: ShieldCheck, title: 'Contrôles automatiques', text: 'Séries, compteurs, stock et doublons vérifiés à chaque bon.' },
  { icon: BarChart3, title: 'Rapports par citerne', text: 'Le rapport Excel se construit seul, depuis la base de données.' },
]

export default function LoginPage() {
  const { user, login } = useAuth()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (user) {
    const from = (loc.state as { from?: string } | null)?.from
    return <Navigate to={from ?? (user.role === 'pompiste' ? '/ravitaillement' : '/')} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await login(email.trim(), password) } catch (err) { setError(err) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      {/* Panneau de marque */}
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grid" />
        <motion.div className="pointer-events-none absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-brand-600/35 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="pointer-events-none absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-fuel-500/25 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuel-400 to-fuel-600 text-navy-950 shadow-glow-fuel"><Droplets size={22} strokeWidth={2.4} /></div>
          <div><p className="text-lg font-bold tracking-tight">Pompiste</p><p className="text-xs uppercase tracking-widest text-ink-400">Gestion du gasoil</p></div>
        </div>

        <div className="relative max-w-lg">
          <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-4xl font-bold leading-tight tracking-tight">
            Chaque litre distribué,<br /><span className="bg-gradient-to-r from-fuel-300 to-fuel-500 bg-clip-text text-transparent">tracé et contrôlé.</span>
          </motion.h2>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.li key={f.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.12 }} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15"><f.icon size={20} /></span>
                <div><p className="font-semibold">{f.title}</p><p className="mt-0.5 text-sm text-ink-400">{f.text}</p></div>
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-500">Heure de référence : Africa/Casablanca</p>
      </aside>

      {/* Formulaire */}
      <main className="flex items-center justify-center bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+2rem)]">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuel-400 to-fuel-600 text-navy-950"><Droplets size={22} /></div>
            <p className="text-lg font-bold">Pompiste</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
          <p className="mt-1 text-sm text-ink-500">Accédez à votre espace pompiste ou gestion.</p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Adresse email</span>
              <span className="relative block"><Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input h-12 pl-10" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@entreprise.ma" /></span>
            </label>
            <label className="block">
              <span className="label">Mot de passe</span>
              <span className="relative block"><Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input h-12 pl-10" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></span>
            </label>
            <ErrorBox error={error} />
            <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>Se connecter</Button>
          </div>
          <div className="mt-6"><InstallButton /></div>
          <p className="mt-6 text-center text-xs text-ink-400">Compte fourni par l'administrateur. Accès limité à vos sites et citernes.</p>
        </motion.form>
      </main>
    </div>
  )
}
