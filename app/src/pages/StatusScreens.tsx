import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Logo } from '../components/Logo'
import { Footer } from '../layout/Footer'
import type { ReactNode } from 'react'

function Center({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="center-screen">{children}</div>
      <Footer />
    </>
  )
}

export function Splash() {
  return (
    <Center>
      <div className="splash" role="status" aria-live="polite">
        <Logo variant="full" width={200} />
        <div className="muted">Memuat…</div>
      </div>
    </Center>
  )
}

export function ErrorScreen({
  message,
  onRetry,
  onLogout,
}: {
  message: string
  onRetry: () => void
  onLogout: () => void
}) {
  return (
    <Center>
      <div style={{ width: 'min(520px, 100%)' }}>
        <Card flush>
          <EmptyState icon="alert" title="Tidak dapat melanjutkan">
            {message}
          </EmptyState>
          <div className="empty" style={{ paddingTop: 0, flexDirection: 'row', justifyContent: 'center' }}>
            <Button variant="primary" onClick={onRetry}>
              Coba lagi
            </Button>
            <Button onClick={onLogout}>Keluar</Button>
          </div>
        </Card>
      </div>
    </Center>
  )
}

export function ConfigMissingScreen() {
  return (
    <Center>
      <div style={{ width: 'min(560px, 100%)' }}>
        <Card flush>
          <EmptyState icon="alert" title="Konfigurasi Firebase belum diisi">
            Isi nilai bertanda GANTI di <code>app/src/config/public-config.json</code> (lihat
            docs/PERSIAPAN-TAHAP-2.md), atau jalankan dengan emulator.
          </EmptyState>
        </Card>
      </div>
    </Center>
  )
}
