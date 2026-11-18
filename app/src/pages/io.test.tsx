import ExcelJS from 'exceljs'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { ToastProvider } from '../components/Toast'
import { IOPage } from './IOPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  download: vi.fn(),
  listCatalog: vi.fn(),
  listProjects: vi.fn(),
  listProjectItems: vi.fn(),
  listLedger: vi.fn(),
  listMonths: vi.fn(),
  listDays: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/download', () => ({ download: mocks.download, imageDataUrl: async () => undefined }))
vi.mock('../lib/data', () => mocks)
vi.mock('../lib/time', async (orig) => ({
  ...(await orig<typeof import('../lib/time')>()),
  todayWita: () => '2026-11-18',
}))

const P1 = {
  id: 'p1',
  companyId: 'c1',
  name: 'Jalan Maros',
  location: '',
  status: 'berjalan',
  startDate: null,
  active: true,
}
const CAT = [
  { id: 'i1', name: 'Semen', unit: 'Sak', category: '', minStock: 20, active: true, projectCount: 1 },
  { id: 'i2', name: 'Pasir', unit: 'm3', category: '', minStock: 10, active: true, projectCount: 1 },
]
const IT = (id: string) => ({
  id,
  openingQty: 100,
  openingDate: '2026-09-01',
  currentStock: 100,
  minStock: 20,
  txCount: 0,
  lastTxDate: null,
  active: true,
})

function as(perms: string[], projectIds = ['p1']): AuthApi {
  return {
    state: {
      status: 'in',
      profile: {
        uid: 'me',
        username: 'me',
        name: 'Budi',
        emailContact: '',
        roleId: 'x',
        level: 50,
        projectIds,
      },
      roleName: 'Manajer Proyek',
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

async function xlsxFile(rows: unknown[][], name = 'uji.xlsx') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transaksi')
  ws.addRow(['Tanggal', 'Nama Barang', 'Jenis', 'Jumlah', 'Keterangan'])
  rows.forEach((r) => ws.addRow(r))
  return new File([(await wb.xlsx.writeBuffer()) as BlobPart], name)
}
const upload = (f: File) =>
  fireEvent.change(document.getElementById('io-file') as HTMLInputElement, { target: { files: [f] } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.mockImplementation(async (_p: string, body: { rows: unknown[] }) => ({
    results: body.rows.map((_, i) => ({ index: i + 1, status: 'ok' })),
  }))
  mocks.listCatalog.mockResolvedValue(CAT)
  mocks.listProjects.mockResolvedValue([P1])
  mocks.listProjectItems.mockResolvedValue([IT('i1'), IT('i2')])
  mocks.listMonths.mockResolvedValue([])
  mocks.listLedger.mockResolvedValue([])
  mocks.listDays.mockResolvedValue([])
})

describe('Ekspor', () => {
  it('tanpa izin ekspor: tidak ada tombol unduh', async () => {
    wrap(as(['import', 'inventory.write']), <IOPage />)
    await screen.findByText('Role Anda belum diberi izin ekspor.')
    expect(screen.queryByRole('button', { name: /Excel \(\.xlsx\)/ })).toBeNull()
  })

  it('Excel: berkas memuat lembar Transaksi dan Ringkasan, atas nama pembuat', async () => {
    wrap(as(['export', 'inventory.read']), <IOPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Excel \(\.xlsx\)/ }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    const [blob, name] = mocks.download.mock.calls[0]
    expect(name).toBe('wkn-laporan-jalan-maros-2026-11.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      await new Promise<ArrayBuffer>((r) => {
        const f = new FileReader()
        f.onload = () => r(f.result as ArrayBuffer)
        f.readAsArrayBuffer(blob)
      }),
    )
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Transaksi', 'Ringkasan'])
    expect(String(wb.getWorksheet('Transaksi')!.getCell('A4').value)).toContain('Budi (Manajer Proyek)')
  })

  it('PDF diunduh dan pilihan isi dihormati', async () => {
    wrap(as(['export', 'inventory.read']), <IOPage />)
    fireEvent.click(await screen.findByLabelText('Ringkasan per barang'))
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.download.mock.calls[0][1]).toBe('wkn-transaksi-jalan-maros-2026-11.pdf')
    expect(mocks.listProjectItems).toHaveBeenCalled()
  })

  it('tanpa isi terpilih tombol nonaktif', async () => {
    wrap(as(['export', 'inventory.read']), <IOPage />)
    fireEvent.click(await screen.findByLabelText('Transaksi'))
    fireEvent.click(screen.getByLabelText('Ringkasan per barang'))
    expect((screen.getByRole('button', { name: /Excel \(\.xlsx\)/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('Impor', () => {
  const perms = ['export', 'import', 'inventory.write', 'inventory.read']

  it('tanpa izin impor atau penugasan: pesan, tanpa unggah', async () => {
    wrap(as(['export']), <IOPage />)
    await screen.findByText(/belum diberi izin impor/)
    expect(document.getElementById('io-file')).toBeNull()
  })

  it('template diunduh dengan nama barang proyek', async () => {
    wrap(as(perms), <IOPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unduh template Excel' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.download.mock.calls[0][1]).toBe('wkn-template-impor-jalan-maros.xlsx')
  })

  it('pratinjau menandai baris salah; hanya baris valid dikirim, atas pelaku, dengan ID impor', async () => {
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(
      await xlsxFile([
        ['2026-11-10', 'Semen', 'Masuk', 40, 'Kiriman'],
        ['2026-11-10', 'Besi', 'Masuk', 5, ''],
        ['2026-11-11', 'Pasir', 'Keluar', 'abc', ''],
        ['2026-11-12', ' pasir ', 'keluar', '2,5', 'cor'],
      ]),
    )
    await screen.findByText(/2 baris valid, 2 baris perlu diperbaiki/)
    expect(screen.getAllByText(/Barang tidak ada di proyek ini/).length).toBeGreaterThan(0)
    expect(screen.getByText('Jumlah bukan angka.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Impor 2 baris valid' }))
    await screen.findByText('Hasil impor')
    expect(mocks.api).toHaveBeenCalledTimes(1)
    const [path, body] = mocks.api.mock.calls[0]
    expect(path).toBe('/ledger/import')
    expect(body).toMatchObject({ projectId: 'p1', fileName: 'uji.xlsx' })
    expect(body.importId).toMatch(/^[0-9a-f-]{36}-1$/)
    expect(body.rows).toEqual([
      { itemId: 'i1', type: 'masuk', qty: 40, date: '2026-11-10', note: 'Kiriman' },
      { itemId: 'i2', type: 'keluar', qty: 2.5, date: '2026-11-12', note: 'cor' },
    ])
    expect(
      within(screen.getByText('Hasil impor').closest('section') as HTMLElement).getByRole('status')
        .textContent,
    ).toContain('2 transaksi diimpor')
  })

  it('baris yang ditolak server ditampilkan dengan nomor baris Excel dan alasan', async () => {
    mocks.api.mockResolvedValue({
      results: [
        { index: 1, status: 'ok' },
        {
          index: 2,
          status: 'error',
          code: 'insufficient',
          message: 'Stok tidak cukup. Jumlah keluar maksimal pada tanggal itu: 10.',
        },
      ],
    })
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(
      await xlsxFile([
        ['2026-11-10', 'Semen', 'Masuk', 1, ''],
        ['2026-11-11', 'Semen', 'Keluar', 999, ''],
      ]),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Impor 2 baris valid' }))
    const t = await screen.findByRole('region', { name: 'Baris ditolak server' })
    expect(within(t).getByText('3')).toBeTruthy() // baris Excel 3
    expect(within(t).getByText(/Stok tidak cukup/)).toBeTruthy()
    expect(
      within(screen.getByText('Hasil impor').closest('section') as HTMLElement).getByRole('status')
        .textContent,
    ).toContain('1 ditolak server')
  })

  it('berkas besar dipecah per 150 baris', async () => {
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(await xlsxFile(Array.from({ length: 160 }, () => ['2026-11-10', 'Semen', 'Masuk', 1, ''])))
    fireEvent.click(await screen.findByRole('button', { name: 'Impor 160 baris valid' }))
    await screen.findByText('Hasil impor')
    expect(mocks.api).toHaveBeenCalledTimes(2)
    expect(mocks.api.mock.calls.map((c) => c[1].rows.length)).toEqual([150, 10])
    expect(mocks.api.mock.calls[0][1].importId).not.toBe(mocks.api.mock.calls[1][1].importId)
  })

  it('gagal jaringan: pratinjau dipertahankan dan ulangan memakai ID impor yang sama (tidak ganda)', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Tidak dapat terhubung ke server.'))
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(await xlsxFile([['2026-11-10', 'Semen', 'Masuk', 1, '']]))
    fireEvent.click(await screen.findByRole('button', { name: 'Impor 1 baris valid' }))
    await screen.findByText(/kelompok baris gagal dikirim/)
    fireEvent.click(screen.getByRole('button', { name: 'Impor 1 baris valid' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2))
    expect(mocks.api.mock.calls[0][1].importId).toBe(mocks.api.mock.calls[1][1].importId)
  })

  it('berkas bukan xlsx atau tanpa judul kolom ditolak dengan pesan jelas', async () => {
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(new File(['a,b'], 'data.csv'))
    expect((await screen.findByRole('alert')).textContent).toContain('.xlsx')
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('x').addRow(['foo', 'bar'])
    upload(new File([(await wb.xlsx.writeBuffer()) as BlobPart], 'x.xlsx'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Judul kolom'))
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('semua baris salah: tombol impor nonaktif', async () => {
    wrap(as(perms), <IOPage />)
    await screen.findByText('Tarik berkas .xlsx ke sini')
    upload(await xlsxFile([['x', 'Semen', 'Masuk', 1, '']]))
    const b = (await screen.findByRole('button', { name: 'Impor 0 baris valid' })) as HTMLButtonElement
    expect(b.disabled).toBe(true)
  })
})

describe('Impor penyiapan: katalog barang dan saldo awal', () => {
  const perms = ['export', 'import', 'catalog', 'inventory.write', 'inventory.read']
  const catFile = (rows: unknown[][]) =>
    xlsxSheet('Katalog', ['Nama Barang', 'Satuan', 'Kategori', 'Batas Minimum'], rows)
  const openFile = (rows: unknown[][]) =>
    xlsxSheet('Saldo Awal', ['Nama Barang', 'Saldo Awal', 'Tanggal Saldo Awal', 'Batas Minimum'], rows)
  async function xlsxSheet(sheet: string, head: string[], rows: unknown[][]) {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(sheet)
    ws.addRow(head)
    rows.forEach((r) => ws.addRow(r))
    return new File([(await wb.xlsx.writeBuffer()) as BlobPart], 'penyiapan.xlsx')
  }
  const pick = (v: string) => fireEvent.change(screen.getByLabelText('Jenis impor'), { target: { value: v } })

  it('pilihan jenis impor hanya memuat yang diizinkan', async () => {
    wrap(as(perms), <IOPage />)
    const sel = (await screen.findByLabelText('Jenis impor')) as HTMLSelectElement
    expect([...sel.options].map((o) => o.textContent)).toEqual([
      'Transaksi stok',
      'Katalog barang',
      'Saldo awal proyek',
    ])
  })

  it('hanya izin import tanpa katalog/inventory.write: tidak ada jenis yang bisa dipakai', async () => {
    wrap(as(['import']), <IOPage />)
    await screen.findByText(/belum diberi izin impor/)
    expect(screen.queryByLabelText('Jenis impor')).toBeNull()
  })

  it('katalog: template, pratinjau menolak nama yang sudah ada, kirim tanpa proyek', async () => {
    wrap(as(perms), <IOPage />)
    await screen.findByLabelText('Jenis impor')
    pick('catalog')
    fireEvent.click(screen.getByRole('button', { name: 'Unduh template Excel' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.download.mock.calls[0][1]).toBe('wkn-template-katalog-barang.xlsx')
    upload(
      await catFile([
        ['Solar', 'Liter', 'BBM', '5,5'],
        [' semen ', 'Sak', '', ''],
        ['Besi', '', '', ''],
      ]),
    )
    await screen.findByText(/1 baris valid, 2 baris perlu diperbaiki/)
    expect(screen.getByText('Nama barang sudah ada di katalog.')).toBeTruthy()
    expect(screen.getByText('Satuan kosong.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Impor 1 baris valid' }))
    await screen.findByText('Hasil impor')
    const [path, body] = mocks.api.mock.calls[0]
    expect(path).toBe('/catalog/import')
    expect(body.projectId).toBeUndefined()
    expect(body.rows).toEqual([{ name: 'Solar', unit: 'Liter', category: 'BBM', minStock: 5.5 }])
    const res = within(screen.getByText('Hasil impor').closest('section') as HTMLElement)
    expect(res.getByRole('status').textContent).toContain('1 barang diimpor')
    expect(res.getByRole('link', { name: 'Lihat di Katalog Barang' }).getAttribute('href')).toBe('#catalog')
  })

  it('saldo awal: template terisi barang katalog; baris kosong dilewati; kirim dengan proyek', async () => {
    mocks.listProjectItems.mockResolvedValue([IT('i1')]) // Pasir (i2) belum di proyek
    wrap(as(perms), <IOPage />)
    await screen.findByLabelText('Jenis impor')
    pick('opening')
    fireEvent.click(screen.getByRole('button', { name: 'Unduh template Excel' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.download.mock.calls[0][1]).toBe('wkn-template-saldo-awal-jalan-maros.xlsx')
    upload(
      await openFile([
        ['Pasir', 50, '2026-09-01', ''],
        ['Semen', '', '', ''],
        ['Barang Asing', 5, '2026-09-01', ''],
      ]),
    )
    await screen.findByText(/1 baris valid, 1 baris perlu diperbaiki/)
    expect(screen.getByText(/1 baris tanpa isian dilewati/)).toBeTruthy()
    expect(screen.getByText(/tidak ada di katalog/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Impor 1 baris valid' }))
    await screen.findByText('Hasil impor')
    const [path, body] = mocks.api.mock.calls[0]
    expect(path).toBe('/items/import')
    expect(body.projectId).toBe('p1')
    expect(body.rows).toEqual([{ catalogId: 'i2', openingQty: 50, openingDate: '2026-09-01' }])
    const res = within(screen.getByText('Hasil impor').closest('section') as HTMLElement)
    expect(res.getByRole('link', { name: 'Lihat barang proyek' }).getAttribute('href')).toBe('#projects/p1')
  })

  it('barang yang sudah ada di proyek ditandai di pratinjau, dan penolakan server tampil dengan nomor baris', async () => {
    mocks.listProjectItems.mockResolvedValue([IT('i1')])
    mocks.api.mockResolvedValue({
      results: [
        { index: 1, status: 'error', code: 'item_exists', message: 'Barang ini sudah ada di proyek.' },
      ],
    })
    wrap(as(perms), <IOPage />)
    await screen.findByLabelText('Jenis impor')
    pick('opening')
    upload(
      await openFile([
        ['Semen', 5, '2026-09-01', ''],
        ['Pasir', 7, '2026-09-01', ''],
      ]),
    )
    await screen.findByText(/1 baris valid, 1 baris perlu diperbaiki/)
    expect(screen.getByText(/sudah ada di proyek ini/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Impor 1 baris valid' }))
    const t = await screen.findByRole('region', { name: 'Baris ditolak server' })
    expect(within(t).getByText('3')).toBeTruthy()
  })

  it('"Pilih berkas" adalah tombol yang dapat difokus dengan keyboard', async () => {
    wrap(as(perms), <IOPage />)
    const b = await screen.findByRole('button', { name: 'Pilih berkas' })
    b.focus()
    expect(document.activeElement).toBe(b)
    expect((document.getElementById('io-file') as HTMLInputElement).tabIndex).toBe(-1)
  })
})
