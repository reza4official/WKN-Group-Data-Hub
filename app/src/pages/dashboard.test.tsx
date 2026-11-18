import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { clearDashboardCache } from '../lib/dashboardData'
import { DashboardPage } from './DashboardPage'

const mocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listProjects: vi.fn(),
  listProjectItems: vi.fn(),
  listMonths: vi.fn(),
  listDays: vi.fn(),
}))
vi.mock('../lib/data', () => mocks)
vi.mock('../lib/time', async (orig) => ({
  ...(await orig<typeof import('../lib/time')>()),
  todayWita: () => '2026-11-18',
}))

const P = (id: string, name: string) => ({
  id,
  companyId: 'c1',
  name,
  location: '',
  status: 'berjalan',
  startDate: null,
  active: true,
})
const CAT = [
  { id: 'i1', name: 'Semen', unit: 'Sak', category: 'Bahan', minStock: 20, active: true, projectCount: 2 },
  { id: 'i2', name: 'Pasir', unit: 'm3', category: 'Agregat', minStock: 10, active: true, projectCount: 1 },
  { id: 'i3', name: 'Besi', unit: 'Batang', category: 'Bahan', minStock: 5, active: true, projectCount: 1 },
]
const IT = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  openingQty: 100,
  openingDate: '2026-10-01',
  currentStock: 100,
  minStock: 20,
  txCount: 2,
  lastTxDate: '2026-11-17',
  active: true,
  ...over,
})
const M = (id: string, i: number, o: number, count = 1) => ({
  id,
  in: i,
  out: o,
  corrIn: 0,
  corrOut: 0,
  count,
})

function as(perms: string[], projectIds: string[] = ['p1', 'p2']): AuthApi {
  return {
    state: {
      status: 'in',
      profile: {
        uid: 'me',
        username: 'me',
        name: 'Saya',
        emailContact: '',
        roleId: 'x',
        level: 50,
        projectIds,
      },
      roleName: 'x',
      perms: new Set(perms),
    },
    loginWithPassword: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  } as unknown as AuthApi
}
const wrap = (a: AuthApi, ui: ReactNode) =>
  render(<AuthContext.Provider value={a}>{ui}</AuthContext.Provider>)

beforeEach(() => {
  clearDashboardCache()
  vi.clearAllMocks()
  mocks.listCatalog.mockResolvedValue(CAT)
  mocks.listProjects.mockResolvedValue([P('p1', 'Jalan Maros')])
  // Semen: awal 100 (1 Okt), Okt masuk 50 keluar 60, Nov masuk 30 keluar 45 -> sisa 75
  // Pasir: awal 100, Nov keluar 90 -> sisa 10 (min 10: kritis)
  // Besi : awal 100, tidak pernah bergerak sejak 1 Okt (idle)
  mocks.listProjectItems.mockResolvedValue([
    IT('i1', { currentStock: 75, txCount: 5, lastTxDate: '2026-11-17' }),
    IT('i2', { currentStock: 10, minStock: 10, txCount: 1, lastTxDate: '2026-11-10' }),
    IT('i3', { currentStock: 100, minStock: 5, txCount: 0, lastTxDate: null }),
  ])
  mocks.listMonths.mockImplementation(async (_p: string, id: string, from: string) => {
    const all: Record<string, ReturnType<typeof M>[]> = {
      i1: [M('2026-10', 50, 60, 2), M('2026-11', 30, 45, 3)],
      i2: [M('2026-11', 0, 90, 1)],
      i3: [],
    }
    return all[id].filter((t) => t.id >= from)
  })
  mocks.listDays.mockResolvedValue([{ date: '2026-11-17', in: 0, out: 30 }])
})

describe('Dashboard', () => {
  it('angka per barang dihitung dari total bulanan, status dan KPI sesuai', async () => {
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    const semen = await screen.findByRole('button', { name: 'Semen' })
    const rowOf = (n: string) => screen.getByRole('button', { name: n }).closest('tr') as HTMLElement
    const cells = (n: string) =>
      within(rowOf(n))
        .getAllByRole('cell')
        .map((c) => c.textContent ?? '')
    const s = cells('Semen')
    expect([s[2], s[3], s[4], s[5]]).toEqual(['90', '30', '45', '75'])
    expect(s[7]).toContain('37,5%') // 45 / (90 + 30)
    expect(s[9]).toBe('Aman')
    const p = cells('Pasir')
    expect([p[2], p[3], p[4], p[5]]).toEqual(['100', '0', '90', '10'])
    expect(p[9]).toBe('Kritis')
    expect(cells('Besi')[9]).toBe('Tidak bergerak')
    expect(semen).toBeTruthy()
    // KPI: 3 jenis barang, transaksi 3 + 1 + 0, 1 kritis, 1 tidak bergerak
    const kpis = document.querySelector('.kpis')!.textContent!
    expect(kpis).toMatch(/Jenis barang aktif3/)
    expect(kpis).toMatch(/Transaksi November4/)
    expect(kpis).toMatch(/Stok kritis1/)
    expect(kpis).toMatch(/Tidak bergerak1/)
  })

  it('hemat baca: total bulan hanya bulan ini dan lalu; total harian tidak dibaca saat memuat', async () => {
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByRole('button', { name: 'Semen' })
    expect(mocks.listMonths).toHaveBeenCalledTimes(3)
    for (const c of mocks.listMonths.mock.calls) expect(c[2]).toBe('2026-10')
    expect(mocks.listDays).not.toHaveBeenCalled()
    expect(mocks.listProjectItems).toHaveBeenCalledTimes(1)
  })

  it('pencarian dan pengurutan', async () => {
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByRole('button', { name: 'Semen' })
    fireEvent.change(screen.getByLabelText('Cari barang'), { target: { value: 'pas' } })
    expect(screen.queryByRole('button', { name: 'Semen' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pasir' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cari barang'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^Keluar/ }))
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).queryAllByRole('button')[0]?.textContent)
    expect(names().slice(0, 3)).toEqual(['Pasir', 'Semen', 'Besi']) // keluar menurun: 90, 45, 0
    fireEvent.click(screen.getByRole('button', { name: /^Keluar/ }))
    expect(names()[0]).toBe('Besi')
  })

  it('klik barang membuka rincian dengan grafik; total harian dibaca hanya saat itu', async () => {
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Semen' }))
    await screen.findByRole('img', { name: /Sisa stok Semen 30 hari terakhir/ })
    expect(screen.getByRole('img', { name: /Masuk dan keluar Semen per bulan/ })).toBeTruthy()
    expect(mocks.listDays).toHaveBeenCalledWith('p1', 'i1', '2026-10-20')
    expect(mocks.listMonths).toHaveBeenCalledWith('p1', 'i1', '2026-06')
  })

  it('beberapa proyek: gabungan dan perbandingan antar proyek', async () => {
    mocks.listProjects.mockResolvedValue([P('p1', 'Jalan Maros'), P('p2', 'Jembatan Walanae')])
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByText('Perbandingan antar proyek')
    expect((screen.getByLabelText('Proyek') as HTMLSelectElement).value).toBe('all')
    const cmp = screen.getByText('Perbandingan antar proyek').closest('section') as HTMLElement
    expect(within(cmp).getByText('Jalan Maros')).toBeTruthy()
    expect(within(cmp).getByText('Jembatan Walanae')).toBeTruthy()
    // barang yang sama dijumlahkan: Semen 2 x 75 = 150
    const row = screen.getByRole('button', { name: 'Semen' }).closest('tr') as HTMLElement
    expect(within(row).getAllByRole('cell')[5].textContent).toBe('150')
    // memilih satu proyek menghilangkan perbandingan
    fireEvent.change(screen.getByLabelText('Proyek'), { target: { value: 'p2' } })
    await waitFor(() => expect(screen.queryByText('Perbandingan antar proyek')).toBeNull())
  })

  it('bulan lampau: tanpa penilaian tidak bergerak; bulan sebelum saldo awal kosong', async () => {
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByRole('button', { name: 'Semen' })
    fireEvent.change(screen.getByLabelText('Bulan'), { target: { value: '2026-09' } })
    await screen.findByText('Belum ada barang dengan saldo awal')
    fireEvent.change(screen.getByLabelText('Bulan'), { target: { value: '2026-10' } })
    const semen = await screen.findByRole('button', { name: 'Semen' })
    expect(within(semen.closest('tr') as HTMLElement).getAllByRole('cell')[9].textContent).not.toBe(
      'Tidak bergerak',
    )
  })

  it('tanpa proyek: pesan jelas', async () => {
    mocks.listProjects.mockResolvedValue([])
    wrap(as(['dashboard', 'inventory.read'], []), <DashboardPage />)
    await screen.findByText('Belum ada proyek aktif')
  })

  it('cache: kembali ke halaman yang sama tidak membaca ulang; Segarkan memaksa baca ulang', async () => {
    const a = wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByRole('button', { name: 'Semen' })
    const reads = mocks.listProjectItems.mock.calls.length
    a.unmount()
    wrap(as(['dashboard', 'inventory.read']), <DashboardPage />)
    await screen.findByRole('button', { name: 'Semen' })
    expect(mocks.listProjectItems.mock.calls.length).toBe(reads)
    fireEvent.click(screen.getByRole('button', { name: 'Segarkan' }))
    await waitFor(() => expect(mocks.listProjectItems.mock.calls.length).toBe(reads + 1))
  })
})
