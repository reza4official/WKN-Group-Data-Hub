import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { useAuth } from './auth/context'
import { configMissing, useEmulator } from './config'
import { AppShell } from './layout/AppShell'
import { accessibleRoutes, canAccess, findRoute } from './layout/routes'
import { useHashRoute } from './lib/useHashRoute'
import { AccessDenied } from './pages/AccessDenied'
import { LoginPage } from './pages/LoginPage'
import { AuditPage } from './pages/AuditPage'
import { ProfilePage } from './pages/ProfilePage'
import { BiometricPrompt } from './components/BiometricPrompt'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { IOPage } from './pages/IOPage'
import { InventoryPage } from './pages/InventoryPage'
import { BackupPage } from './pages/BackupPage'
import { CatalogPage } from './pages/CatalogPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ResetsPage } from './pages/ResetsPage'
import { RolesPage } from './pages/RolesPage'
import { UsersPage } from './pages/UsersPage'
import { ConfigMissingScreen, ErrorScreen, Splash } from './pages/StatusScreens'

/** Halaman yang sudah dibangun; menu lain memakai halaman kerangka. */
type PageProps = { param?: string }
const PAGES: Record<string, (p: PageProps) => ReactElement> = {
  users: UsersPage,
  roles: RolesPage,
  resets: ResetsPage,
  audit: AuditPage,
  catalog: CatalogPage,
  inventory: InventoryPage,
  dashboard: DashboardPage,
  io: IOPage,
  backup: BackupPage,
  employees: EmployeesPage,
  projects: ProjectsPage,
  profil: ProfilePage,
}

// Galeri hanya ada di mode pengembangan; pada build produksi cabang ini dibuang.
const Gallery = import.meta.env.DEV ? lazy(() => import('./pages/Gallery')) : null

export default function App() {
  const { state, logout, retry, bioPrompt } = useAuth()
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

  // Alamat dapat berparameter: #projects/<id>
  const [base, param] = hash.split('/')
  const requested = findRoute(base)
  const route = requested ?? routes[0] ?? findRoute('profil')!
  const allowed = canAccess(route, state.perms)
  return (
    <AppShell routes={routes} current={route.id} title={route.label}>
      {bioPrompt && <BiometricPrompt />}
      {allowed ? (
        PAGES[route.id] ? (
          createElement(route.id === 'projects' && param ? ProjectDetailPage : PAGES[route.id], { param })
        ) : (
          <PlaceholderPage route={route} />
        )
      ) : (
        <AccessDenied />
      )}
    </AppShell>
  )
}
