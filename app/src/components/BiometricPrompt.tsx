import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { Button } from './Button'
import { Icon } from './Icon'
import { Overlay } from './Overlay'
import { useToast } from './Toast'
import {
  fetchLoginOptions,
  fetchRegisterOptions,
  rememberCredential,
  startAssertion,
  kindLabel,
  startRegistration,
  submitRegistration,
  webauthnErrorMessage,
  type LoginOptions,
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
  // Browser melaporkan perangkat ini sudah memegang kunci untuk akun Anda (mis. didaftarkan dari browser lain).
  const [known, setKnown] = useState<LoginOptions | null>(null)

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
        if (e instanceof DOMException && e.name === 'InvalidStateError') {
          setError('')
          fetchLoginOptions()
            .then(setKnown)
            .catch(() =>
              setError(
                'Perangkat ini sudah memegang kunci untuk akun Anda, tetapi pengenalan gagal disiapkan. Coba lagi.',
              ),
            )
          return
        }
        setError(webauthnErrorMessage(e))
        fetchRegisterOptions()
          .then(setOpts)
          .catch(() => setOpts(null)) // tantangan sekali pakai: ambil yang baru
      })
      .finally(() => setBusy(false))
  }

  // Ketukan pengguna -> verifikasi biometrik atas kunci yang sudah ada -> ingat id-nya di perangkat ini.
  const recognize = () => {
    if (!known || !opts) return
    setBusy(true)
    setError('')
    let pending
    try {
      pending = startAssertion(known, opts.exclude)
    } catch (e) {
      setBusy(false)
      setError(webauthnErrorMessage(e))
      return
    }
    pending
      .then((a) => {
        rememberCredential(a.credentialId, biometric.kind, uid)
        refreshBiometric()
        onDone()
        onClose()
        toast('Perangkat dikenali. Login biometrik siap dipakai di perangkat ini.')
      })
      .catch((e: unknown) => {
        setError(webauthnErrorMessage(e))
        fetchLoginOptions()
          .then(setKnown)
          .catch(() => setKnown(null))
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
          {known ? (
            <Button variant="primary" onClick={recognize} disabled={busy}>
              <Icon name={biometric.kind} />
              {busy ? 'Menunggu verifikasi…' : 'Kenali perangkat ini'}
            </Button>
          ) : (
            <Button variant="primary" onClick={enable} disabled={!opts || busy}>
              <Icon name={biometric.kind} />
              {busy ? 'Menunggu verifikasi…' : 'Aktifkan sekarang'}
            </Button>
          )}
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
      {known && (
        <div className="form-ok" role="status">
          Perangkat ini ternyata sudah memegang kunci biometrik untuk akun Anda (mungkin didaftarkan lewat
          browser lain di perangkat yang sama). Tekan <b>Kenali perangkat ini</b> lalu verifikasi, dan login
          biometrik langsung aktif di browser ini tanpa mendaftar lagi. Jika gagal, hapus perangkat lama di
          Profil Saya, lalu daftar ulang.
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Overlay>
  )
}
