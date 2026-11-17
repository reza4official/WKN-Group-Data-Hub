import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Pill } from '../components/Pill'
import type { RouteDef } from '../layout/routes'

/** Halaman kerangka: menjelaskan fungsi menu dan kapan fitur ini hadir. */
export function PlaceholderPage({ route }: { route: RouteDef }) {
  return (
    <Card flush>
      <EmptyState icon={route.icon} title={`${route.label} belum tersedia`}>
        {route.description}
      </EmptyState>
      <div className="empty" style={{ paddingTop: 0 }}>
        <Pill tone="blue">Direncanakan di {route.arrives}</Pill>
      </div>
    </Card>
  )
}
