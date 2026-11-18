import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import { fakeAuth } from '../test-utils'
import { CatalogPage } from './CatalogPage'
import { ProjectsPage } from './ProjectsPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  listCompanies: vi.fn(),
  listProjects: vi.fn(),
  getBackupStatus: vi.fn(),
  listCatalog: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/data', () => ({
  listCompanies: mocks.listCompanies,
  listProjects: mocks.listProjects,
  getBackupStatus: mocks.getBackupStatus,
  listCatalog: mocks.listCatalog,
  getProject: vi.fn(),
  listProjectItems: vi.fn(),
}))

const ME = (level: number) => ({
  uid: 'me',
  username: 'own',
  name: 'Owner',
  phone: '',
  emailContact: '',
  roleId: 'owner',
  level,
  projectIds: [] as string[],
})
const as = (level: number, perms: string[]) =>
  fakeAuth({ state: { status: 'in', profile: ME(level), roleName: 'Owner', perms: new Set(perms) } })
const wrap = (ui: ReactNode, level = 90, perms = ['projects', 'catalog', 'audit']) =>
  render(
    <AuthContext.Provider value={as(level, perms)}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

const CO = { id: 'c1', name: 'PT. Uji', type: 'induk', active: true, deleting: false }
const PR = (o = {}) => ({
  id: 'p1',
  companyId: 'c1',
  name: 'Proyek Uji',
  location: 'Maros',
  status: 'berjalan',
  startDate: null,
  active: true,
  deleting: false,
  ...o,
})
const PV = (o = {}) => ({
  name: 'Proyek Uji',
  projects: 1,
  items: 3,
  transactions: 450,
  users: 2,
  deleting: false,
  estimatedDocs: 1200,
  overDailyLimit: false,
  ...o,
})
const typeName = (v: string) =>
  fireEvent.change(screen.getByLabelText(/Ketik nama/), { target: { value: v } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listCompanies.mockResolvedValue([CO])
  mocks.listProjects.mockResolvedValue([PR()])
  mocks.getBackupStatus.mockResolvedValue({
    lastStatus: 'ok',
    lastOkAt: '2026-11-18T19:00:00Z',
    lastRunAt: null,
    lastError: '',
    lastTrigger: 'cron',
    counts: {},
  })
  mocks.api.mockImplementation(async (path: string) =>
    path.endsWith('delete-preview')
      ? { preview: PV() }
      : { purge: { done: true, deleted: 12, phase: 'selesai' } },
  )
  mocks.listCatalog.mockResolvedValue([
    { id: 'i1', name: 'Semen', unit: 'Sak', category: '', minStock: 0, active: true, projectCount: 0 },
    { id: 'i2', name: 'Pasir', unit: 'm3', category: '', minStock: 0, active: true, projectCount: 2 },
  ])
})

describe('Hapus proyek dan perusahaan (UI)', () => {
  it('tombol Hapus hanya untuk level >= 90 dengan izin projects', async () => {
    const a = wrap(<ProjectsPage />, 90)
    await screen.findByText('Proyek Uji')
    expect(screen.getAllByRole('button', { name: /Hapus/ })).toHaveLength(2) // perusahaan dan proyek
    a.unmount()
    wrap(<ProjectsPage />, 80) // Direktur
    await screen.findByText('Proyek Uji')
    expect(screen.queryByRole('button', { name: /Hapus/ })).toBeNull()
  })

  it('pratinjau akibat, konfirmasi nama persis, lalu hapus; daftar dimuat ulang', async () => {
    wrap(<ProjectsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Hapus/ }))[1])
    await screen.findByText(/450 transaksi/)
    const dlg = screen.getByRole('dialog')
    expect(dlg.textContent).toMatch(/3 barang proyek/)
    expect(dlg.textContent).toMatch(/2 akun akan kehilangan penugasan/)
    expect(dlg.textContent).toMatch(/Cadangan Sheets terakhir berhasil/)
    expect(dlg.textContent).toMatch(/Log Audit tetap menyimpan/)
    const go = within(dlg).getByRole('button', { name: 'Hapus permanen' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    typeName('proyek uji') // huruf kecil: tidak cocok
    expect(go.disabled).toBe(true)
    typeName('Proyek Uji')
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/projects/delete', { id: 'p1', confirmName: 'Proyek Uji' }),
    )
    await screen.findByText(/dihapus permanen/)
    await waitFor(() => expect(mocks.listProjects).toHaveBeenCalledTimes(2))
  })

  it('penghapusan bertahap: mengulang sampai selesai dengan kemajuan; bentrokan sesaat diulang', async () => {
    let calls = 0
    mocks.api.mockImplementation(async (path: string) => {
      if (path.endsWith('delete-preview')) return { preview: PV() }
      calls++
      if (calls === 2) throw Object.assign(new Error('Data sedang diubah'), { code: 'busy' })
      return { purge: { done: calls >= 4, deleted: 400, phase: 'transaksi' } }
    })
    wrap(<ProjectsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Hapus/ }))[1])
    await screen.findByText(/450 transaksi/)
    typeName('Proyek Uji')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus permanen' }))
    await screen.findByText(/dihapus permanen/)
    expect(calls).toBe(4) // 3 sukses + 1 bentrokan yang diulang
  })

  it('kuota hapus habis: pesan jelas, tombol aktif lagi untuk melanjutkan', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.endsWith('delete-preview')) return { preview: PV() }
      throw Object.assign(
        new Error('Kuota hapus harian Firestore habis. Penghapusan dapat dilanjutkan besok.'),
        { code: 'quota_exhausted' },
      )
    })
    wrap(<ProjectsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Hapus/ }))[1])
    await screen.findByText(/450 transaksi/)
    typeName('Proyek Uji')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus permanen' }))
    expect((await screen.findByRole('alert')).textContent).toContain('dilanjutkan besok')
    expect((screen.getByRole('button', { name: 'Hapus permanen' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('peringatan: melebihi batas hapus harian, penghapusan terputus, cadangan belum pernah berhasil', async () => {
    mocks.listProjects.mockResolvedValue([PR({ deleting: true, active: false })])
    mocks.api.mockImplementation(async () => ({ preview: PV({ deleting: true, overDailyLimit: true }) }))
    mocks.getBackupStatus.mockResolvedValue({
      lastStatus: 'never',
      lastOkAt: null,
      lastRunAt: null,
      lastError: '',
      lastTrigger: '',
      counts: {},
    })
    wrap(<ProjectsPage />)
    expect(await screen.findByText('Sedang dihapus')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Ubah' })).toHaveLength(1) // hanya perusahaan; proyek yang sedang dihapus tidak dapat diubah
    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan hapus/ }))
    await screen.findByText(/Perkiraan melebihi batas hapus harian/)
    const dlg = screen.getByRole('dialog')
    expect(dlg.textContent).toMatch(/Penghapusan sebelumnya belum selesai/)
    expect(dlg.textContent).toMatch(/Cadangan Sheets belum pernah berhasil/)
    expect(within(dlg).getByRole('button', { name: 'Lanjutkan penghapusan' })).toBeTruthy()
  })

  it('perusahaan: peringatan beserta semua proyeknya dan endpoint perusahaan', async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path.endsWith('delete-preview')
        ? { preview: PV({ name: 'PT. Uji', projects: 4 }) }
        : { purge: { done: true, deleted: 1, phase: 'selesai' } },
    )
    wrap(<ProjectsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Hapus/ }))[0])
    await screen.findByText(/4 proyek akan dihapus/)
    expect(screen.getByRole('dialog').textContent).toMatch(/beserta SEMUA proyeknya/)
    typeName('PT. Uji')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus permanen' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/companies/delete', { id: 'c1', confirmName: 'PT. Uji' }),
    )
  })

  it('tanpa izin audit: tidak membaca status cadangan', async () => {
    wrap(<ProjectsPage />, 90, ['projects'])
    fireEvent.click((await screen.findAllByRole('button', { name: /Hapus/ }))[1])
    await screen.findByText(/450 transaksi/)
    expect(mocks.getBackupStatus).not.toHaveBeenCalled()
  })
})

describe('Hapus barang katalog (UI)', () => {
  it('hanya barang yang tidak dipakai proyek punya tombol hapus; konfirmasi lalu panggil server', async () => {
    wrap(<CatalogPage />)
    await screen.findByText('Semen')
    expect(screen.getByRole('button', { name: 'Hapus Semen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hapus Pasir' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Semen' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hapus permanen' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/catalog/delete', { id: 'i1' }))
    await screen.findByText(/dihapus dari katalog/)
  })

  it('galat server (barang baru saja dipakai) ditampilkan di dialog', async () => {
    mocks.api.mockRejectedValue(new Error('Barang masih dipakai proyek.'))
    wrap(<CatalogPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus Semen' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hapus permanen' }))
    expect((await screen.findByRole('alert')).textContent).toContain('masih dipakai')
  })
})
