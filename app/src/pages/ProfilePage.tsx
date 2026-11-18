import { useState } from 'react'
import { useAuth } from '../auth/context'
import { BiometricEnable } from '../components/BiometricPrompt'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Pill } from '../components/Pill'
import { useToast } from '../components/Toast'
import {
  forgetCredential,
  hasLocalBiometric,
  kindLabel,
  localBiometric,
  removeCredentialOnServer,
} from '../lib/biometric'
import { listMyCredentials } from '../lib/data'
import { formatWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'

/** Profil Saya. Saat ini memuat pengaturan login biometrik; ubah nama, HP, email, dan password hadir di v0.8.0. */
export function ProfilePage() {
  const { state, biometric, refreshBiometric } = useAuth()
  const { toast } = useToast()
  const uid = state.status === 'in' ? state.profile.uid : ''
  const creds = useLoad(() => listMyCredentials(uid), `creds:${uid}`)
  const [busy, setBusy] = useState('')
  const [showEnable, setShowEnable] = useState(false)
  const here = new Set(localBiometric().ids)
  const enabledForMe = hasLocalBiometric(uid)

  const remove = async (id: string, credentialId: string) => {
    setBusy(id)
    try {
      await removeCredentialOnServer(id)
      if (here.has(credentialId)) forgetCredential(credentialId)
      refreshBiometric()
      creds.reload()
      toast('Perangkat dihapus. Login biometrik di perangkat itu dinonaktifkan.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menghapus.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <Card
        title="Login biometrik"
        subtitle="Masuk dengan sidik jari, wajah, atau kunci layar perangkat tanpa mengetik password."
        actions={
          biometric.supported &&
          !biometric.enabledHere && (
            <Button variant="primary" size="sm" onClick={() => setShowEnable(true)}>
              <Icon name={biometric.kind} />
              Aktifkan di perangkat ini
            </Button>
          )
        }
      >
        {!biometric.supported && (
          <div className="hint" role="status">
            Perangkat atau browser ini belum mendukung login biometrik. Anda tetap bisa memakai perangkat lain
            yang mendukung.
          </div>
        )}
        {biometric.supported && enabledForMe && (
          <div style={{ marginBottom: 12 }}>
            <Pill tone="ok">Aktif di perangkat ini ({kindLabel(biometric.kind)})</Pill>
          </div>
        )}
        {creds.error ? (
          <EmptyState icon="alert" title="Daftar perangkat tidak dapat dimuat">
            {creds.error}
          </EmptyState>
        ) : creds.loading && !creds.data ? (
          <div className="muted">Memuat…</div>
        ) : (creds.data ?? []).length === 0 ? (
          <div className="muted">Belum ada perangkat yang terdaftar.</div>
        ) : (
          <div className="list">
            {(creds.data ?? []).map((c) => (
              <div className="li" key={c.id}>
                <span className="av" aria-hidden="true">
                  <Icon name={c.kind} />
                </span>
                <div className="g">
                  <b>{c.label}</b> {here.has(c.credentialId) && <Pill tone="blue">Perangkat ini</Pill>}
                  <div className="sm muted">
                    Didaftarkan {formatWita(c.createdAt)} · terakhir dipakai{' '}
                    {c.lastUsedAt ? formatWita(c.lastUsedAt) : 'belum pernah'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === c.id}
                  onClick={() => void remove(c.id, c.credentialId)}
                >
                  <Icon name="trash" />
                  Hapus
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          Peramban memakai biometrik atau kunci layar yang sudah Anda atur di perangkat; sistem tidak dapat
          memaksa jenis tertentu. Reset password oleh atasan otomatis mencabut semua perangkat.
        </p>
      </Card>
      <Card flush>
        <EmptyState icon="user" title="Pengaturan profil lainnya belum tersedia">
          Mengubah nama, no. HP, email, dan password hadir di v0.8.0.
        </EmptyState>
      </Card>
      {showEnable && <BiometricEnable onClose={() => setShowEnable(false)} onDone={() => creds.reload()} />}
    </>
  )
}
