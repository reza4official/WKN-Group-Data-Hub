import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { BiometricEnable } from '../components/BiometricPrompt'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { PasswordInput } from '../components/PasswordInput'
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
import { changeMyPassword, saveProfile } from '../lib/profile'
import { formatWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'

/** Profil Saya: data diri (tersinkron ke Database Karyawan), ganti password, dan login biometrik. */
export function ProfilePage() {
  const { state, biometric, refreshBiometric, refreshProfile } = useAuth()
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

  const me = state.status === 'in' ? state.profile : null
  const roleName = state.status === 'in' ? state.roleName : ''

  return (
    <>
      {me && (
        <PersonalData
          key={`${me.name}|${me.phone}|${me.emailContact}`}
          me={me}
          roleName={roleName}
          onSaved={refreshProfile}
        />
      )}
      {me && <PasswordCard username={me.username} />}
      <Card
        title="Login biometrik"
        subtitle="Masuk dengan sidik jari, wajah, atau kunci layar perangkat tanpa mengetik password."
        actions={
          biometric.supported &&
          !biometric.enabledHere && (
            <Button data-guide="pf-bio" variant="primary" size="sm" onClick={() => setShowEnable(true)}>
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
      {showEnable && <BiometricEnable onClose={() => setShowEnable(false)} onDone={() => creds.reload()} />}
    </>
  )
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? (p[p.length - 1][0] ?? '') : '')).toUpperCase()
}

function PersonalData({
  me,
  roleName,
  onSaved,
}: {
  me: { username: string; name: string; phone: string; emailContact: string }
  roleName: string
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [name, setName] = useState(me.name)
  const [phone, setPhone] = useState(me.phone)
  const [email, setEmail] = useState(me.emailContact)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty =
    name.trim() !== me.name || phone.trim() !== me.phone || email.trim().toLowerCase() !== me.emailContact

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Nama wajib diisi.')
    setBusy(true)
    setError('')
    try {
      const changed = await saveProfile({ name, phone, emailContact: email }, me)
      await onSaved()
      toast(
        changed.length ? 'Data diri disimpan dan sudah tampil di Database Karyawan.' : 'Tidak ada perubahan.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Data diri"
      subtitle={`@${me.username} · ${roleName}`}
      actions={
        <span className="av" aria-hidden="true">
          {initials(me.name)}
        </span>
      }
    >
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid2">
          <div className="field">
            <label htmlFor="pf-name">Nama</label>
            <input
              id="pf-name"
              className="in"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="pf-phone">No. HP</label>
            <input
              id="pf-phone"
              className="in"
              value={phone}
              maxLength={40}
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-email">Email</label>
          <input
            id="pf-email"
            className="in"
            type="email"
            value={email}
            maxLength={200}
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <div className="hint">
            Email kontak ini juga dipakai untuk Login Google dan harus unik. Mengubahnya memindahkan hak masuk
            Google ke email baru.
          </div>
        </div>
        <div className="hint">
          Username dan role tidak dapat diubah di sini; hubungi atasan Anda. Perubahan langsung tampil di
          Database Karyawan beserta pengubah dan waktunya.
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div>
          <Button data-guide="pf-save" type="submit" variant="primary" disabled={busy || !dirty}>
            {busy ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordCard({ username }: { username: string }) {
  const { toast } = useToast()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!cur) return setError('Masukkan password lama Anda.')
    if (next.length < 6) return setError('Password baru minimal 6 karakter.')
    if (next !== again) return setError('Konfirmasi password baru tidak sama.')
    setBusy(true)
    setError('')
    try {
      await changeMyPassword(username, cur, next)
      setCur('')
      setNext('')
      setAgain('')
      toast('Password diganti. Gunakan password baru saat masuk berikutnya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Ganti password"
      subtitle="Satu-satunya aturan: minimal 6 karakter. Perangkat dan sesi Anda tetap masuk."
    >
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <PasswordInput
          label="Password lama"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          autoComplete="current-password"
        />
        <div className="grid2">
          <PasswordInput
            label="Password baru"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Ulangi password baru"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div>
          <Button data-guide="pf-password" type="submit" variant="primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Ganti password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
