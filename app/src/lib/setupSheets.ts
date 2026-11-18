/** Template dan pembaca Excel untuk impor penyiapan (katalog barang dan saldo awal). */
import { safeCell } from './importRows'
import type { RawCatalogRow, RawOpeningRow } from './setupImport'
import { excel, readSheet } from './spreadsheet'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type Wb = InstanceType<Awaited<ReturnType<typeof excel>>['Workbook']>
type Ws = ReturnType<Wb['addWorksheet']>

const styleHead = (ws: Ws, row: number, argb = 'FF1414E0') => {
  const r = ws.getRow(row)
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }))
}

function instructions(wb: Wb, lines: string[]) {
  const ps = wb.addWorksheet('Petunjuk')
  lines.forEach((t, i) => (ps.addRow([t]).font = i === 0 ? { bold: true } : {}))
  ps.getColumn(1).width = 110
}

function exampleSheet(wb: Wb, head: string[], examples: (string | number)[][], note: string) {
  const cs = wb.addWorksheet('Contoh Pengisian')
  cs.addRow([note]).font = { bold: true }
  cs.addRow([...head, 'Penjelasan'])
  styleHead(cs, 2, 'FF7A7A7A')
  for (const r of examples) {
    const row = cs.addRow(r)
    const last = String(r[r.length - 1])
    row.getCell(head.length + 1).font = {
      italic: true,
      color: { argb: last.startsWith('BENAR') ? 'FF17803D' : 'FFB42318' },
    }
  }
  cs.columns = [...head.map((h) => ({ width: Math.max(16, h.length + 4) })), { width: 84 }]
}

const out = async (wb: Wb) => new Blob([(await wb.xlsx.writeBuffer()) as BlobPart], { type: XLSX_MIME })

export const CATALOG_HEAD = ['Nama Barang', 'Satuan', 'Kategori', 'Batas Minimum']

/** Template katalog: lembar Katalog (kosong), Contoh Pengisian (tidak diimpor), Barang di Katalog (agar tidak kembar), Petunjuk. */
export async function buildCatalogTemplate(existing: { name: string; unit: string }[]): Promise<Blob> {
  const E = await excel()
  const wb = new E.Workbook()
  const ws = wb.addWorksheet('Katalog', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(CATALOG_HEAD)
  styleHead(ws, 1)
  ws.columns = [{ width: 36 }, { width: 14 }, { width: 22 }, { width: 16 }]
  const hints = [
    'Nama baku barang, unik di seluruh grup (huruf besar/kecil tidak dibedakan).',
    'Mis. Sak, m3, Batang, Liter.',
    'Opsional, mis. Bahan Bangunan.',
    'Angka 0 atau lebih (maksimal 3 desimal); bawaan untuk proyek. Kosong = 0.',
  ]
  hints.forEach((t, i) => (ws.getRow(1).getCell(i + 1).note = t))
  const ex = existing[0]?.name
  exampleSheet(
    wb,
    CATALOG_HEAD,
    [
      [
        'Semen Portland',
        'Sak',
        'Bahan Bangunan',
        100,
        'BENAR: batas minimum 100 sak (peringatan stok kritis di Dashboard).',
      ],
      ['Pasir Beton', 'm3', 'Agregat', 20, 'BENAR: satuan bebas, mis. m3.'],
      ['Solar', 'Liter', '', '', 'BENAR: kategori dan batas minimum boleh kosong (minimum jadi 0).'],
      ['Besi Beton 10 mm', 'Batang', 'Besi', '12,5', 'BENAR: angka boleh desimal (koma atau titik).'],
      ['Pasir Beton', 'm3', 'Agregat', 20, 'SALAH: nama kembar dengan baris di atasnya (baris ini ditolak).'],
      ['Paku 5 cm', '', 'Bahan Bangunan', 5, 'SALAH: satuan kosong (baris ini ditolak).'],
      ['Kawat Bendrat', 'Kg', '', -3, 'SALAH: batas minimum tidak boleh negatif (baris ini ditolak).'],
      ...(ex ? [[ex, 'Sak', '', '', 'SALAH: nama ini sudah ada di katalog Anda (baris ini ditolak).']] : []),
    ],
    'Contoh pengisian. Lembar ini TIDAK diimpor: salin pola yang benar ke lembar "Katalog" mulai baris 2.',
  )
  const ls = wb.addWorksheet('Barang di Katalog')
  ls.addRow(['Nama Barang yang sudah ada', 'Satuan'])
  styleHead(ls, 1, 'FF7A7A7A')
  for (const e of existing) ls.addRow([safeCell(e.name), safeCell(e.unit)])
  ls.columns = [{ width: 40 }, { width: 14 }]
  instructions(wb, [
    'Template impor katalog barang',
    '',
    'Isi lembar "Katalog" mulai baris 2. Jangan mengubah judul kolom di baris 1. Lihat "Contoh Pengisian" untuk pola benar dan kesalahan umum (lembar contoh tidak diimpor).',
    'Nama Barang dan Satuan wajib. Kategori dan Batas Minimum opsional.',
    'Nama harus unik; lihat lembar "Barang di Katalog" agar tidak kembar. Baris dengan nama yang sudah ada ditolak, baris lain tetap masuk.',
    'Satuan barang tidak dapat diganti setelah dipakai proyek, jadi pastikan benar.',
    'Setelah katalog terisi, lanjutkan dengan impor "Saldo awal proyek" untuk memasukkan barang ke proyek.',
  ])
  return out(wb)
}

export const OPENING_HEAD = ['Nama Barang', 'Saldo Awal', 'Tanggal Saldo Awal', 'Batas Minimum']

/** Template saldo awal: lembar terisi nama barang katalog yang belum ada di proyek; isi saldo dan tanggal untuk yang diinginkan. */
export async function buildOpeningTemplate(
  projectName: string,
  catalog: { id: string; name: string; unit: string; minStock: number; active: boolean }[],
  inProject: Set<string>,
): Promise<Blob> {
  const E = await excel()
  const wb = new E.Workbook()
  const ws = wb.addWorksheet('Saldo Awal', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(OPENING_HEAD)
  styleHead(ws, 1)
  ws.columns = [{ width: 36 }, { width: 14 }, { width: 20 }, { width: 16 }]
  const hints = [
    'Terisi otomatis dengan barang katalog yang belum ada di proyek. Jangan diubah ejaannya.',
    'Angka 0 atau lebih (maksimal 3 desimal). Kosongkan baris yang tidak ingin dimasukkan.',
    'Format YYYY-MM-DD, mis. 2026-09-01. Tidak boleh di masa depan; transaksi tidak bisa bertanggal sebelumnya.',
    'Opsional. Kosong = memakai batas minimum bawaan katalog.',
  ]
  hints.forEach((t, i) => (ws.getRow(1).getCell(i + 1).note = t))
  const todo = catalog
    .filter((c) => c.active && !inProject.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  todo.forEach((c, i) => {
    ws.getCell(i + 2, 1).value = safeCell(c.name)
    ws.getCell(i + 2, 3).numFmt = 'yyyy-mm-dd'
  })
  const a = todo[0]?.name ?? 'Semen Portland'
  const b = todo[1]?.name ?? 'Pasir Beton'
  exampleSheet(
    wb,
    OPENING_HEAD,
    [
      [a, 600, '2026-09-01', '', 'BENAR: saldo awal 600 per 1 September; batas minimum mengikuti katalog.'],
      [b, '12,5', '2026-09-01', 5, 'BENAR: boleh desimal; batas minimum khusus proyek ini 5.'],
      ['Barang Tidak Dikenal', 10, '2026-09-01', '', 'SALAH: nama tidak ada di katalog (baris ini ditolak).'],
      [a, -5, '2026-09-01', '', 'SALAH: saldo awal tidak boleh negatif (baris ini ditolak).'],
      [b, 10, '01/13/2026', '', 'SALAH: tanggal tidak valid (baris ini ditolak).'],
      [`${b}`, '', '', '', 'DILEWATI: saldo dan tanggal kosong = barang ini tidak dimasukkan ke proyek.'],
    ],
    'Contoh pengisian. Lembar ini TIDAK diimpor: isi saldo dan tanggal langsung di lembar "Saldo Awal".',
  )
  const ds = wb.addWorksheet('Sudah di Proyek')
  ds.addRow(['Barang yang sudah ada di proyek (tidak ditimpa)', 'Satuan'])
  styleHead(ds, 1, 'FF7A7A7A')
  for (const c of catalog.filter((x) => inProject.has(x.id))) ds.addRow([safeCell(c.name), safeCell(c.unit)])
  ds.columns = [{ width: 48 }, { width: 14 }]
  instructions(wb, [
    `Template saldo awal untuk proyek: ${projectName}`,
    '',
    'Lembar "Saldo Awal" sudah berisi barang katalog yang belum ada di proyek. Isi Saldo Awal dan Tanggal untuk barang yang ingin dimasukkan; baris yang kosong dilewati.',
    'Saldo Awal wajib bersama Tanggal. Tanggal format YYYY-MM-DD dan tidak di masa depan.',
    'Barang yang sudah ada di proyek ditolak: impor tidak menimpa saldo awal yang sudah berjalan (ubah lewat halaman proyek bila belum ada transaksi).',
    'Barang yang belum ada di katalog harus diimpor ke katalog dulu (jenis impor "Katalog barang").',
    'Setelah ini barang langsung dapat menerima transaksi; transaksi lama bisa diimpor dengan jenis "Transaksi stok".',
  ])
  return out(wb)
}

export function readCatalogFile(file: Blob & { name?: string }): Promise<RawCatalogRow[]> {
  return readSheet(file, 'Katalog', {
    name: { label: 'Nama Barang', required: true },
    unit: { label: 'Satuan', required: true },
    category: { label: 'Kategori', required: false },
    minStock: { label: 'Batas Minimum', required: false },
  })
}

export function readOpeningFile(file: Blob & { name?: string }): Promise<RawOpeningRow[]> {
  return readSheet(file, 'Saldo Awal', {
    name: { label: 'Nama Barang', required: true },
    qty: { label: 'Saldo Awal', required: true },
    date: { label: 'Tanggal Saldo Awal', required: true },
    minStock: { label: 'Batas Minimum', required: false },
  })
}
