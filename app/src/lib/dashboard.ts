/**
 * Logika murni dashboard. Seluruh angka berasal dari dokumen barang dan total bulanan (bukan transaksi mentah):
 *   masuk efektif  = in  - corrOut   (koreksi atas barang masuk dicatat sebagai corrOut)
 *   keluar efektif = out - corrIn    (koreksi atas barang keluar dicatat sebagai corrIn)
 * Hitungan memakai bilangan bulat milli agar pecahan tidak bergeser.
 */
import { balanceBefore, type LedgerItemInfo, type MonthTotals } from './ledger'

const milli = (n: number) => Math.round(n * 1000)
const unmilli = (m: number) => m / 1000

export interface DashItem extends LedgerItemInfo {
  projectId: string
  category: string
  minStock: number
  lastTxDate: string | null
  txCount: number
  active: boolean
}

export type Status = 'ok' | 'warn' | 'bad' | 'mute'
export interface DashRow {
  id: string
  name: string
  unit: string
  category: string
  projectIds: string[]
  awal: number
  masuk: number
  keluar: number
  sisa: number
  prevMasuk: number
  prevKeluar: number
  /** Laju keluar per hari bulan ini dan bulan lalu (dijumlahkan bila beberapa proyek digabung). */
  rate: number
  prevRate: number
  /** Perubahan laju keluar per hari dibanding bulan lalu (%); null bila bulan lalu tidak ada pemakaian. */
  dKeluar: number | null
  dMasuk: number | null
  /** Persentase pemakaian = keluar / (awal + masuk). */
  pct: number
  /** Estimasi hari stok = sisa / laju; null bila tidak ada pemakaian. */
  cover: number | null
  min: number
  /** Hari sejak pergerakan terakhir; null bila tidak dapat ditentukan (bulan lampau atau data lama). */
  idle: number | null
  status: Status
  statusLabel: string
  tx: number
}

const IDLE_DAYS = 14

export const prevYm = (ym: string): string => {
  let [y, m] = ym.split('-').map(Number)
  m--
  if (m < 1) {
    m = 12
    y--
  }
  return `${y}-${String(m).padStart(2, '0')}`
}
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
/** Selisih hari kalender murni. */
export const diffDays = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / 86_400_000)
export const monthEnd = (ym: string): string => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0))
  return d.toISOString().slice(0, 10)
}
export const monthStart = (ym: string): string => `${ym}-01`

/** Hari yang dihitung untuk laju: dari awal bulan (atau tanggal saldo awal bila lebih akhir) sampai akhir bulan (atau hari ini). */
function windowDays(ym: string, openingDate: string, today: string): number {
  const start = openingDate > monthStart(ym) ? openingDate : monthStart(ym)
  const end = monthEnd(ym) < today ? monthEnd(ym) : today
  return Math.max(1, diffDays(start, end) + 1)
}

export function statusOf(sisa: number, min: number, idle: number | null): { status: Status; label: string } {
  if (milli(sisa) <= milli(min)) return { status: 'bad', label: 'Kritis' }
  if (milli(sisa) <= Math.round(milli(min) * 1.5)) return { status: 'warn', label: 'Menipis' }
  if (idle !== null && idle >= IDLE_DAYS) return { status: 'mute', label: 'Tidak bergerak' }
  return { status: 'ok', label: 'Aman' }
}

const eff = (t: MonthTotals | undefined) => ({
  in: t ? milli(t.in) - milli(t.corrOut) : 0,
  out: t ? milli(t.out) - milli(t.corrIn) : 0,
})

/**
 * Ringkasan satu barang pada satu bulan. `months` memuat total bulan `prevYm(ym)` dan sesudahnya.
 * Mengembalikan null untuk barang nonaktif, tanpa saldo awal, atau yang saldo awalnya baru ada setelah bulan itu.
 */
export function summarizeItem(
  item: DashItem,
  months: MonthTotals[],
  ym: string,
  today: string,
): DashRow | null {
  if (!item.active || item.openingQty === null || item.openingDate === null) return null
  const openYm = item.openingDate.slice(0, 7)
  if (openYm > ym) return null

  const cur = eff(months.find((t) => t.id === ym))
  const pym = prevYm(ym)
  const prev = eff(months.find((t) => t.id === pym))
  const awalM = milli(balanceBefore(item, months, ym)) + (openYm === ym ? milli(item.openingQty) : 0)
  const sisaM = awalM + cur.in - cur.out

  const days = windowDays(ym, item.openingDate, today)
  const hasPrev = item.openingDate <= monthEnd(pym)
  const prevDays = hasPrev ? windowDays(pym, item.openingDate, today) : 1
  const rate = unmilli(cur.out) / days
  const prevRate = hasPrev ? unmilli(prev.out) / prevDays : 0

  const base = awalM + cur.in
  const sisa = unmilli(sisaM)
  let idle: number | null = null
  if (ym === today.slice(0, 7)) {
    if (item.lastTxDate) idle = Math.max(0, diffDays(item.lastTxDate, today))
    else if (item.txCount === 0) idle = Math.max(0, diffDays(item.openingDate, today))
  }
  const st = statusOf(sisa, item.minStock, idle)
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    category: item.category,
    projectIds: [item.projectId],
    awal: unmilli(awalM),
    masuk: unmilli(cur.in),
    keluar: unmilli(cur.out),
    sisa,
    prevMasuk: unmilli(prev.in),
    prevKeluar: unmilli(prev.out),
    rate,
    prevRate,
    dKeluar: prevRate > 0 ? ((rate - prevRate) / prevRate) * 100 : null,
    dMasuk: prev.in > 0 ? ((cur.in - prev.in) / prev.in) * 100 : null,
    pct: base > 0 ? (cur.out / base) * 100 : 0,
    cover: rate > 0 ? sisa / rate : null,
    min: item.minStock,
    idle,
    status: st.status,
    statusLabel: st.label,
    tx: months.find((t) => t.id === ym)?.count ?? 0,
  }
}

/** Menggabungkan barang yang sama (katalog sama) dari beberapa proyek: angka dijumlahkan, status dihitung ulang. */
export function mergeByItem(rows: DashRow[]): DashRow[] {
  const by = new Map<string, DashRow[]>()
  for (const r of rows) by.set(r.id, [...(by.get(r.id) ?? []), r])
  return [...by.values()].map((g) => {
    if (g.length === 1) return g[0]
    const sum = (f: (r: DashRow) => number) => unmilli(g.reduce((a, r) => a + milli(f(r)), 0))
    const awal = sum((r) => r.awal)
    const masuk = sum((r) => r.masuk)
    const keluar = sum((r) => r.keluar)
    const sisa = sum((r) => r.sisa)
    const prevMasuk = sum((r) => r.prevMasuk)
    const rate = g.reduce((a, r) => a + r.rate, 0)
    const prevRate = g.reduce((a, r) => a + r.prevRate, 0)
    const idles = g.map((r) => r.idle).filter((x): x is number => x !== null)
    // Bergerak di salah satu proyek berarti barangnya bergerak: ambil yang paling baru; kosong bila tak satu pun diketahui.
    const idle = idles.length === g.length ? Math.min(...idles) : null
    const min = sum((r) => r.min)
    const st = statusOf(sisa, min, idle)
    const base = awal + masuk
    return {
      ...g[0],
      projectIds: g.flatMap((r) => r.projectIds),
      awal,
      masuk,
      keluar,
      sisa,
      prevMasuk,
      prevKeluar: sum((r) => r.prevKeluar),
      rate,
      prevRate,
      dKeluar: prevRate > 0 ? ((rate - prevRate) / prevRate) * 100 : null,
      dMasuk: prevMasuk > 0 ? ((masuk - prevMasuk) / prevMasuk) * 100 : null,
      pct: base > 0 ? (keluar / base) * 100 : 0,
      cover: rate > 0 ? sisa / rate : null,
      min,
      idle,
      status: st.status,
      statusLabel: st.label,
      tx: g.reduce((a, r) => a + r.tx, 0),
    }
  })
}

export interface Kpis {
  items: number
  tx: number
  kritis: number
  idle: number
}
export function kpis(rows: DashRow[]): Kpis {
  return {
    items: rows.length,
    tx: rows.reduce((a, r) => a + r.tx, 0),
    kritis: rows.filter((r) => r.status === 'bad').length,
    idle: rows.filter((r) => r.idle !== null && r.idle >= IDLE_DAYS).length,
  }
}

export type SortKey = 'name' | 'awal' | 'masuk' | 'keluar' | 'sisa' | 'dKeluar' | 'pct' | 'cover' | 'status'
const ORDER: Record<Status, number> = { bad: 0, warn: 1, mute: 2, ok: 3 }
export function sortRows(rows: DashRow[], key: SortKey, dir: 1 | -1): DashRow[] {
  const val = (r: DashRow): number | string =>
    key === 'status' ? ORDER[r.status] : key === 'name' ? r.name.toLowerCase() : (r[key] ?? -Infinity)
  return [...rows].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    // Nilai kosong (mis. tanpa pemakaian) selalu di akhir, apa pun arah urutannya.
    if (x === -Infinity && y !== -Infinity) return 1
    if (y === -Infinity && x !== -Infinity) return -1
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'id') : (x as number) - (y as number)
    return c * dir || a.name.localeCompare(b.name, 'id')
  })
}

export interface ProjectCompare {
  projectId: string
  items: number
  tx: number
  kritis: number
  menipis: number
  idle: number
  /** Rata-rata persentase pemakaian barang (tanpa satuan, aman dibandingkan antar proyek). */
  avgPct: number
}
/** Perbandingan antar proyek dari baris per (proyek, barang) sebelum digabung. */
export function compareProjects(perProject: Map<string, DashRow[]>): ProjectCompare[] {
  return [...perProject.entries()].map(([projectId, rows]) => ({
    projectId,
    items: rows.length,
    tx: rows.reduce((a, r) => a + r.tx, 0),
    kritis: rows.filter((r) => r.status === 'bad').length,
    menipis: rows.filter((r) => r.status === 'warn').length,
    idle: rows.filter((r) => r.idle !== null && r.idle >= IDLE_DAYS).length,
    avgPct: rows.length ? rows.reduce((a, r) => a + r.pct, 0) / rows.length : 0,
  }))
}

export const addDays = (d: string, n: number): string =>
  new Date(utc(d) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Sisa stok akhir hari untuk `n` hari terakhir (berakhir pada `today`), dihitung mundur dari stok kini.
 * `days` memuat total harian mulai (today - n + 1); hari tanpa transaksi mengikuti saldo hari sebelumnya.
 */
export function stockSeries(
  currentStock: number,
  days: { date: string; in: number; out: number }[],
  today: string,
  n = 30,
): { date: string; value: number }[] {
  const net = new Map(days.map((d) => [d.date, milli(d.in) - milli(d.out)]))
  const out: { date: string; value: number }[] = []
  let bal = milli(currentStock)
  for (let i = 0; i < n; i++) {
    const d = addDays(today, -i)
    out.push({ date: d, value: unmilli(bal) })
    bal -= net.get(d) ?? 0
  }
  return out.reverse()
}

/** Masuk dan keluar efektif per bulan untuk `n` bulan terakhir (berakhir pada `ym`), bulan kosong bernilai 0. */
export function monthlyBars(
  months: MonthTotals[],
  ym: string,
  n = 6,
): { ym: string; masuk: number; keluar: number }[] {
  const list: string[] = []
  for (let c = ym, i = 0; i < n; i++, c = prevYm(c)) list.unshift(c)
  return list.map((m) => {
    const e = eff(months.find((t) => t.id === m))
    return { ym: m, masuk: unmilli(e.in), keluar: unmilli(e.out) }
  })
}
