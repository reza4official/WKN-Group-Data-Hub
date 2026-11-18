/** Logika murni impor: normalisasi sel, validasi per baris, dan pemecahan permintaan. Tidak menyentuh jaringan atau berkas. */

export interface RawRow {
  /** Nomor baris di lembar kerja (untuk pesan galat). */
  rowNo: number
  date: unknown
  name: unknown
  type: unknown
  qty: unknown
  note: unknown
}
export interface ImportItem {
  id: string
  name: string
  active: boolean
  openingQty: number | null
  openingDate: string | null
}
export interface PreviewRow {
  rowNo: number
  date: string
  itemId: string
  itemName: string
  type: 'masuk' | 'keluar' | ''
  qty: number
  note: string
  /** Kosong bila baris lolos pemeriksaan di perangkat. Pemeriksaan stok dilakukan server. */
  error: string
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_ROWS = 3000
export const CHUNK_ROWS = 150
export const CHUNK_ITEMS = 10

export const normName = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Tanggal dari sel: objek Date (zona UTC), nomor seri Excel, YYYY-MM-DD, atau D/M/YYYY dan D-M-YYYY. Null bila tidak dikenali. */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10)
  }
  if (typeof v !== 'string') return null
  const t = v.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (m && valid(+m[3], +m[2], +m[1])) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  return null
}

/** Jumlah dari sel: angka, atau teks dengan koma atau titik desimal. Null bila bukan angka. */
export function parseQty(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s/g, '')
  if (!/^\d+([.,]\d+)?$/.test(t)) return null
  return Number(t.replace(',', '.'))
}

export function parseType(v: unknown): 'masuk' | 'keluar' | '' {
  const t = normName(v).replace(/^barang\s+/, '')
  return t === 'masuk' ? 'masuk' : t === 'keluar' ? 'keluar' : ''
}

/** Memeriksa satu baris terhadap barang proyek. Nama dicocokkan tanpa membedakan huruf besar/kecil dan spasi ganda. */
export function validateRow(r: RawRow, byName: Map<string, ImportItem>, today: string): PreviewRow {
  const name = String(r.name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const note = String(r.note ?? '').trim()
  const date = parseDate(r.date)
  const qty = parseQty(r.qty)
  const type = parseType(r.type)
  const item = byName.get(normName(name))
  const base: PreviewRow = {
    rowNo: r.rowNo,
    date: date ?? '',
    itemId: item?.id ?? '',
    itemName: name,
    type,
    qty: qty ?? 0,
    note,
    error: '',
  }
  const err = (e: string): PreviewRow => ({ ...base, error: e })
  if (!date) return err('Tanggal kosong atau formatnya tidak dikenali (gunakan YYYY-MM-DD).')
  if (!name) return err('Nama barang kosong.')
  if (!item)
    return err('Barang tidak ada di proyek ini (periksa ejaan, samakan dengan daftar di lembar "Barang").')
  if (!item.active) return err('Barang nonaktif di proyek ini.')
  if (item.openingQty === null || !item.openingDate) return err('Barang belum punya saldo awal.')
  if (!type) return err('Jenis harus "Masuk" atau "Keluar".')
  if (qty === null) return err('Jumlah bukan angka.')
  if (qty <= 0) return err('Jumlah harus lebih dari 0.')
  if (Math.round(qty * 1000) / 1000 !== qty) return err('Jumlah maksimal 3 angka desimal.')
  if (qty > 1e9) return err('Jumlah terlalu besar.')
  if (date > today) return err('Tanggal tidak boleh di masa depan.')
  if (date < item.openingDate) return err(`Tanggal sebelum saldo awal (${item.openingDate}).`)
  if (note.length > 200) return err('Keterangan maksimal 200 karakter.')
  return base
}

export function validateAll(raw: RawRow[], items: ImportItem[], today: string): PreviewRow[] {
  const byName = new Map(items.map((i) => [normName(i.name), i]))
  return raw.map((r) => validateRow(r, byName, today))
}

/** Memecah baris valid menjadi permintaan dengan batas baris dan jumlah barang berbeda per permintaan. */
export function chunkRows<T extends { itemId: string }>(
  rows: T[],
  maxRows = CHUNK_ROWS,
  maxItems = CHUNK_ITEMS,
): T[][] {
  const chunks: T[][] = []
  let cur: T[] = []
  let ids = new Set<string>()
  for (const r of rows) {
    if (cur.length >= maxRows || (!ids.has(r.itemId) && ids.size >= maxItems)) {
      chunks.push(cur)
      cur = []
      ids = new Set()
    }
    cur.push(r)
    ids.add(r.itemId)
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

/** Perkiraan jumlah dokumen yang ditulis: 1 per transaksi + total harian + total bulanan + barang + audit per permintaan. */
export function estimateWrites(rows: { itemId: string; date: string }[]): number {
  const days = new Set(rows.map((r) => `${r.itemId}|${r.date}`)).size
  const months = new Set(rows.map((r) => `${r.itemId}|${r.date.slice(0, 7)}`)).size
  const items = new Set(rows.map((r) => r.itemId)).size
  return rows.length + days + months + items + chunkRows(rows).length
}

/** Sel teks yang diawali = + - @ dapat dibaca Excel sebagai rumus; diberi awalan agar tetap teks. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
