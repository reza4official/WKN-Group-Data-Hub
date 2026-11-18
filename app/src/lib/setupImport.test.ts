import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { splitUnfilled, validateCatalog, validateOpening, type CatalogRef } from './setupImport'
import { buildCatalogTemplate, buildOpeningTemplate, readCatalogFile, readOpeningFile } from './setupSheets'

const c = (rowNo: number, name: unknown, unit: unknown, category: unknown = '', minStock: unknown = '') => ({
  rowNo,
  name,
  unit,
  category,
  minStock,
})

describe('validateCatalog', () => {
  it('baris benar: nilai dirapikan, minimum kosong = 0, koma desimal', () => {
    const r = validateCatalog(
      [
        c(2, '  Semen  Portland ', 'Sak', 'Bahan', 100),
        c(3, 'Solar', 'Liter'),
        c(4, 'Besi', 'Btg', '', '12,5'),
      ],
      [],
    )
    expect(r.map((x) => x.error)).toEqual(['', '', ''])
    expect(r[0]).toMatchObject({ name: 'Semen Portland', minStock: 100 })
    expect(r[1]).toMatchObject({ minStock: 0, category: '' })
    expect(r[2].minStock).toBe(12.5)
  })
  it.each([
    [c(2, '', 'x'), 'Nama barang kosong'],
    [c(2, 'A', ''), 'Satuan kosong'],
    [c(2, 'A'.repeat(161), 'x'), '160'],
    [c(2, 'A', 'x'.repeat(41)), '40'],
    [c(2, 'A', 'x', 'k'.repeat(81)), '80'],
    [c(2, 'A', 'x', '', 'abc'), 'bukan angka'],
    [c(2, 'A', 'x', '', -1), 'negatif'],
    [c(2, 'A', 'x', '', 1.2345), '3 angka desimal'],
  ])('menolak %j', (row, msg) => expect(validateCatalog([row], [])[0].error).toContain(msg))
  it('nama yang sudah ada di katalog dan kembar di dalam berkas ditolak (tanpa beda huruf/spasi)', () => {
    const r = validateCatalog([c(2, 'SEMEN', 'x'), c(3, 'Besi', 'x'), c(4, ' besi ', 'x')], ['Semen'])
    expect(r.map((x) => x.error)).toEqual([
      'Nama barang sudah ada di katalog.',
      '',
      'Nama barang kembar dengan baris 3 di berkas ini.',
    ])
  })
})

describe('opening', () => {
  const cat: CatalogRef[] = [
    { id: 'i1', name: 'Semen', active: true },
    { id: 'i2', name: 'Pasir', active: true },
    { id: 'i3', name: 'Besi', active: false },
  ]
  const o = (rowNo: number, name: unknown, qty: unknown, date: unknown, minStock: unknown = '') => ({
    rowNo,
    name,
    qty,
    date,
    minStock,
  })
  const v = (row: ReturnType<typeof o>, inProject = new Set<string>()) =>
    validateOpening([row], cat, inProject, '2026-11-18')[0]

  it('baris benar menghasilkan ID katalog, jumlah, tanggal ISO, minimum opsional', () => {
    expect(v(o(2, ' semen ', '600', '2026-09-01'))).toMatchObject({
      error: '',
      catalogId: 'i1',
      qty: 600,
      date: '2026-09-01',
      minStock: null,
    })
    expect(v(o(2, 'Pasir', 0, new Date(Date.UTC(2026, 8, 1)), '5,5'))).toMatchObject({
      error: '',
      qty: 0,
      date: '2026-09-01',
      minStock: 5.5,
    })
  })
  it.each([
    [o(2, '', 1, '2026-09-01'), 'Nama barang kosong'],
    [o(2, 'Tidak ada', 1, '2026-09-01'), 'tidak ada di katalog'],
    [o(2, 'Besi', 1, '2026-09-01'), 'nonaktif'],
    [o(2, 'Semen', 'x', '2026-09-01'), 'bukan angka'],
    [o(2, 'Semen', -1, '2026-09-01'), 'negatif'],
    [o(2, 'Semen', 1.2345, '2026-09-01'), '3 angka desimal'],
    [o(2, 'Semen', 1, ''), 'Tanggal'],
    [o(2, 'Semen', 1, '2026-11-19'), 'masa depan'],
    [o(2, 'Semen', 1, '2026-09-01', 'abc'), 'bukan angka'],
    [o(2, 'Semen', 1, '2026-09-01', -2), 'Batas minimum'],
  ])('menolak %j', (row, msg) => expect(v(row).error).toContain(msg))
  it('barang yang sudah di proyek dan kembar di berkas ditolak', () => {
    expect(v(o(2, 'Semen', 1, '2026-09-01'), new Set(['i1'])).error).toContain('sudah ada di proyek')
    const r = validateOpening(
      [o(2, 'Semen', 1, '2026-09-01'), o(3, 'semen', 2, '2026-09-01')],
      cat,
      new Set(),
      '2026-11-18',
    )
    expect(r.map((x) => x.error)).toEqual(['', 'Barang kembar dengan baris 2 di berkas ini.'])
  })
  it('baris yang saldo dan tanggalnya kosong dilewati (template terisi nama barang)', () => {
    const { rows, skipped } = splitUnfilled([
      o(2, 'Semen', '', ''),
      o(3, 'Pasir', 5, ''),
      o(4, 'Besi', '', '2026-09-01'),
      o(5, 'X', ' ', null),
    ])
    expect(rows.map((r) => r.rowNo)).toEqual([3, 4]) // diisi sebagian tetap divalidasi dan ditandai salah
    expect(skipped).toBe(2)
  })
})

async function load(blob: Blob) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(
    await new Promise<ArrayBuffer>((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as ArrayBuffer)
      fr.readAsArrayBuffer(blob)
    }),
  )
  return wb
}
const toFile = async (wb: ExcelJS.Workbook) =>
  Object.assign(new Blob([(await wb.xlsx.writeBuffer()) as BlobPart]), { name: 'x.xlsx' })

describe('template katalog', () => {
  it('lembar Katalog, Contoh Pengisian (benar dan salah), Barang di Katalog, Petunjuk; contoh tidak ikut diimpor', async () => {
    const blob = await buildCatalogTemplate([{ name: 'Semen', unit: 'Sak' }])
    const wb = await load(blob)
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Katalog',
      'Contoh Pengisian',
      'Barang di Katalog',
      'Petunjuk',
    ])
    expect(wb.getWorksheet('Katalog')!.getRow(1).values).toEqual([
      undefined,
      'Nama Barang',
      'Satuan',
      'Kategori',
      'Batas Minimum',
    ])
    const ex: string[] = []
    wb.getWorksheet('Contoh Pengisian')!.eachRow((r) => ex.push((r.values as unknown[]).join('|')))
    expect(ex.join('\n')).toMatch(/BENAR/)
    expect(ex.join('\n')).toMatch(/SALAH/)
    expect(ex.join('\n')).toContain('sudah ada di katalog Anda')
    await expect(readCatalogFile(Object.assign(blob, { name: 'x.xlsx' }))).rejects.toThrow(/Tidak ada baris/)
  })
  it('isian pengguna terbaca dan lolos validasi', async () => {
    const wb = await load(await buildCatalogTemplate([]))
    const ws = wb.getWorksheet('Katalog')!
    ;[
      ['Semen Portland', 'Sak', 'Bahan', 100],
      ['Solar', 'Liter'],
    ].forEach((r, i) => r.forEach((v, k) => (ws.getCell(i + 2, k + 1).value = v)))
    const raw = await readCatalogFile(await toFile(wb))
    expect(raw.map((r) => r.rowNo)).toEqual([2, 3])
    expect(validateCatalog(raw, []).map((x) => x.error)).toEqual(['', ''])
  })
})

describe('template saldo awal', () => {
  const catalog = [
    { id: 'i1', name: 'Semen', unit: 'Sak', minStock: 10, active: true },
    { id: 'i2', name: 'Pasir', unit: 'm3', minStock: 5, active: true },
    { id: 'i3', name: 'Besi', unit: 'Btg', minStock: 0, active: false },
    { id: 'i4', name: 'Solar', unit: 'Liter', minStock: 0, active: true },
  ]
  it('lembar Saldo Awal terisi nama barang katalog aktif yang belum di proyek; yang sudah di proyek terdaftar terpisah', async () => {
    const wb = await load(await buildOpeningTemplate('Test', catalog, new Set(['i4'])))
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Saldo Awal',
      'Contoh Pengisian',
      'Sudah di Proyek',
      'Petunjuk',
    ])
    const names: string[] = []
    wb.getWorksheet('Saldo Awal')!.eachRow((r, n) => n > 1 && names.push(String(r.getCell(1).value)))
    expect(names).toEqual(['Pasir', 'Semen']) // urut nama; Besi nonaktif dan Solar sudah di proyek tidak ikut
    expect(String(wb.getWorksheet('Sudah di Proyek')!.getCell('A2').value)).toBe('Solar')
    expect(wb.getWorksheet('Saldo Awal')!.getCell('A1').note).toBeTruthy()
  })
  it('pengisi hanya melengkapi saldo dan tanggal; baris kosong dilewati dan hasilnya valid', async () => {
    const wb = await load(await buildOpeningTemplate('Test', catalog, new Set(['i4'])))
    const ws = wb.getWorksheet('Saldo Awal')!
    ws.getCell('B3').value = 600
    ws.getCell('C3').value = new Date(Date.UTC(2026, 8, 1))
    const raw = await readOpeningFile(await toFile(wb))
    const { rows, skipped } = splitUnfilled(raw)
    expect(skipped).toBe(1)
    const v = validateOpening(rows, catalog, new Set(['i4']), '2026-11-18')
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({
      error: '',
      itemName: 'Semen',
      catalogId: 'i1',
      qty: 600,
      date: '2026-09-01',
    })
  })
})
