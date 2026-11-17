import { lazy, Suspense } from 'react'
import { useAuth } from './auth/context'
import { configMissing, useEmulator } from './config'
import { AppShell } from './layout/AppShell'
import { accessibleRoutes, canAccess, findRoute } from './layout/routes'
import { useHashRoute } from './lib/useHashRoute'
import { AccessDenied } from './pages/AccessDenied'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ConfigMissingScreen, ErrorScreen, Splash } from './pages/StatusScreens'

// Galeri hanya ada di mode pengembangan; pada build produksi cabang ini dibuang.
const Gallery = import.meta.env.DEV ? lazy(() => import('./pages/Gallery')) : null

export default function App() {
  const { state, logout, retry } = useAuth()
  const hash = useHashRoute()

  if (configMissing && !useEmulator) return <ConfigMissingScreen />
  if (state.status === 'loading') return <Splash />
  if (state.status === 'error')
    return <ErrorScreen message={state.message} onRetry={retry} onLogout={() => void logout()} />
  if (state.status === 'out') return <LoginPage notice={state.message} />

  const routes = accessibleRoutes(state.perms)

  if (Gallery && hash === 'komponen') {
    return (
      <AppShell routes={routes} current="komponen" title="Galeri Komponen">
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      </AppShell>
    )
  }

  const requested = findRoute(hash)
  const route = requested ?? routes[0] ?? findRoute('profil')!
  const allowed = canAccess(route, state.perms)
  return (
    <AppShell routes={routes} current={route.id} title={route.label}>
      {allowed ? <PlaceholderPage route={route} /> : <AccessDenied />}
    </AppShell>
  )
}
