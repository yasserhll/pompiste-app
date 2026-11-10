import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, ErrorBox, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'

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
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold">Gestion du gasoil</h1>
            <p className="text-sm text-ink-500">Connexion pompiste / gestion</p>
          </div>
        </div>
        <Field label="Email"><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mot de passe"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>Se connecter</Button>
      </form>
    </div>
  )
}
