/** Excel: dibaca dan ditulis di perangkat (ExcelJS dimuat hanya saat diperlukan). Berkas tidak pernah dikirim ke server. */
import type { Cell, ExportMeta, Table } from './exportTables'
import { MAX_FILE_BYTES, MAX_ROWS, safeCell, type RawRow } from './importRows'

const NUM_FMT = '#,##0.###'

async function excel() {
  const mod = await import('exceljs')
  return (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const toBlob = (buf: ArrayBuffer | Uint8Array) => new Blob([buf as BlobPart], { type: XLSX_MIME })

/** Buku kerja ekspor: satu lembar per tabel, dengan judul, proyek, periode, pembuat, dan waktu cetak di atas. */
export async function buildWorkbook(m: ExportMeta, tables: Table[]): Promise<Blob> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  wb.creator = m.by
  wb.created = new Date()
  for (const t of tables) {
    const ws = wb.addWorksheet(t.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 6 }] })
    ws.addRow([`PT. Wiratama Karya Nugraha — ${m.title}`]).font = { bold: true, size: 14 }
    ws.addRow([`Proyek: ${m.project}`])
    ws.addRow([`Periode: ${m.period}`])
    ws.addRow([`Dibuat oleh: ${m.by} (${m.role})`])
    ws.addRow([`Dicetak: ${m.printedAt}`])
    const head = ws.addRow(t.head)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1414E0' } }))
    const widths = t.head.map((h) => h.length + 2)
    for (const r of t.rows) {
      const row = ws.addRow(r.map((v: Cell) => (typeof v === 'string' ? safeCell(v) : v)))
      r.forEach((v, i) => {
        if (typeof v === 'string') widths[i] = Math.min(48, Math.max(widths[i], v.length + 2))
        if (t.numeric.includes(i)) row.getCell(i + 1).numFmt = NUM_FMT
      })
    }
    ws.columns.forEach((c, i) => (c.width = Math.max(10, widths[i] ?? 12)))
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: t.head.length } }
  }
  return toBlob(await wb.xlsx.writeBuffer())
}

export const TEMPLATE_HEAD = ['Tanggal', 'Nama Barang', 'Jenis', 'Jumlah', 'Keterangan']

/** Template impor: lembar Transaksi (kosong, dengan daftar pilihan Jenis), Barang (nama yang sah), dan Petunjuk. */
export async function buildTemplate(
  projectName: string,
  items: { name: string; unit: string }[],
): Promise<Blob> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transaksi', { views: [{ state: 'frozen', ySplit: 1 }] })
  const head = ws.addRow(TEMPLATE_HEAD)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1414E0' } }))
  ws.columns = [{ width: 14 }, { width: 34 }, { width: 10 }, { width: 12 }, { width: 40 }]
  for (let r = 2; r <= 501; r++) {
    ws.getCell(`A${r}`).numFmt = 'yyyy-mm-dd'
    ws.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Masuk,Keluar"'] }
  }
  const bs = wb.addWorksheet('Barang')
  bs.addRow(['Nama Barang (salin persis)', 'Satuan']).font = { bold: true }
  for (const i of items) bs.addRow([safeCell(i.name), safeCell(i.unit)])
  bs.columns = [{ width: 40 }, { width: 14 }]
  const ps = wb.addWorksheet('Petunjuk')
  ;[
    `Template impor transaksi stok untuk proyek: ${projectName}`,
    '',
    'Isi lembar "Transaksi" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Tanggal: YYYY-MM-DD (mis. 2026-11-17). Tidak boleh sebelum tanggal saldo awal barang dan tidak boleh di masa depan.',
    'Nama Barang: salin persis dari lembar "Barang". Barang harus sudah punya saldo awal.',
    'Jenis: Masuk atau Keluar.',
    'Jumlah: angka lebih dari 0, maksimal 3 desimal.',
    'Keterangan: opsional, maksimal 200 karakter.',
    '',
    'Pratinjau menandai baris yang salah. Hanya baris yang benar yang diimpor, atas nama Anda.',
    'Stok tidak boleh negatif: barang masuk dalam berkas diproses lebih dulu, lalu barang keluar menurut tanggal.',
    `Maksimal ${MAX_ROWS} baris dan ${MAX_FILE_BYTES / 1024 / 1024} MB per berkas.`,
  ].forEach((t, i) => (ps.addRow([t]).font = i === 0 ? { bold: true } : {}))
  ps.getColumn(1).width = 110
  return toBlob(await wb.xlsx.writeBuffer())
}

type Raw = unknown
function cellValue(v: Raw): unknown {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return cellValue(o.result)
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return String(o.text ?? '')
    return '' // galat rumus dan sejenisnya
  }
  return v
}

const readBuffer = (f: Blob): Promise<ArrayBuffer> =>
  typeof f.arrayBuffer === 'function'
    ? f.arrayBuffer()
    : new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as ArrayBuffer)
        fr.onerror = () => rej(fr.error)
        fr.readAsArrayBuffer(f)
      })

export class ImportFileError extends Error {}

/** Membaca lembar "Transaksi" (atau lembar pertama). Mencari baris judul di 5 baris pertama; baris kosong dilewati. */
export async function readImportFile(file: Blob & { name?: string }): Promise<RawRow[]> {
  if (file.size > MAX_FILE_BYTES)
    throw new ImportFileError(`Berkas terlalu besar (maksimal ${MAX_FILE_BYTES / 1024 / 1024} MB).`)
  if (file.name && !/\.xlsx$/i.test(file.name))
    throw new ImportFileError(
      'Hanya berkas .xlsx yang didukung. Simpan dari Excel sebagai "Buku Kerja Excel (.xlsx)".',
    )
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await readBuffer(file))
  } catch {
    throw new ImportFileError(
      'Berkas tidak dapat dibaca. Pastikan berkas .xlsx yang valid dan tidak diberi kata sandi.',
    )
  }
  const ws = wb.getWorksheet('Transaksi') ?? wb.worksheets[0]
  if (!ws) throw new ImportFileError('Berkas tidak memuat lembar kerja.')
  const norm = (v: unknown) =>
    String(cellValue(v) ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  const want = {
    date: 'tanggal',
    name: 'nama barang',
    type: 'jenis',
    qty: 'jumlah',
    note: 'keterangan',
  } as const
  let headRow = 0
  const col: Partial<Record<keyof typeof want, number>> = {}
  for (let r = 1; r <= Math.min(5, ws.rowCount) && !headRow; r++) {
    const found: typeof col = {}
    ws.getRow(r).eachCell((c, n) => {
      for (const [k, label] of Object.entries(want))
        if (norm(c.value) === label) found[k as keyof typeof want] = n
    })
    if (found.date && found.name && found.type && found.qty) {
      headRow = r
      Object.assign(col, found)
    }
  }
  if (!headRow)
    throw new ImportFileError(
      'Judul kolom tidak ditemukan. Gunakan template: Tanggal, Nama Barang, Jenis, Jumlah, Keterangan.',
    )
  const out: RawRow[] = []
  for (let r = headRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const get = (k: keyof typeof want) => (col[k] ? cellValue(row.getCell(col[k] as number).value) : '')
    const rec = {
      rowNo: r,
      date: get('date'),
      name: get('name'),
      type: get('type'),
      qty: get('qty'),
      note: get('note'),
    }
    if (
      Object.values(rec)
        .slice(1)
        .every((v) => v === '' || v === null)
    )
      continue
    out.push(rec)
    if (out.length > MAX_ROWS)
      throw new ImportFileError(`Berkas memuat lebih dari ${MAX_ROWS} baris. Bagi menjadi beberapa berkas.`)
  }
  if (out.length === 0) throw new ImportFileError('Tidak ada baris data pada berkas.')
  return out
}
