import { lazy, Suspense } from 'react'
import { AppShell } from './layout/AppShell'
import { DEFAULT_ROUTE, findRoute } from './layout/routes'
import { useHashRoute } from './lib/useHashRoute'
import { PlaceholderPage } from './pages/PlaceholderPage'

// Galeri hanya ada di mode pengembangan; pada build produksi cabang ini dibuang.
const Gallery = import.meta.env.DEV ? lazy(() => import('./pages/Gallery')) : null

export default function App() {
  const hash = useHashRoute()
  if (Gallery && hash === 'komponen') {
    return (
      <AppShell current="komponen" title="Galeri Komponen">
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      </AppShell>
    )
  }
  const route = findRoute(hash) ?? DEFAULT_ROUTE
  return (
    <AppShell current={route.id} title={route.label}>
      <PlaceholderPage route={route} />
    </AppShell>
  )
}
