import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, LoginError, type AuthApi, type AuthState } from './auth/context'
import { ROUTES, accessibleRoutes } from './layout/routes'
import { footerText } from './lib/version'

vi.mock('./config', () => ({
  configMissing: false,
  useEmulator: false,
  turnstileSiteKey: '',
  config: { apiUrl: '', firebase: {} },
}))
vi.mock('./lib/firebase', () => ({ auth: {}, db: {} }))

const ALL = new Set(ROUTES.flatMap((r) => r.perm ?? []))
const profile = {
  uid: 'u1',
  username: 'dev',
  name: 'Reza Dev',
  emailContact: 'r@x.com',
  roleId: 'dev',
  level: 100,
  projectIds: [],
}

function renderWith(state: AuthState, over: Partial<AuthApi> = {}) {
  const api: AuthApi = {
    state,
    loginWithPassword: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn(),
    ...over,
  }
  render(
    <AuthContext.Provider value={api}>
      <App />
    </AuthContext.Provider>,
  )
  return api
}

const signedIn = (perms: Set<string>, roleName = 'Developer'): AuthState => ({
  status: 'in',
  profile,
  roleName,
  perms,
})
const go = (hash: string) =>
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent ?? ''

describe('kerangka aplikasi (sudah masuk)', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('id rute unik', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length)
  })

  it('membuka halaman pertama yang boleh diakses dan menampilkan footer berversi', () => {
    renderWith(signedIn(ALL))
    expect(h1()).toContain('Dashboard')
    expect(screen.getByText(footerText())).toBeTruthy()
  })

  it('setiap menu membuka halaman dengan judul yang sesuai', () => {
    renderWith(signedIn(ALL))
    for (const r of ROUTES) {
      go(r.id)
      expect(h1()).toContain(r.label)
      expect(screen.getByRole('link', { name: r.label }).getAttribute('aria-current')).toBe('page')
    }
  })

  it('menu hanya menampilkan halaman sesuai izin role', () => {
    const lowPerms = new Set(['dashboard', 'inventory.read'])
    renderWith(signedIn(lowPerms, 'Admin Logistik / Gudang'))
    const labels = accessibleRoutes(lowPerms).map((r) => r.label)
    expect(labels).toEqual(['Dashboard', 'Transaksi Stok', 'Proyek & Perusahaan', 'Profil Saya'])
    expect(screen.queryByRole('link', { name: 'Akun Pengguna' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Log Audit' })).toBeNull()
  })

  it('membuka alamat halaman terlarang menampilkan Akses ditolak', () => {
    renderWith(signedIn(new Set(['dashboard'])))
    go('users')
    expect(screen.getByText('Akses ditolak')).toBeTruthy()
  })

  it('rute tak dikenal kembali ke halaman pertama yang boleh diakses', () => {
    renderWith(signedIn(ALL))
    go('tidak-ada')
    expect(h1()).toContain('Dashboard')
  })

  it('kartu pengguna menampilkan nama dan role, dan tombol Keluar memanggil logout', () => {
    const api = renderWith(signedIn(ALL))
    expect(screen.getByText('Reza Dev')).toBeTruthy()
    expect(screen.getByText('Developer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }))
    expect(api.logout).toHaveBeenCalled()
  })
})

describe('keadaan sebelum masuk', () => {
  it('memuat: menampilkan Memuat', () => {
    renderWith({ status: 'loading' })
    expect(screen.getByText('Memuat…')).toBeTruthy()
  })

  it('belum login: menampilkan form login dan footer', () => {
    renderWith({ status: 'out' })
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Masuk dengan Google/ })).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByText(footerText())).toBeTruthy()
  })

  it('form login mengirim username dan password apa adanya', () => {
    const api = renderWith({ status: 'out' })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Budi Santoso' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(api.loginWithPassword).toHaveBeenCalledWith('Budi Santoso', 'abc123')
  })

  it('kesalahan login ditampilkan', async () => {
    renderWith(
      { status: 'out' },
      { loginWithPassword: vi.fn().mockRejectedValue(new LoginError('Username atau password salah.')) },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByText('Username atau password salah.')).toBeTruthy()
  })

  it('pesan penolakan (mis. akun nonaktif) tampil di form login', () => {
    renderWith({ status: 'out', message: 'Akun ini dinonaktifkan. Hubungi atasan Anda.' })
    expect(screen.getByText('Akun ini dinonaktifkan. Hubungi atasan Anda.')).toBeTruthy()
  })

  it('gangguan jaringan: pilihan coba lagi, bukan keluar paksa', () => {
    const api = renderWith({ status: 'error', message: 'Tidak dapat terhubung ke server.' })
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
    expect(api.retry).toHaveBeenCalled()
  })
})
