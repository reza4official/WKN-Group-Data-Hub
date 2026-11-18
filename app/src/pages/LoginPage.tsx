import { useState, type FormEvent } from 'react'
import { LoginError, useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { PasswordInput } from '../components/PasswordInput'
import { Footer } from '../layout/Footer'
import { Overlay } from '../components/Overlay'
import { Turnstile } from '../components/Turnstile'
import { turnstileSiteKey } from '../config'
import { requestPasswordReset } from '../lib/api'

export function LoginPage({ notice }: { notice?: string }) {
  const { loginWithPassword, loginWithGoogle } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'' | 'password' | 'google'>('')
  const [resetOpen, setResetOpen] = useState(false)

  const run = async (kind: 'password' | 'google', fn: () => Promise<void>) => {
    setError('')
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof LoginError ? e.message : 'Tidak dapat masuk. Coba lagi.')
    } finally {
      setBusy('')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run('password', () => loginWithPassword(username, password))
  }

  return (
    <>
      <div className="login">
        <section className="hero">
          <Logo variant="full" width={260} />
          <h1>
            Satu pusat data untuk seluruh proyek dan anak perusahaan <span className="mark">WKN</span>.
          </h1>
          <p>
            Pantau stok bahan dan material tiap proyek jalan dan jembatan, lengkap dengan jejak siapa yang
            mencatat dan kapan.
          </p>
        </section>
        <section className="card lbox">
          <div>
            <h2 className="ttl">Masuk ke akun</h2>
            <div className="hint">Gunakan akun yang dibuatkan atasan Anda.</div>
          </div>
          {notice && !error && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          <form className="stack" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className="in"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
            </div>
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              autoComplete="current-password"
            />
            {error && (
              <div className="err" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" disabled={busy !== ''}>
              {busy === 'password' ? 'Memeriksa…' : 'Masuk'}
            </Button>
            <div className="sep">atau</div>
            <Button disabled={busy !== ''} onClick={() => void run('google', loginWithGoogle)}>
              <GoogleMark />
              {busy === 'google' ? 'Membuka Google…' : 'Masuk dengan Google'}
            </Button>
          </form>
          {turnstileSiteKey ? (
            <Button size="sm" onClick={() => setResetOpen(true)} style={{ alignSelf: 'flex-start' }}>
              Lupa password? Minta reset ke atasan
            </Button>
          ) : (
            <div className="hint">Lupa password? Hubungi atasan Anda untuk mereset password.</div>
          )}
        </section>
      </div>
      {resetOpen && <ResetRequestModal siteKey={turnstileSiteKey} onClose={() => setResetOpen(false)} />}
      <Footer />
    </>
  )
}

function GoogleMark() {
  return (
    <svg className="i" viewBox="0 0 24 24" style={{ stroke: 'none' }} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"
      />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2z" />
      <path
        fill="#EA4335"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"
      />
    </svg>
  )
}

function ResetRequestModal({ siteKey, onClose }: { siteKey: string; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return setError('Username wajib diisi.')
    if (!token) return setError('Selesaikan verifikasi bot terlebih dahulu.')
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(username.trim(), token)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay
      title="Minta reset password"
      onClose={onClose}
      footer={
        sent ? (
          <Button variant="primary" onClick={onClose}>
            Tutup
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Batal</Button>
            <Button type="submit" variant="primary" form="f-reqreset" disabled={busy}>
              {busy ? 'Mengirim…' : 'Kirim permintaan'}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p style={{ margin: 0 }} role="status">
          Jika akun itu ada dan memiliki atasan, permintaan sudah diteruskan ke semua atasan Anda. Siapa pun
          dari mereka dapat mengeksekusinya, dan tercatat siapa serta kapan. Hubungi atasan Anda untuk
          menerima password baru.
        </p>
      ) : (
        <form id="f-reqreset" className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <div className="hint">
            Permintaan dikirim ke semua atasan Anda. Siapa pun dari mereka dapat mengeksekusinya.
          </div>
          <div className="field">
            <label htmlFor="rr-un">Username</label>
            <input
              id="rr-un"
              className="in"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
            />
          </div>
          <Turnstile siteKey={siteKey} onToken={setToken} onError={setError} />
          {error && (
            <div className="err" role="alert">
              {error}
            </div>
          )}
        </form>
      )}
    </Overlay>
  )
}
