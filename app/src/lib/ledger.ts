/** Logika murni buku stok: baris tabel dan kolom "Tersisa". Angka dihitung dalam bilangan bulat milli agar tidak bergeser. */

export interface LedgerEntry {
  id: string
  itemId: string
  date: string
  ym: string
  type: 'masuk' | 'keluar' | 'koreksi'
  in: number
  out: number
  seq: number
  note: string
  createdByName: string
  createdByRole: string
  createdAt: unknown
  refEntryId: string | null
}
export interface MonthTotals {
  id: string // YYYY-MM
  in: number
  out: number
  corrIn: number
  corrOut: number
}
export interface LedgerItemInfo {
  id: string
  name: string
  unit: string
  openingQty: number | null
  openingDate: string | null
}
export interface LedgerRow {
  key: string
  date: string
  itemId: string
  itemName: string
  unit: string
  in: number | null
  out: number | null
  balance: number
  note: string
  kind: 'opening' | 'masuk' | 'keluar' | 'koreksi'
  entry?: LedgerEntry
  /** Transaksi ini sudah dibalik oleh koreksi. */
  corrected: boolean
}

const milli = (n: number) => Math.round(n * 1000)
const unmilli = (m: number) => m / 1000

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
/** 2026-09-10 -> Kamis (kalender tanggal murni, tidak bergantung zona waktu perangkat). */
export const dayName = (date: string): string => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? ''

/** Saldo sebelum bulan `ym` dimulai: saldo awal (bila diisi pada bulan lebih awal) ditambah selisih semua bulan sebelumnya. */
export function balanceBefore(item: LedgerItemInfo, months: MonthTotals[], ym: string): number {
  if (item.openingQty === null || item.openingDate === null) return 0
  let m = item.openingDate.slice(0, 7) < ym ? milli(item.openingQty) : 0
  for (const t of months) if (t.id < ym) m += milli(t.in) - milli(t.out) + milli(t.corrIn) - milli(t.corrOut)
  return unmilli(m)
}

/**
 * Baris untuk satu bulan. Urutan: tanggal, lalu dalam satu hari barang masuk lebih dulu daripada keluar
 * (aturan yang sama dengan validasi server), lalu nomor urut pencatatan.
 */
export function buildRows(
  items: LedgerItemInfo[],
  monthsByItem: Record<string, MonthTotals[]>,
  entries: LedgerEntry[],
  ym: string,
): LedgerRow[] {
  const correctedIds = new Set(entries.filter((e) => e.refEntryId).map((e) => e.refEntryId as string))
  const out: LedgerRow[] = []
  for (const it of items) {
    let run = milli(balanceBefore(it, monthsByItem[it.id] ?? [], ym))
    const rows: LedgerRow[] = []
    if (it.openingQty !== null && it.openingDate && it.openingDate.slice(0, 7) === ym) {
      run += milli(it.openingQty)
      rows.push({
        key: `${it.id}:opening`,
        date: it.openingDate,
        itemId: it.id,
        itemName: it.name,
        unit: it.unit,
        in: null,
        out: null,
        balance: unmilli(run),
        note: 'Saldo awal',
        kind: 'opening',
        corrected: false,
      })
    }
    const mine = entries
      .filter((e) => e.itemId === it.id)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || (a.in > 0 ? 0 : 1) - (b.in > 0 ? 0 : 1) || a.seq - b.seq,
      )
    for (const e of mine) {
      run += milli(e.in) - milli(e.out)
      rows.push({
        key: e.id,
        date: e.date,
        itemId: it.id,
        itemName: it.name,
        unit: it.unit,
        in: e.in > 0 ? e.in : null,
        out: e.out > 0 ? e.out : null,
        balance: unmilli(run),
        note: e.note,
        kind: e.type,
        entry: e,
        corrected: correctedIds.has(e.id),
      })
    }
    out.push(...rows)
  }
  // Gabungan beberapa barang: urut tanggal, lalu nama barang; urutan dalam satu barang dipertahankan (sort stabil).
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName, 'id'))
}

export interface Summary {
  in: number
  out: number
}
/** Total masuk/keluar pada baris yang tampil (koreksi ikut dihitung sebagai pembalik). */
export function summarize(rows: LedgerRow[]): Summary {
  let i = 0
  let o = 0
  for (const r of rows) {
    i += milli(r.in ?? 0)
    o += milli(r.out ?? 0)
  }
  return { in: unmilli(i), out: unmilli(o) }
}
