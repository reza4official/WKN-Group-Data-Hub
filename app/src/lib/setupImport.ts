/** Validasi impor penyiapan: katalog barang dan saldo awal proyek. Fungsi murni; pemeriksaan akhir tetap oleh server. */
import { normName, parseDate, parseQty } from './importRows'

export interface RawCatalogRow {
  rowNo: number
  name: unknown
  unit: unknown
  category: unknown
  minStock: unknown
}
export interface CatalogPreview {
  rowNo: number
  name: string
  unit: string
  category: string
  minStock: number
  error: string
}

const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const blank = (v: unknown) => v === '' || v === null || v === undefined || clean(v) === ''
const decimals3 = (n: number) => Math.round(n * 1000) / 1000 === n

export function validateCatalog(raw: RawCatalogRow[], existingNames: string[]): CatalogPreview[] {
  const existing = new Set(existingNames.map(normName))
  const firstRow = new Map<string, number>()
  return raw.map((r) => {
    const name = clean(r.name)
    const unit = clean(r.unit)
    const category = clean(r.category)
    const min = blank(r.minStock) ? 0 : parseQty(r.minStock)
    const base: CatalogPreview = { rowNo: r.rowNo, name, unit, category, minStock: min ?? 0, error: '' }
    const err = (e: string) => ({ ...base, error: e })
    if (!name) return err('Nama barang kosong.')
    if (name.length > 160) return err('Nama barang maksimal 160 karakter.')
    if (!unit) return err('Satuan kosong.')
    if (unit.length > 40) return err('Satuan maksimal 40 karakter.')
    if (category.length > 80) return err('Kategori maksimal 80 karakter.')
    if (min === null) return err('Batas minimum bukan angka.')
    if (min < 0) return err('Batas minimum tidak boleh negatif.')
    if (!decimals3(min)) return err('Batas minimum maksimal 3 angka desimal.')
    const key = normName(name)
    if (existing.has(key)) return err('Nama barang sudah ada di katalog.')
    const first = firstRow.get(key)
    if (first !== undefined) return err(`Nama barang kembar dengan baris ${first} di berkas ini.`)
    firstRow.set(key, r.rowNo)
    return base
  })
}

export interface RawOpeningRow {
  rowNo: number
  name: unknown
  qty: unknown
  date: unknown
  minStock: unknown
}
export interface OpeningPreview {
  rowNo: number
  itemName: string
  catalogId: string
  qty: number
  date: string
  minStock: number | null
  error: string
}
export interface CatalogRef {
  id: string
  name: string
  active: boolean
}

/**
 * Baris yang saldo dan tanggalnya sama-sama kosong dilewati (template terisi nama barang katalog; barang yang
 * tidak ingin dimasukkan cukup dibiarkan kosong). Jumlah baris yang dilewati dikembalikan untuk ditampilkan.
 */
export function splitUnfilled(raw: RawOpeningRow[]): { rows: RawOpeningRow[]; skipped: number } {
  const rows = raw.filter((r) => !(blank(r.qty) && blank(r.date)))
  return { rows, skipped: raw.length - rows.length }
}

export function validateOpening(
  raw: RawOpeningRow[],
  catalog: CatalogRef[],
  inProject: Set<string>,
  today: string,
): OpeningPreview[] {
  const byName = new Map(catalog.map((c) => [normName(c.name), c]))
  const firstRow = new Map<string, number>()
  return raw.map((r) => {
    const itemName = clean(r.name)
    const cat = byName.get(normName(itemName))
    const qty = parseQty(r.qty)
    const date = parseDate(r.date)
    const min = blank(r.minStock) ? null : parseQty(r.minStock)
    const base: OpeningPreview = {
      rowNo: r.rowNo,
      itemName,
      catalogId: cat?.id ?? '',
      qty: qty ?? 0,
      date: date ?? '',
      minStock: min,
      error: '',
    }
    const err = (e: string) => ({ ...base, error: e })
    if (!itemName) return err('Nama barang kosong.')
    if (!cat) return err('Barang tidak ada di katalog. Impor atau tambahkan ke Katalog Barang terlebih dulu.')
    if (!cat.active) return err('Barang nonaktif di katalog.')
    if (inProject.has(cat.id))
      return err('Barang sudah ada di proyek ini (saldo awal yang sudah berjalan tidak ditimpa oleh impor).')
    if (qty === null) return err('Saldo awal bukan angka.')
    if (qty < 0) return err('Saldo awal tidak boleh negatif.')
    if (!decimals3(qty)) return err('Saldo awal maksimal 3 angka desimal.')
    if (!date) return err('Tanggal saldo awal kosong atau formatnya tidak dikenali (gunakan YYYY-MM-DD).')
    if (date > today) return err('Tanggal saldo awal tidak boleh di masa depan.')
    if (min !== null && (min < 0 || !decimals3(min)))
      return err('Batas minimum harus angka tidak negatif, maksimal 3 desimal.')
    if (blank(r.minStock) === false && min === null) return err('Batas minimum bukan angka.')
    const first = firstRow.get(cat.id)
    if (first !== undefined) return err(`Barang kembar dengan baris ${first} di berkas ini.`)
    firstRow.set(cat.id, r.rowNo)
    return base
  })
}
