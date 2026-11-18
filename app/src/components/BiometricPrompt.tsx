import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { Button } from './Button'
import { Icon } from './Icon'
import { Overlay } from './Overlay'
import { useToast } from './Toast'
import {
  fetchRegisterOptions,
  kindLabel,
  startRegistration,
  submitRegistration,
  webauthnErrorMessage,
  type RegisterOptions,
} from '../lib/biometric'

/**
 * Ajakan mengaktifkan login biometrik setelah login awal. Dapat dilewati. Tantangan diambil saat
 * jendela dibuka, sehingga tombol Aktifkan langsung memanggil WebAuthn dari ketukan (syarat Safari/iOS).
 */
export function BiometricPrompt() {
  const { dismissBioPrompt } = useAuth()
  return (
    <BiometricEnable
      onClose={dismissBioPrompt}
      onDone={dismissBioPrompt}
      title="Aktifkan login biometrik?"
      skippable
    />
  )
}

/** Jendela pengaktifan (dipakai oleh ajakan saat login dan oleh Profil Saya). */
export function BiometricEnable({
  onClose,
  onDone,
  title = 'Aktifkan login biometrik',
  skippable = false,
}: {
  onClose: () => void
  onDone: () => void
  title?: string
  skippable?: boolean
}) {
  const { biometric, refreshBiometric, state } = useAuth()
  const uid = state.status === 'in' ? state.profile.uid : ''
  const { toast } = useToast()
  const [opts, setOpts] = useState<RegisterOptions | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRegisterOptions()
      .then((o) => !cancelled && setOpts(o))
      .catch(
        (e: unknown) =>
          !cancelled && setError(e instanceof Error ? e.message : 'Tidak dapat menyiapkan biometrik.'),
      )
    return () => {
      cancelled = true
    }
  }, [])

  const enable = () => {
    if (!opts) return
    setBusy(true)
    setError('')
    let pending
    try {
      pending = startRegistration(opts, biometric.kind) // sinkron dari ketukan
    } catch (e) {
      setBusy(false)
      setError(webauthnErrorMessage(e))
      return
    }
    pending
      .then((payload) => submitRegistration(payload, uid))
      .then(() => {
        refreshBiometric()
        onDone()
        onClose()
        toast('Login biometrik diaktifkan di perangkat ini.')
      })
      .catch((e: unknown) => {
        setError(webauthnErrorMessage(e))
        fetchRegisterOptions()
          .then(setOpts)
          .catch(() => setOpts(null)) // tantangan sekali pakai: ambil yang baru
      })
      .finally(() => setBusy(false))
  }

  return (
    <Overlay
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{skippable ? 'Lewati' : 'Batal'}</Button>
          <Button variant="primary" onClick={enable} disabled={!opts || busy}>
            <Icon name={biometric.kind} />
            {busy ? 'Menunggu verifikasi…' : 'Aktifkan sekarang'}
          </Button>
        </>
      }
    >
      <div className="bio-hero" aria-hidden="true">
        <Icon name={biometric.kind} />
      </div>
      <p style={{ margin: 0 }}>
        Masuk berikutnya cukup dengan {kindLabel(biometric.kind)} atau kunci layar perangkat ini, tanpa
        mengetik password.
      </p>
      <p className="hint" style={{ margin: 0 }}>
        Perangkat ini akan terdaftar atas akun Anda. Peramban memakai biometrik atau kunci layar yang sudah
        Anda atur di perangkat. Dapat dinonaktifkan kapan saja di Profil Saya. Anda bisa melewati ini, dan
        kami akan menawarkannya lagi saat Anda masuk berikutnya.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Overlay>
  )
}
