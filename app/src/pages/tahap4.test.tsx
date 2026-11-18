import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import { fmtDate } from '../lib/dates'
import { CatalogPage } from './CatalogPage'
import { ProjectDetailPage } from './ProjectDetailPage'
import { ProjectsPage } from './ProjectsPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  listCatalog: vi.fn(),
  listCompanies: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  listProjectItems: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/data', () => ({
  listCatalog: mocks.listCatalog,
  listCompanies: mocks.listCompanies,
  listProjects: mocks.listProjects,
  getProject: mocks.getProject,
  listProjectItems: mocks.listProjectItems,
}))

const P1 = {
  id: 'p1',
  companyId: 'c1',
  name: 'Jalan Maros',
  location: 'Maros',
  status: 'berjalan',
  startDate: '2026-09-01',
  active: true,
}
const CAT = [
  { id: 'i1', name: 'Semen', unit: 'Sak', category: 'Bahan', minStock: 50, active: true, projectCount: 1 },
  { id: 'i2', name: 'Pasir', unit: 'm3', category: 'Agregat', minStock: 10, active: true, projectCount: 0 },
]

function as(perms: string[], projectIds: string[] = []): AuthApi {
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
const wrap = (api: AuthApi, ui: ReactNode) =>
  render(
    <AuthContext.Provider value={api}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.mockResolvedValue({ ok: true })
  mocks.listCatalog.mockResolvedValue(CAT)
  mocks.listCompanies.mockResolvedValue([{ id: 'c1', name: 'PT. WKN', type: 'induk', active: true }])
  mocks.listProjects.mockResolvedValue([P1])
  mocks.getProject.mockResolvedValue(P1)
  mocks.listProjectItems.mockResolvedValue([])
})

describe('tanggal', () => {
  it('fmtDate', () => {
    expect(fmtDate('2026-09-01')).toBe('1 Sep 2026')
    expect(fmtDate(null)).toBe('—')
  })
})

describe('Katalog Barang', () => {
  it('pengelola dapat menambah barang; kolom satuan terkunci untuk barang yang dipakai proyek', async () => {
    wrap(as(['catalog']), <CatalogPage />)
    expect(await screen.findByText('Semen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tambah barang/ }))
    const dlg = within(screen.getByRole('dialog'))
    fireEvent.change(dlg.getByLabelText('Nama barang'), { target: { value: 'Batu Split' } })
    fireEvent.change(dlg.getByLabelText('Satuan'), { target: { value: 'm3' } })
    fireEvent.change(dlg.getByLabelText(/Batas minimum/), { target: { value: '25' } })
    fireEvent.click(dlg.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/catalog/create', {
        name: 'Batu Split',
        unit: 'm3',
        category: '',
        minStock: 25,
      }),
    )
    // barang Semen dipakai di 1 proyek
    fireEvent.click(
      within(screen.getByText('Semen').closest('tr') as HTMLElement).getByRole('button', { name: 'Ubah' }),
    )
    expect((screen.getByLabelText('Satuan') as HTMLInputElement).disabled).toBe(true)
  })

  it('tanpa izin catalog hanya dapat melihat', async () => {
    wrap(as(['inventory.read']), <CatalogPage />)
    await screen.findByText('Semen')
    expect(screen.queryByRole('button', { name: /Tambah barang/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ubah' })).toBeNull()
  })
})

describe('Proyek & Perusahaan', () => {
  it('pemegang izin projects: melihat semua dan dapat menambah; akun lain hanya yang ditugaskan tanpa tombol kelola', async () => {
    wrap(as(['projects']), <ProjectsPage />)
    expect(await screen.findByText('Jalan Maros')).toBeTruthy()
    expect(mocks.listProjects).toHaveBeenCalledWith(true, [])
    expect(screen.getByRole('button', { name: /Tambah perusahaan/ })).toBeTruthy()
  })

  it('akun berlingkup: hanya proyek yang ditugaskan, tanpa tombol tambah', async () => {
    wrap(as(['inventory.read'], ['p1']), <ProjectsPage />)
    expect(await screen.findByText('Jalan Maros')).toBeTruthy()
    expect(mocks.listProjects).toHaveBeenCalledWith(false, ['p1'])
    expect(screen.queryByRole('button', { name: /Tambah perusahaan/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Tambah proyek/ })).toBeNull()
  })

  it('membuat proyek mengirim perusahaan, nama, lokasi, status, tanggal', async () => {
    wrap(as(['projects']), <ProjectsPage />)
    await screen.findByText('Jalan Maros')
    fireEvent.click(screen.getByRole('button', { name: /Tambah proyek/ }))
    const dlg = within(screen.getByRole('dialog'))
    fireEvent.change(dlg.getByLabelText('Nama proyek'), { target: { value: 'Jembatan Walanae' } })
    fireEvent.change(dlg.getByLabelText('Lokasi'), { target: { value: 'Soppeng' } })
    fireEvent.change(dlg.getByLabelText('Tanggal mulai'), { target: { value: '2026-10-01' } })
    fireEvent.click(dlg.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/projects/create', {
        companyId: 'c1',
        name: 'Jembatan Walanae',
        location: 'Soppeng',
        status: 'berjalan',
        startDate: '2026-10-01',
      }),
    )
  })
})

describe('Barang & saldo awal proyek', () => {
  it('barang tanpa saldo awal ditandai; admin logistik yang ditugaskan dapat mengatur saldo awal', async () => {
    mocks.listProjectItems.mockResolvedValue([
      {
        id: 'i1',
        openingQty: null,
        openingDate: null,
        currentStock: null,
        minStock: 50,
        txCount: 0,
        active: true,
      },
    ])
    wrap(as(['inventory.write', 'inventory.read'], ['p1']), <ProjectDetailPage param="p1" />)
    expect(await screen.findByText('Belum ada saldo awal')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Atur saldo awal' }))
    const dlg = within(screen.getByRole('dialog'))
    fireEvent.change(dlg.getByLabelText(/Jumlah/), { target: { value: '120.5' } })
    fireEvent.change(dlg.getByLabelText('Per tanggal'), { target: { value: '2026-09-01' } })
    fireEvent.click(dlg.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/items/set-opening', {
        projectId: 'p1',
        catalogId: 'i1',
        openingQty: 120.5,
        openingDate: '2026-09-01',
      }),
    )
  })

  it('akun tanpa wewenang penyiapan hanya melihat; saldo awal terkunci setelah ada transaksi', async () => {
    mocks.listProjectItems.mockResolvedValue([
      {
        id: 'i1',
        openingQty: 100,
        openingDate: '2026-09-01',
        currentStock: 80,
        minStock: 50,
        txCount: 3,
        active: true,
      },
    ])
    wrap(as(['inventory.read'], ['p1']), <ProjectDetailPage param="p1" />)
    expect(await screen.findByText('Siap menerima transaksi')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tambah barang' })).toBeNull()
    expect(screen.queryByRole('button', { name: /saldo awal/ })).toBeNull()
  })

  it('saldo awal terkunci (tombol nonaktif) bila sudah ada transaksi, walau berwenang', async () => {
    mocks.listProjectItems.mockResolvedValue([
      {
        id: 'i1',
        openingQty: 100,
        openingDate: '2026-09-01',
        currentStock: 80,
        minStock: 50,
        txCount: 3,
        active: true,
      },
    ])
    wrap(as(['projects']), <ProjectDetailPage param="p1" />)
    const btn = (await screen.findByRole('button', { name: 'Ubah saldo awal' })) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('menambah barang dari katalog yang belum ada di proyek', async () => {
    mocks.listProjectItems.mockResolvedValue([
      {
        id: 'i1',
        openingQty: 1,
        openingDate: '2026-09-01',
        currentStock: 1,
        minStock: 50,
        txCount: 0,
        active: true,
      },
    ])
    wrap(as(['projects']), <ProjectDetailPage param="p1" />)
    await screen.findByText('Siap menerima transaksi')
    fireEvent.click(screen.getByRole('button', { name: /Tambah barang/ }))
    const dlg = within(screen.getByRole('dialog'))
    const options = [...(dlg.getByLabelText('Barang dari katalog') as HTMLSelectElement).options].map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['Pasir (m3)']) // Semen sudah ada di proyek
    fireEvent.click(dlg.getByRole('button', { name: 'Tambah' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/items/add', { projectId: 'p1', catalogId: 'i2' }),
    )
  })

  it('proyek tidak ditemukan atau bukan milik akun: pesan dan tautan kembali', async () => {
    mocks.getProject.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    wrap(as(['inventory.read'], []), <ProjectDetailPage param="p9" />)
    expect(await screen.findByText('Proyek tidak dapat dibuka')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kembali/ })).toBeTruthy()
  })
})
