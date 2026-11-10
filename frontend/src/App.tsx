import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { UpdatePrompt } from './components/PwaPrompts'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { Role } from './lib/types'
import LoginPage from './pages/LoginPage'
import RefuelPage from './pages/RefuelPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RefuelsPage = lazy(() => import('./pages/RefuelsPage'))
const RefuelDetailPage = lazy(() => import('./pages/RefuelDetailPage'))
const TanksPage = lazy(() => import('./pages/TanksPage'))
const TankDetailPage = lazy(() => import('./pages/TanksPage').then((m) => ({ default: m.TankDetailPage })))
const DeliveriesPage = lazy(() => import('./pages/DeliveriesPage'))
const InventoriesPage = lazy(() => import('./pages/InventoriesPage'))
const QrCodesPage = lazy(() => import('./pages/QrCodesPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const AnomaliesPage = lazy(() => import('./pages/AnomaliesPage'))
const ReferencePage = lazy(() => import('./pages/ReferencePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e: any) => n < 2 && (e?.status ?? 0) >= 500 || (e?.offline && n < 2), staleTime: 15_000, refetchOnWindowFocus: false } },
})

/** Contrôle d'affichage uniquement : chaque appel est de toute façon autorisé par le serveur. */
function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/connexion" state={{ from: loc.pathname }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

const ALL: Role[] = ['admin', 'responsable_site', 'pompiste']
const MANAGERS: Role[] = ['admin', 'responsable_site']

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/connexion" element={<LoginPage />} />
              <Route element={<Guard><Layout /></Guard>}>
                <Route index element={<DashboardPage />} />
                <Route path="ravitaillement" element={<Guard roles={['admin', 'pompiste']}><RefuelPage /></Guard>} />
                <Route path="scan/:token" element={<Guard roles={['admin', 'pompiste']}><RefuelPage /></Guard>} />
                <Route path="bons" element={<Guard roles={ALL}><RefuelsPage /></Guard>} />
                <Route path="bons/:id" element={<Guard roles={ALL}><RefuelDetailPage /></Guard>} />
                <Route path="citernes" element={<TanksPage />} />
                <Route path="citernes/:id" element={<TankDetailPage />} />
                <Route path="entrees" element={<DeliveriesPage />} />
                <Route path="inventaires" element={<InventoriesPage />} />
                <Route path="anomalies" element={<Guard roles={MANAGERS}><AnomaliesPage /></Guard>} />
                <Route path="rapports" element={<Guard roles={MANAGERS}><ReportsPage /></Guard>} />
                <Route path="qr-codes" element={<Guard roles={['admin']}><QrCodesPage /></Guard>} />
                <Route path="referentiel" element={<Guard roles={['admin']}><ReferencePage /></Guard>} />
                <Route path="parametres" element={<Guard roles={['admin']}><SettingsPage /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
          <UpdatePrompt />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
