import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { meta, transactionTable } from './exportTables'
import { buildPdf } from './pdf'
import { MAX_FILE_BYTES } from './importRows'
import { buildTemplate, buildWorkbook, ImportFileError, readImportFile } from './spreadsheet'

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
const put = (ws: ExcelJS.Worksheet, r: number, vals: unknown[]) =>
  vals.forEach((v, i) => (ws.getCell(r, i + 1).value = v as ExcelJS.CellValue))
async function toFile(wb: ExcelJS.Workbook, name = 'uji.xlsx') {
  const buf = await wb.xlsx.writeBuffer()
  return Object.assign(new Blob([buf as BlobPart]), { name })
}

describe('template dan impor Excel', () => {
  it('template memuat judul kolom, daftar barang, dan petunjuk', async () => {
    const wb = await load(
      await buildTemplate('Jalan Maros', [
        { name: 'Semen', unit: 'Sak' },
        { name: '=HYPERLINK("x")', unit: 'm3' },
      ]),
    )
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Transaksi', 'Contoh Pengisian', 'Barang', 'Petunjuk'])
    expect(wb.getWorksheet('Transaksi')!.getRow(1).values).toEqual([
      undefined,
      'Tanggal',
      'Nama Barang',
      'Jenis',
      'Jumlah',
      'Keterangan',
    ])
    expect(String(wb.getWorksheet('Barang')!.getCell('A3').value)).toBe('\'=HYPERLINK("x")') // tidak menjadi rumus
  })

  it('lembar contoh memakai nama barang proyek, memuat contoh benar dan salah, dan TIDAK ikut diimpor', async () => {
    const blob = await buildTemplate('P', [
      { name: 'Semen', unit: 'Sak' },
      { name: 'Pasir', unit: 'm3' },
    ])
    const wb = await load(blob)
    const cs = wb.getWorksheet('Contoh Pengisian')!
    const text: string[] = []
    cs.eachRow((r) => text.push(r.values ? (r.values as unknown[]).join('|') : ''))
    const all = text.join('\n')
    expect(all).toContain('Semen')
    expect(all).toContain('Pasir')
    expect(all).toContain('BENAR')
    expect(all).toContain('SALAH')
    expect(wb.getWorksheet('Transaksi')!.getCell('A1').note).toBeTruthy()
    // lembar Transaksi tetap kosong -> tidak ada baris untuk diimpor
    await expect(readImportFile(Object.assign(blob, { name: 'x.xlsx' }))).rejects.toThrow(/Tidak ada baris/)
  })

  it('isian pengguna terbaca: tanggal Excel, teks, angka, baris kosong dilewati, nomor baris asli', async () => {
    const wb = await load(await buildTemplate('P', [{ name: 'Semen', unit: 'Sak' }]))
    const ws = wb.getWorksheet('Transaksi')!
    put(ws, 2, [new Date(Date.UTC(2026, 10, 3)), 'Semen', 'Masuk', 40, 'Kiriman'])
    put(ws, 4, ['2026-11-04', ' semen ', 'keluar', '2,5', null])
    put(ws, 5, [
      { formula: 'A2+1', result: new Date(Date.UTC(2026, 10, 4)) },
      { richText: [{ text: 'Se' }, { text: 'men' }] },
      'Masuk',
      1,
      '',
    ])
    const rows = await readImportFile(await toFile(wb))
    expect(rows.map((r) => r.rowNo)).toEqual([2, 4, 5])
    expect(rows[0]).toMatchObject({ name: 'Semen', type: 'Masuk', qty: 40, note: 'Kiriman' })
    expect((rows[0].date as Date).toISOString().slice(0, 10)).toBe('2026-11-03')
    expect(rows[1]).toMatchObject({ date: '2026-11-04', name: ' semen ', qty: '2,5' })
    expect(rows[2].name).toBe('Semen')
    expect((rows[2].date as Date).toISOString().slice(0, 10)).toBe('2026-11-04')
  })

  it('judul kolom boleh bergeser beberapa baris dan berbeda huruf', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Data')
    ws.addRow(['Laporan gudang'])
    ws.addRow(['JENIS', 'jumlah', 'Nama  Barang', 'TANGGAL'])
    ws.addRow(['Masuk', 3, 'Pasir', '2026-11-01'])
    const rows = await readImportFile(await toFile(wb))
    expect(rows).toEqual([{ rowNo: 3, date: '2026-11-01', name: 'Pasir', type: 'Masuk', qty: 3, note: '' }])
  })

  it('galat yang jelas: bukan xlsx, rusak, tanpa judul, kosong, terlalu besar', async () => {
    await expect(readImportFile(Object.assign(new Blob(['x']), { name: 'a.csv' }))).rejects.toThrow(/\.xlsx/)
    await expect(readImportFile(Object.assign(new Blob(['bukan zip']), { name: 'a.xlsx' }))).rejects.toThrow(
      ImportFileError,
    )
    const noHead = new ExcelJS.Workbook()
    noHead.addWorksheet('x').addRow(['a', 'b'])
    await expect(readImportFile(await toFile(noHead))).rejects.toThrow(/Judul kolom/)
    const empty = await load(await buildTemplate('P', []))
    await expect(readImportFile(await toFile(empty))).rejects.toThrow(/Tidak ada baris/)
    await expect(
      readImportFile({ size: MAX_FILE_BYTES + 1, name: 'b.xlsx' } as unknown as Blob),
    ).rejects.toThrow(/terlalu besar/)
  })
})

describe('ekspor', () => {
  const m = meta(
    'Transaksi Stok',
    'Jalan Maros',
    'November 2026',
    'Budi',
    'Manajer Proyek',
    new Date('2026-11-18T03:00:00Z'),
  )
  const t = transactionTable([
    {
      key: 'a',
      date: '2026-11-02',
      itemId: 'i1',
      itemName: 'Semen',
      unit: 'Sak',
      in: 40,
      out: null,
      balance: 140,
      note: '=cmd()',
      kind: 'masuk',
      corrected: false,
    },
  ])
  it('Excel: kop (judul, proyek, periode, pembuat, waktu), judul kolom, angka tetap angka, rumus dinetralkan', async () => {
    const wb = await load(await buildWorkbook(m, [t]))
    const ws = wb.getWorksheet('Transaksi')!
    expect(String(ws.getCell('A1').value)).toContain('PT. Wiratama Karya Nugraha')
    expect(String(ws.getCell('A2').value)).toBe('Proyek: Jalan Maros')
    expect(String(ws.getCell('A4').value)).toContain('Budi (Manajer Proyek)')
    expect(String(ws.getCell('A5').value)).toContain('WITA')
    expect(ws.getRow(6).getCell(5).value).toBe('Masuk')
    expect(ws.getRow(7).getCell(5).value).toBe(40)
    expect(ws.getRow(7).getCell(7).value).toBe(140)
    expect(ws.getRow(7).getCell(8).value).toBe("'=cmd()")
  })
  it('PDF: berkas PDF sah dengan kop', async () => {
    const blob = await buildPdf(m, [t, { ...t, title: 'Ringkasan' }])
    const head = await new Promise<string>((res) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.readAsText(blob.slice(0, 8))
    })
    expect(head.startsWith('%PDF-')).toBe(true)
    expect(blob.size).toBeGreaterThan(1500)
  })
})
