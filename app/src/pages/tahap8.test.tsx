import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import { fakeAuth } from '../test-utils'
import { EmployeesPage } from './EmployeesPage'
import { ProfilePage } from './ProfilePage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  download: vi.fn(),
  listMyCredentials: vi.fn(),
  listEmployees: vi.fn(),
  listRoles: vi.fn(),
  listProjects: vi.fn(),
  saveProfile: vi.fn(),
  changeMyPassword: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/download', () => ({ download: mocks.download, imageDataUrl: async () => undefined }))
vi.mock('../lib/data', () => ({
  listMyCredentials: mocks.listMyCredentials,
  listEmployees: mocks.listEmployees,
  listRoles: mocks.listRoles,
  listProjects: mocks.listProjects,
}))
vi.mock('../lib/profile', () => ({
  saveProfile: mocks.saveProfile,
  changeMyPassword: mocks.changeMyPassword,
}))

const ME = {
  uid: 'me',
  username: 'budi',
  name: 'Budi Manajer',
  phone: '0812',
  emailContact: 'budi@x.com',
  roleId: 'pm',
  level: 50,
  projectIds: [] as string[],
}
const auth = (perms: string[], over = {}) =>
  fakeAuth({
    state: { status: 'in', profile: ME, roleName: 'Manajer Proyek', perms: new Set(perms) },
    ...over,
  })
const wrap = (a: ReturnType<typeof fakeAuth>, ui: ReactNode) =>
  render(
    <AuthContext.Provider value={a}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

const E = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  username: id,
  name: id.toUpperCase(),
  phone: '',
  emailContact: '',
  roleId: 'log',
  level: 20,
  disabled: false,
  projectIds: [] as string[],
  updatedByName: '',
  updatedAt: null,
  createdByName: 'Reza',
  createdAt: '2026-11-01T02:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listMyCredentials.mockResolvedValue([])
  mocks.saveProfile.mockResolvedValue(['name'])
  mocks.changeMyPassword.mockResolvedValue(undefined)
  mocks.listRoles.mockResolvedValue([
    { id: 'dev', name: 'Developer', level: 100, system: true, perms: [] },
    { id: 'pm', name: 'Manajer Proyek', level: 50, system: false, perms: [] },
    { id: 'log', name: 'Admin Logistik', level: 20, system: false, perms: [] },
  ])
  mocks.listProjects.mockResolvedValue([
    {
      id: 'p1',
      companyId: 'c',
      name: 'Jalan Maros',
      location: '',
      status: 'berjalan',
      startDate: null,
      active: true,
    },
  ])
  mocks.listEmployees.mockResolvedValue([
    E('siti', {
      name: 'Siti Gudang',
      phone: '0813',
      emailContact: 'siti@x.com',
      updatedByName: 'Siti Gudang',
      updatedAt: '2026-11-10T02:00:00Z',
      projectIds: ['p1'],
    }),
    E('reza', { name: 'Reza Dev', roleId: 'dev', level: 100, createdByName: 'bootstrap' }),
    E('budi', { name: 'Budi Manajer', roleId: 'pm', level: 50 }),
    E('rudi', { name: 'Rudi Off', disabled: true }),
  ])
})

describe('Profil: data diri', () => {
  it('menampilkan data dan hanya mengaktifkan Simpan setelah ada perubahan', async () => {
    wrap(auth([]), <ProfilePage />)
    expect((screen.getByLabelText('Nama') as HTMLInputElement).value).toBe('Budi Manajer')
    expect((screen.getByLabelText('No. HP') as HTMLInputElement).value).toBe('0812')
    expect(screen.getByText(/@budi · Manajer Proyek/)).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Simpan perubahan' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('No. HP'), { target: { value: '0899' } })
    expect(save.disabled).toBe(false)
  })

  it('menyimpan: mengirim data baru dan lama, memuat ulang profil, memberi tahu', async () => {
    const a = auth([])
    wrap(a, <ProfilePage />)
    fireEvent.change(screen.getByLabelText('Nama'), { target: { value: ' Budi Baru ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalled())
    expect(mocks.saveProfile.mock.calls[0][0]).toEqual({
      name: ' Budi Baru ',
      phone: '0812',
      emailContact: 'budi@x.com',
    })
    expect(mocks.saveProfile.mock.calls[0][1]).toMatchObject({ name: 'Budi Manajer' })
    await waitFor(() => expect(a.refreshProfile).toHaveBeenCalled())
    await screen.findByText(/sudah tampil di Database Karyawan/)
  })

  it('nama kosong ditolak di perangkat; galat server (email dipakai) ditampilkan', async () => {
    wrap(auth([]), <ProfilePage />)
    fireEvent.change(screen.getByLabelText('Nama'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Nama wajib diisi.')
    expect(mocks.saveProfile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Nama'), { target: { value: 'Budi' } })
    mocks.saveProfile.mockRejectedValue(new Error('Email itu sudah dipakai akun lain.'))
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('sudah dipakai akun lain'))
  })
})

describe('Profil: ganti password', () => {
  const fill = (cur: string, next: string, again: string) => {
    fireEvent.change(screen.getByLabelText('Password lama'), { target: { value: cur } })
    fireEvent.change(screen.getByLabelText('Password baru'), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Ulangi password baru'), { target: { value: again } })
    fireEvent.click(screen.getByRole('button', { name: 'Ganti password' }))
  }

  it('tiga isian password, semuanya dengan ikon mata', () => {
    wrap(auth([]), <ProfilePage />)
    expect(screen.getAllByRole('button', { name: 'Tampilkan password' })).toHaveLength(3)
  })

  it('validasi di perangkat: kosong, kurang dari 6 karakter, konfirmasi beda', async () => {
    wrap(auth([]), <ProfilePage />)
    fill('', 'abcdef', 'abcdef')
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('password lama')
    fill('lama123', '12345', '12345')
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((x) => x.textContent?.includes('minimal 6'))).toBe(true),
    )
    fill('lama123', 'abcdef', 'abcdeg')
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((x) => x.textContent?.includes('tidak sama'))).toBe(true),
    )
    expect(mocks.changeMyPassword).not.toHaveBeenCalled()
  })

  it('berhasil: memanggil dengan username, lama, baru; isian dikosongkan', async () => {
    wrap(auth([]), <ProfilePage />)
    fill('lama123', 'baru-456', 'baru-456')
    await waitFor(() => expect(mocks.changeMyPassword).toHaveBeenCalledWith('budi', 'lama123', 'baru-456'))
    await screen.findByText(/Password diganti/)
    expect((screen.getByLabelText('Password lama') as HTMLInputElement).value).toBe('')
  })

  it('password lama salah: pesan dari klien ditampilkan', async () => {
    mocks.changeMyPassword.mockRejectedValue(new Error('Password lama salah.'))
    wrap(auth([]), <ProfilePage />)
    fill('salah', 'baru-456', 'baru-456')
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((x) => x.textContent === 'Password lama salah.')).toBe(true),
    )
  })
})

describe('Database Karyawan', () => {
  const names = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent)

  it('daftar semua akun urut level lalu nama, dengan pengubah dan waktu terakhir', async () => {
    wrap(auth(['employees']), <EmployeesPage />)
    await screen.findByText('Reza Dev')
    expect(names().map((n) => n?.replace(/^[A-Z]{1,2}/, ''))).toEqual([
      'Reza Dev',
      'Budi Manajer',
      'Rudi Off',
      'Siti Gudang',
    ])
    const siti = screen.getAllByText('Siti Gudang')[0].closest('tr') as HTMLElement
    expect(siti.textContent).toContain('0813')
    expect(siti.textContent).toContain('siti@x.com')
    expect(siti.textContent).toMatch(/Siti Gudang.*WITA/s) // pengubah = dirinya sendiri, waktu WITA
    const reza = screen.getByText('Reza Dev').closest('tr') as HTMLElement
    expect(reza.textContent).toContain('bootstrap') // belum pernah diubah: pembuat
    expect(reza.textContent).toContain('Developer')
    expect(
      within(screen.getByRole('region', { name: 'Database karyawan' })).getByText('Nonaktif'),
    ).toBeTruthy()
  })

  it('pencarian (nama, HP, email) dan filter role, status, proyek', async () => {
    wrap(auth(['employees', 'projects']), <EmployeesPage />)
    await screen.findByText('Reza Dev')
    fireEvent.change(screen.getByLabelText('Cari karyawan'), { target: { value: '0813' } })
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Cari karyawan'), { target: { value: 'SITI@X' } })
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Cari karyawan'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter role'), { target: { value: 'dev' } })
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Filter role'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'off' } })
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter proyek'), { target: { value: 'p1' } })
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Cari karyawan'), { target: { value: 'tidak ada' } })
    expect(screen.getByText('Tidak ditemukan')).toBeTruthy()
  })

  it('ekspor hanya untuk pemegang izin export; Excel memuat data yang tersaring', async () => {
    const a = wrap(auth(['employees']), <EmployeesPage />)
    await screen.findByText('Reza Dev')
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull()
    a.unmount()
    wrap(auth(['employees', 'export']), <EmployeesPage />)
    await screen.findByText('Reza Dev')
    fireEvent.change(screen.getByLabelText('Filter role'), { target: { value: 'pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.download.mock.calls[0][1]).toBe('wkn-database-karyawan.xlsx')
  })

  it('galat pemuatan ditampilkan', async () => {
    mocks.listEmployees.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    wrap(auth(['employees']), <EmployeesPage />)
    await screen.findByText('Database karyawan tidak dapat dimuat')
  })
})
