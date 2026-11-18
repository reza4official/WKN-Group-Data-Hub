import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import { InventoryPage } from './InventoryPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  listCatalog: vi.fn(),
  listProjects: vi.fn(),
  listProjectItems: vi.fn(),
  listLedger: vi.fn(),
  listMonths: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/data', () => mocks)
vi.mock('../lib/time', async (orig) => ({
  ...(await orig<typeof import('../lib/time')>()),
  todayWita: () => '2026-09-20',
}))

const P = (id: string, name: string, active = true) => ({
  id,
  companyId: 'c1',
  name,
  location: '',
  status: 'berjalan',
  startDate: null,
  active,
})
const CAT = [
  { id: 'i1', name: 'Semen', unit: 'Sak', category: '', minStock: 0, active: true, projectCount: 1 },
]
const ITEM = {
  id: 'i1',
  openingQty: 100,
  openingDate: '2026-09-01',
  currentStock: 140,
  minStock: 0,
  txCount: 2,
  active: true,
}
const E = (id: string, over: Record<string, unknown>) => ({
  id,
  itemId: 'i1',
  date: '2026-09-10',
  ym: '2026-09',
  type: 'masuk',
  in: 0,
  out: 0,
  seq: 1,
  note: '',
  createdByName: 'Siti',
  createdByRole: 'Admin',
  createdAt: '2026-09-10T02:00:00Z',
  refEntryId: null,
  ...over,
})

function as(perms: string[], projectIds: string[] = ['p1']): AuthApi {
  return {
    state: {
      status: 'in',
      profile: {
        uid: 'me',
        username: 'me',
        name: 'Saya',
        emailContact: '',
        roleId: 'x',
        level: 20,
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
  render(
    <AuthContext.Provider value={a}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-09-20T03:00:00Z'))
  mocks.api.mockResolvedValue({ ok: true })
  mocks.listCatalog.mockResolvedValue(CAT)
  mocks.listProjects.mockResolvedValue([P('p1', 'Jalan Maros')])
  mocks.listProjectItems.mockResolvedValue([ITEM])
  mocks.listMonths.mockResolvedValue([])
  mocks.listLedger.mockResolvedValue([
    E('e1', { in: 40, note: 'Kiriman', seq: 1 }),
    E('e2', { type: 'keluar', out: 30, date: '2026-09-12', seq: 2 }),
  ])
})

describe('Transaksi Stok', () => {
  it('menampilkan kolom, saldo awal, dan Tersisa berjalan beserta pencatat dan waktu WITA', async () => {
    wrap(as(['inventory.read']), <InventoryPage />)
    await screen.findByText('Kiriman')
    for (const h of [
      'Hari / Tanggal',
      'Nama Barang',
      'Satuan',
      'Masuk',
      'Keluar',
      'Tersisa',
      'Keterangan',
      'Dicatat oleh',
    ])
      expect(screen.getByRole('columnheader', { name: h })).toBeTruthy()
    const body = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '')
    expect(body[0]).toContain('Saldo awal')
    expect(body[0]).toContain('100')
    expect(body[1]).toContain('Kamis, 10 Sep 2026')
    expect(body[1]).toContain('140')
    expect(body[2]).toContain('110')
    expect(screen.getAllByText('Siti').length).toBe(2)
    expect(screen.getAllByText(/WITA/).length).toBeGreaterThan(0)
    expect(screen.getByText(/barang masuk dihitung lebih dulu/)).toBeTruthy()
    expect(mocks.listLedger).toHaveBeenCalledWith('p1', '2026-09', undefined)
  })

  it('pembaca saja: tanpa tombol catat dan tanpa Koreksi', async () => {
    wrap(as(['inventory.read']), <InventoryPage />)
    await screen.findByText('Kiriman')
    expect(screen.queryByRole('button', { name: /Catat transaksi/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Koreksi' })).toBeNull()
  })

  it('mencatat barang keluar mengirim data lengkap dengan ID permintaan', async () => {
    wrap(as(['inventory.read', 'inventory.write']), <InventoryPage />)
    await screen.findByText('Kiriman')
    fireEvent.click(screen.getByRole('button', { name: /Catat transaksi/ }))
    fireEvent.click(screen.getByLabelText('Barang keluar'))
    fireEvent.change(screen.getByLabelText(/Jumlah/), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Keterangan (opsional)'), {
      target: { value: ' Dipakai pondasi ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Catat' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalled())
    const [path, body] = mocks.api.mock.calls[0]
    expect(path).toBe('/ledger/add')
    expect(body).toMatchObject({
      projectId: 'p1',
      itemId: 'i1',
      type: 'keluar',
      qty: 12.5,
      date: '2026-09-20',
      note: 'Dipakai pondasi',
    })
    expect(String(body.requestId).length).toBeGreaterThanOrEqual(16)
    await screen.findByText('Barang keluar dicatat.')
  })

  it('kegagalan jaringan lalu kirim ulang memakai ID permintaan yang sama (tidak ganda)', async () => {
    mocks.api
      .mockRejectedValueOnce(new Error('Tidak dapat terhubung ke server.'))
      .mockResolvedValue({ ok: true })
    wrap(as(['inventory.read', 'inventory.write']), <InventoryPage />)
    await screen.findByText('Kiriman')
    fireEvent.click(screen.getByRole('button', { name: /Catat transaksi/ }))
    fireEvent.change(screen.getByLabelText(/Jumlah/), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Catat' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Catat' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2))
    expect(mocks.api.mock.calls[0][1].requestId).toBe(mocks.api.mock.calls[1][1].requestId)
  })

  it('galat server (stok tidak cukup) ditampilkan dan formulir tetap terbuka', async () => {
    mocks.api.mockRejectedValue(
      new Error('Stok tidak cukup. Jumlah keluar maksimal pada tanggal itu: 10 Sak.'),
    )
    wrap(as(['inventory.read', 'inventory.write']), <InventoryPage />)
    await screen.findByText('Kiriman')
    fireEvent.click(screen.getByRole('button', { name: /Catat transaksi/ }))
    fireEvent.click(screen.getByLabelText('Barang keluar'))
    fireEvent.change(screen.getByLabelText(/Jumlah/), { target: { value: '999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Catat' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Stok tidak cukup')
    expect(screen.getByLabelText(/Jumlah/)).toBeTruthy()
  })

  it('Koreksi hanya untuk transaksi asli yang belum dikoreksi, dan mengirim alasan', async () => {
    mocks.listLedger.mockResolvedValue([
      E('e1', { in: 40, seq: 1 }),
      E('e1__k', { type: 'koreksi', out: 40, refEntryId: 'e1', note: 'Salah input', seq: 2 }),
      E('e3', { type: 'keluar', out: 5, date: '2026-09-15', seq: 3 }),
    ])
    wrap(as(['inventory.read', 'inventory.correct']), <InventoryPage />)
    await screen.findByText('Sudah dikoreksi')
    const buttons = screen.getAllByRole('button', { name: 'Koreksi' })
    expect(buttons).toHaveLength(1) // hanya e3
    fireEvent.click(buttons[0])
    const dlg = screen.getByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText('Alasan koreksi'), { target: { value: ' Salah barang ' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Buat koreksi' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/ledger/correct', {
        projectId: 'p1',
        entryId: 'e3',
        reason: 'Salah barang',
      }),
    )
  })

  it('akun hanya melihat proyeknya; tanpa penugasan ke proyek tidak ada tombol catat walau punya izin', async () => {
    mocks.listProjects.mockResolvedValue([P('p9', 'Proyek Lain')])
    wrap(as(['inventory.read', 'inventory.write'], ['p1']), <InventoryPage />)
    await screen.findByRole('option', { name: 'Proyek Lain' })
    expect(screen.queryByRole('button', { name: /Catat transaksi/ })).toBeNull()
  })

  it('belum ada proyek, belum ada saldo awal, dan bulan kosong punya pesan jelas', async () => {
    mocks.listProjects.mockResolvedValue([])
    const a = wrap(as(['inventory.read'], []), <InventoryPage />)
    await screen.findByText('Belum ada proyek')
    a.unmount()
    mocks.listProjects.mockResolvedValue([P('p1', 'Jalan Maros')])
    mocks.listProjectItems.mockResolvedValue([{ ...ITEM, openingQty: null, openingDate: null }])
    mocks.listLedger.mockResolvedValue([])
    wrap(as(['inventory.read', 'inventory.write']), <InventoryPage />)
    await screen.findByText(/belum memiliki saldo awal/)
    expect((screen.getByRole('button', { name: /Catat transaksi/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('memfilter barang memanggil kueri dengan barang itu', async () => {
    wrap(as(['inventory.read']), <InventoryPage />)
    await screen.findByText('Kiriman')
    fireEvent.change(screen.getByLabelText('Barang'), { target: { value: 'i1' } })
    await waitFor(() => expect(mocks.listLedger).toHaveBeenCalledWith('p1', '2026-09', 'i1'))
  })
})
