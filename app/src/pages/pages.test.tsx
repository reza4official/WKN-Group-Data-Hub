import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import type { AuditRow, ResetRequest, Role, UserRow } from '../lib/data'
import { AuditPage } from './AuditPage'
import { ResetsPage } from './ResetsPage'
import { RolesPage } from './RolesPage'
import { UsersPage } from './UsersPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  listRoles: vi.fn(),
  listUsersBelow: vi.fn(),
  listResetRequests: vi.fn(),
  listAudit: vi.fn(),
}))
vi.mock('../lib/api', () => ({
  api: mocks.api,
  requestPasswordReset: vi.fn(),
  ApiError: class extends Error {},
}))
vi.mock('../lib/data', () => ({
  listRoles: mocks.listRoles,
  listUsersBelow: mocks.listUsersBelow,
  listResetRequests: mocks.listResetRequests,
  listAudit: mocks.listAudit,
}))

const ALL = ['dashboard', 'inventory.read', 'users', 'roles', 'resets', 'audit', 'export']
const ROLES: Role[] = [
  { id: 'dev', name: 'Developer', level: 100, system: true, perms: ALL },
  { id: 'owner', name: 'Owner', level: 90, system: false, perms: ALL },
  {
    id: 'pm',
    name: 'Manajer Proyek',
    level: 50,
    system: false,
    perms: ['dashboard', 'inventory.read', 'users', 'resets', 'export'],
  },
  { id: 'aud', name: 'Auditor', level: 40, system: false, perms: ['audit'] },
  { id: 'log', name: 'Admin Logistik', level: 20, system: false, perms: ['dashboard', 'export'] },
]
const USERS: UserRow[] = [
  {
    id: 'u1',
    username: 'log1',
    name: 'Siti Gudang',
    phone: '0812',
    emailContact: 'siti@x.com',
    roleId: 'log',
    level: 20,
    disabled: false,
  },
  {
    id: 'u2',
    username: 'old',
    name: 'Budi Lama',
    phone: '',
    emailContact: '',
    roleId: 'log',
    level: 20,
    disabled: true,
  },
]

function as(roleId: string, level: number, perms: string[]): AuthApi {
  return {
    state: {
      status: 'in',
      profile: { uid: 'me', username: 'me', name: 'Saya', emailContact: '', roleId, level },
      roleName: roleId,
      perms: new Set(perms),
    },
    loginWithPassword: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  }
}
const wrap = (api: AuthApi, ui: ReactNode) =>
  render(
    <AuthContext.Provider value={api}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )
const pm = () => as('pm', 50, ROLES[2].perms)
const owner = () => as('owner', 90, ALL)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.mockResolvedValue({ ok: true })
  mocks.listRoles.mockResolvedValue(ROLES)
  mocks.listUsersBelow.mockResolvedValue(USERS)
  mocks.listResetRequests.mockResolvedValue([])
  mocks.listAudit.mockResolvedValue([])
})

describe('Akun Pengguna', () => {
  it('mengambil daftar hanya di bawah level pelaku dan menampilkannya', async () => {
    wrap(pm(), <UsersPage />)
    expect(await screen.findByText('Siti Gudang')).toBeTruthy()
    expect(mocks.listUsersBelow).toHaveBeenCalledWith(50)
    expect(screen.getByText('Nonaktif')).toBeTruthy()
  })

  it('role yang ditawarkan: di bawah level pelaku dan izinnya dimiliki pelaku', async () => {
    wrap(pm(), <UsersPage />)
    await screen.findByText('Siti Gudang')
    fireEvent.click(screen.getByRole('button', { name: /Tambah akun/ }))
    const select = (await screen.findByLabelText('Role')) as HTMLSelectElement
    const options = [...select.options].map((o) => o.textContent)
    expect(options).toEqual(['Admin Logistik (20)']) // Auditor (40) ditolak: izin audit tidak dimiliki Manajer Proyek
  })

  it('membuat akun mengirim data ke Worker dengan password apa adanya', async () => {
    wrap(owner(), <UsersPage />)
    await screen.findByText('Siti Gudang')
    fireEvent.click(screen.getByRole('button', { name: /Tambah akun/ }))
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'Budi Baru' } })
    fireEvent.change(screen.getByLabelText('Nama lengkap'), { target: { value: 'Budi' } })
    fireEvent.change(screen.getByLabelText('Password awal'), { target: { value: 'abc def' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat akun' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalled())
    expect(mocks.api).toHaveBeenCalledWith(
      '/users/create',
      expect.objectContaining({ username: 'Budi Baru', name: 'Budi', password: 'abc def', roleId: 'pm' }),
    )
    await waitFor(() => expect(mocks.listUsersBelow).toHaveBeenCalledTimes(2)) // dimuat ulang setelah sukses
  })

  it('pesan kesalahan dari server ditampilkan di dalam modal', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Username sudah dipakai.'))
    wrap(owner(), <UsersPage />)
    await screen.findByText('Siti Gudang')
    fireEvent.click(screen.getByRole('button', { name: /Tambah akun/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buat akun' }))
    expect(await screen.findByText('Username sudah dipakai.')).toBeTruthy()
  })

  it('reset password, nonaktifkan, dan hapus memanggil endpoint yang tepat', async () => {
    wrap(pm(), <UsersPage />)
    const row = (await screen.findByText('Siti Gudang')).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Reset password/ }))
    fireEvent.change(await screen.findByLabelText('Password baru'), { target: { value: 'rahasia9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan password baru' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/users/reset-password', { uid: 'u1', password: 'rahasia9' }),
    )

    fireEvent.click(within(row).getByRole('button', { name: 'Nonaktifkan' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/users/set-disabled', { uid: 'u1', disabled: true }),
    )

    fireEvent.click(within(row).getByRole('button', { name: 'Hapus log1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus akun' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/users/delete', { uid: 'u1' }))
  })

  it('pencarian menyaring daftar', async () => {
    wrap(pm(), <UsersPage />)
    await screen.findByText('Siti Gudang')
    fireEvent.change(screen.getByLabelText('Cari akun'), { target: { value: 'lama' } })
    expect(screen.queryByText('Siti Gudang')).toBeNull()
    expect(screen.getByText('Budi Lama')).toBeTruthy()
  })
})

describe('Role & Akses', () => {
  it('Owner dapat mengubah role di bawahnya; izin yang tidak dimiliki Owner tidak bisa dicentang', async () => {
    const limited = as('owner', 90, ['roles', 'users', 'dashboard'])
    wrap(limited, <RolesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Manajer Proyek/ }))
    const dash = screen.getByRole('checkbox', { name: /Lihat dashboard ringkasan/ }) as HTMLInputElement
    const exp = screen.getByRole('checkbox', { name: /Ekspor Excel\/PDF/ }) as HTMLInputElement
    expect(dash.disabled).toBe(false)
    expect(exp.disabled).toBe(true) // pelaku tidak punya izin export
  })

  it('menyimpan perubahan mengirim daftar izin baru', async () => {
    wrap(owner(), <RolesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Manajer Proyek/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lihat log audit/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalled())
    const [path, body] = mocks.api.mock.calls[0] as [string, { id: string; perms: string[] }]
    expect(path).toBe('/roles/update')
    expect(body.id).toBe('pm')
    expect(body.perms).toContain('audit')
  })

  it('role setara, di atas, dan role sistem hanya dapat dilihat', async () => {
    wrap(owner(), <RolesPage />)
    for (const name of [/^90Owner/, /^100Developer/]) {
      fireEvent.click(await screen.findByRole('button', { name }))
      expect(screen.queryByRole('button', { name: 'Simpan perubahan' })).toBeNull()
      for (const c of screen.getAllByRole('checkbox') as HTMLInputElement[]) expect(c.disabled).toBe(true)
    }
  })

  it('role baru: mengirim nama, level (angka), dan izin salinan yang dimiliki pelaku', async () => {
    mocks.api.mockResolvedValueOnce({ ok: true, id: 'r-baru' })
    wrap(
      as('owner', 90, ['roles', 'dashboard', 'inventory.read', 'users', 'resets', 'export']),
      <RolesPage />,
    )
    await screen.findByRole('button', { name: /Manajer Proyek/ })
    fireEvent.click(screen.getByRole('button', { name: /Role baru/ }))
    const dlg = within(screen.getByRole('dialog'))
    fireEvent.change(dlg.getByLabelText('Nama role'), { target: { value: 'Pengawas' } })
    fireEvent.change(dlg.getByLabelText(/Level/), { target: { value: '30' } })
    fireEvent.change(dlg.getByLabelText('Salin izin dari'), { target: { value: 'aud' } }) // izin 'audit' tidak dimiliki -> dibuang
    fireEvent.click(dlg.getByRole('button', { name: 'Buat role' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/roles/create', { name: 'Pengawas', level: 30, perms: [] }),
    )
  })
})

describe('Permintaan reset', () => {
  const REQS: ResetRequest[] = [
    {
      id: 'r1',
      targetUsername: 'log1',
      targetName: 'Siti Gudang',
      targetRoleId: 'log',
      requesterLevel: 20,
      status: 'pending',
      requestedAt: '2026-11-16T01:12:40Z',
      handledByName: null,
      handledByRole: null,
      handledAt: null,
    },
    {
      id: 'r2',
      targetUsername: 'old',
      targetName: 'Budi Lama',
      targetRoleId: 'log',
      requesterLevel: 20,
      status: 'done',
      requestedAt: '2026-11-12T05:05:11Z',
      handledByName: 'Hj. Nur',
      handledByRole: 'Direktur',
      handledAt: '2026-11-12T05:41:02Z',
    },
  ]
  it('menampilkan siapa, kapan (WITA), dan yang menangani; yang menunggu dapat dieksekusi', async () => {
    mocks.listResetRequests.mockResolvedValue(REQS)
    wrap(pm(), <ResetsPage />)
    expect(await screen.findByText(/Dieksekusi oleh/)).toBeTruthy()
    expect(screen.getByText(/Hj\. Nur/)).toBeTruthy()
    expect(screen.getByText(/12 Nov 2026 13:41:02 WITA/)).toBeTruthy()
    expect(mocks.listResetRequests).toHaveBeenCalledWith(50)
    fireEvent.click(screen.getByRole('button', { name: 'Eksekusi reset' }))
    fireEvent.change(await screen.findByLabelText('Password baru'), { target: { value: 'baru1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan password baru' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/resets/execute', { id: 'r1', password: 'baru1234' }),
    )
  })

  it('bila sudah ditangani orang lain, modal ditutup dan daftar dimuat ulang', async () => {
    mocks.listResetRequests.mockResolvedValue(REQS)
    const err = Object.assign(new Error('Permintaan ini baru saja ditangani orang lain.'), {
      code: 'already_handled',
    })
    mocks.api.mockRejectedValueOnce(err)
    wrap(pm(), <ResetsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Eksekusi reset' }))
    fireEvent.change(await screen.findByLabelText('Password baru'), { target: { value: 'baru1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan password baru' }))
    await waitFor(() => expect(mocks.listResetRequests).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Log audit', () => {
  const ROWS: AuditRow[] = [
    {
      id: 'a1',
      at: '2026-11-17T06:30:05Z',
      actorName: 'Andi Wiratama',
      actorUsername: 'andi',
      actorRole: 'Owner',
      action: 'user.reset_password',
      targetType: 'user',
      targetId: 'u1',
      targetLabel: 'log1',
      detail: { via: 'langsung' },
    },
    {
      id: 'a2',
      at: '2026-11-17T05:00:00Z',
      actorName: 'Hj. Nur',
      actorUsername: 'nur',
      actorRole: 'Direktur',
      action: 'role.update',
      targetType: 'role',
      targetId: 'pm',
      targetLabel: 'Manajer Proyek',
      detail: { izinBerubah: ['audit'] },
    },
  ]
  it('menampilkan pelaku, aksi, target, rincian, dan waktu WITA; dapat dicari', async () => {
    mocks.listAudit.mockResolvedValue(ROWS)
    wrap(owner(), <AuditPage />)
    expect(await screen.findByText('Andi Wiratama')).toBeTruthy()
    expect(screen.getByText('17 Nov 2026 14:30:05 WITA')).toBeTruthy()
    expect(screen.getByText('Reset password')).toBeTruthy()
    expect(screen.getByText('izin berubah: audit')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cari log'), { target: { value: 'nur' } })
    expect(screen.queryByText('Andi Wiratama')).toBeNull()
    expect(screen.getByText('Hj. Nur')).toBeTruthy()
  })
  it('keadaan kosong dan galat', async () => {
    wrap(owner(), <AuditPage />)
    expect(await screen.findByText('Belum ada catatan')).toBeTruthy()
  })
})
