import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'

export function AccessDenied() {
  return (
    <Card flush>
      <EmptyState icon="shield" title="Akses ditolak">
        Role Anda belum memiliki izin untuk membuka halaman ini. Hubungi atasan Anda bila Anda membutuhkannya.
      </EmptyState>
    </Card>
  )
}
