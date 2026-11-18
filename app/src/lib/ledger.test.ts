import { describe, expect, it } from 'vitest'
import {
  balanceBefore,
  buildRows,
  dayName,
  summarize,
  type LedgerEntry,
  type LedgerItemInfo,
  type MonthTotals,
} from './ledger'

const base: LedgerItemInfo = {
  id: 'i1',
  name: 'Semen',
  unit: 'Sak',
  openingQty: 100,
  openingDate: '2026-09-01',
  currentStock: 100,
}
let seq = 0
const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: `e${++seq}`,
  itemId: 'i1',
  date: '2026-09-10',
  ym: '2026-09',
  type: 'masuk',
  in: 0,
  out: 0,
  seq,
  note: '',
  createdByName: 'A',
  createdByRole: 'R',
  createdAt: null,
  refEntryId: null,
  ...over,
})
const M = (id: string, i: number, o: number, ci = 0, co = 0): MonthTotals => ({
  id,
  in: i,
  out: o,
  corrIn: ci,
  corrOut: co,
})

/** Menurunkan total bulan dari entri (seperti yang dijaga Worker): koreksi masuk ke corrIn/corrOut. */
function monthsOf(entries: LedgerEntry[]): MonthTotals[] {
  const by = new Map<string, MonthTotals>()
  for (const x of entries) {
    const t = by.get(x.ym) ?? M(x.ym, 0, 0)
    if (x.type === 'koreksi') {
      t.corrIn += x.in
      t.corrOut += x.out
    } else {
      t.in += x.in
      t.out += x.out
    }
    by.set(x.ym, t)
  }
  return [...by.values()]
}
/** Stok kini yang konsisten: saldo awal + seluruh selisih. */
const withStock = (it: LedgerItemInfo, months: MonthTotals[]): LedgerItemInfo => ({
  ...it,
  currentStock: (it.openingQty ?? 0) + months.reduce((a, t) => a + t.in - t.out + t.corrIn - t.corrOut, 0),
})
/** Membangun baris sebuah bulan dari seluruh entri, dengan hanya total bulan >= ym (seperti yang dibaca aplikasi). */
function view(it: LedgerItemInfo, all: LedgerEntry[], ym: string) {
  const months = monthsOf(all)
  const item = withStock(it, months)
  return buildRows(
    [item],
    { [item.id]: months.filter((t) => t.id >= ym) },
    all.filter((x) => x.ym === ym),
    ym,
  )
}

describe('dayName', () => {
  it('nama hari dari tanggal', () => {
    expect(dayName('2026-09-10')).toBe('Kamis')
    expect(dayName('2026-11-18')).toBe('Rabu')
    expect(dayName('2026-01-01')).toBe('Kamis')
  })
})

describe('balanceBefore (dihitung mundur dari stok kini)', () => {
  it('bulan saldo awal dimulai dari 0 (baris saldo awal yang menambahkan)', () => {
    const ms = [M('2026-09', 40, 30)]
    expect(balanceBefore(withStock(base, ms), ms, '2026-09')).toBe(0)
  })
  it('bulan berikutnya = saldo awal + selisih bulan sebelumnya, termasuk koreksi', () => {
    const ms = [M('2026-09', 40, 90, 5, 10), M('2026-10', 5, 0)]
    // hanya bulan >= ym yang dibaca
    expect(balanceBefore(withStock(base, ms), [ms[1]], '2026-10')).toBe(100 + 40 - 90 + 5 - 10)
    expect(balanceBefore(withStock(base, ms), [], '2026-11')).toBe(100 + 40 - 90 + 5 - 10 + 5)
  })
  it('sama persis dengan hitungan maju dari awal untuk setiap bulan (data konsisten)', () => {
    const ms = [M('2026-09', 40, 30, 2, 1), M('2026-10', 0.1, 0.2), M('2026-12', 7, 3, 0, 4)]
    const it = withStock(base, ms)
    let forward = 100
    for (const ym of ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']) {
      const before = ym === '2026-09' ? 0 : forward
      expect(
        balanceBefore(
          it,
          ms.filter((t) => t.id >= ym),
          ym,
        ),
      ).toBeCloseTo(before, 9)
      const t = ms.find((x) => x.id === ym)
      if (t) forward += t.in - t.out + t.corrIn - t.corrOut
    }
  })
  it('saldo awal setelah bulan yang dilihat: 0; tanpa saldo awal: 0', () => {
    const it = { ...base, openingDate: '2026-10-05', currentStock: 100 }
    expect(balanceBefore(it, [], '2026-09')).toBe(0)
    expect(balanceBefore({ ...base, openingQty: null, openingDate: null }, [], '2026-10')).toBe(0)
  })
})

describe('buildRows', () => {
  it('baris saldo awal lalu transaksi, Tersisa berjalan', () => {
    const rows = view(base, [e({ in: 40 }), e({ type: 'keluar', out: 30, date: '2026-09-12' })], '2026-09')
    expect(rows.map((r) => [r.kind, r.in, r.out, r.balance])).toEqual([
      ['opening', null, null, 100],
      ['masuk', 40, null, 140],
      ['keluar', null, 30, 110],
    ])
  })
  it('dalam satu hari masuk dihitung lebih dulu walau keluar dicatat lebih dulu', () => {
    const rows = view(
      base,
      [
        e({ type: 'keluar', out: 130, date: '2026-09-20', seq: 1 }),
        e({ in: 50, date: '2026-09-20', seq: 2 }),
      ],
      '2026-09',
    )
    expect(rows.map((r) => r.balance)).toEqual([100, 150, 20])
    expect(rows.every((r) => r.balance >= 0)).toBe(true)
  })
  it('bulan lanjutan membawa saldo dari bulan sebelumnya', () => {
    const all = [
      e({ in: 40 }),
      e({ type: 'keluar', out: 30, date: '2026-09-12' }),
      e({ ym: '2026-10', date: '2026-10-02', in: 10 }),
    ]
    expect(view(base, all, '2026-10').map((r) => r.balance)).toEqual([120])
  })
  it('bulan lanjutan tetap benar walau ada transaksi bulan yang lebih baru', () => {
    const all = [
      e({ in: 40 }),
      e({ ym: '2026-10', date: '2026-10-02', in: 10 }),
      e({ ym: '2026-11', date: '2026-11-02', type: 'keluar', out: 50 }),
    ]
    expect(view(base, all, '2026-10').map((r) => r.balance)).toEqual([150])
    expect(view(base, all, '2026-11').map((r) => r.balance)).toEqual([100])
  })
  it('pecahan desimal tepat', () => {
    const rows = view(
      { ...base, openingQty: 0 },
      [e({ in: 0.1, seq: 1 }), e({ in: 0.2, seq: 2 }), e({ type: 'keluar', out: 0.3, seq: 3 })],
      '2026-09',
    )
    expect(rows.map((r) => r.balance)).toEqual([0, 0.1, 0.3, 0])
  })
  it('koreksi menandai transaksi asli dan membalik saldo', () => {
    const a = e({ in: 40, seq: 1 })
    const k = e({ id: `${a.id}__k`, type: 'koreksi', out: 40, refEntryId: a.id, seq: 2 })
    const rows = view(base, [a, k], '2026-09')
    expect(rows.find((r) => r.key === a.id)?.corrected).toBe(true)
    expect(rows.find((r) => r.key === k.id)?.corrected).toBe(false)
    expect(rows.at(-1)?.balance).toBe(100)
  })
  it('beberapa barang: Tersisa dihitung per barang, urut tanggal lalu nama', () => {
    const b: LedgerItemInfo = {
      id: 'i2',
      name: 'Pasir',
      unit: 'm3',
      openingQty: 10,
      openingDate: '2026-09-01',
      currentStock: 7,
    }
    const s = { ...base, currentStock: 105 }
    const ms = [M('2026-09', 5, 0)]
    const rows = buildRows(
      [s, b],
      { i1: ms, i2: [M('2026-09', 0, 3)] },
      [e({ in: 5, seq: 1 }), e({ itemId: 'i2', type: 'keluar', out: 3, seq: 2 })],
      '2026-09',
    )
    expect(rows.map((r) => `${r.itemName}:${r.balance}`)).toEqual([
      'Pasir:10',
      'Semen:100',
      'Pasir:7',
      'Semen:105',
    ])
  })
  it('barang tanpa saldo awal dan bulan kosong tidak menghasilkan baris', () => {
    expect(buildRows([{ ...base, openingQty: null, openingDate: null }], {}, [], '2026-09')).toEqual([])
    expect(buildRows([base], {}, [], '2026-10')).toEqual([])
  })
})

describe('summarize (setelah koreksi)', () => {
  it('menjumlah masuk dan keluar tanpa kesalahan pecahan', () => {
    const rows = view({ ...base, openingQty: 0 }, [e({ in: 0.1, seq: 1 }), e({ in: 0.2, seq: 2 })], '2026-09')
    expect(summarize(rows)).toEqual({ in: 0.3, out: 0 })
  })
  it('transaksi yang dikoreksi dan baris koreksinya sama-sama tidak dihitung', () => {
    const a = e({ in: 40, seq: 1 })
    const k = e({ id: `${a.id}__k`, type: 'koreksi', out: 40, refEntryId: a.id, seq: 2 })
    const out = e({ type: 'keluar', out: 30, date: '2026-09-12', seq: 3 })
    expect(summarize(view(base, [a, k, out], '2026-09'))).toEqual({ in: 0, out: 30 })
  })
  it('koreksi atas barang keluar mengembalikan jumlah keluar efektif', () => {
    const a = e({ type: 'keluar', out: 30, seq: 1 })
    const k = e({ id: `${a.id}__k`, type: 'koreksi', in: 30, refEntryId: a.id, seq: 2 })
    expect(summarize(view(base, [a, k, e({ in: 5, seq: 3 })], '2026-09'))).toEqual({ in: 5, out: 0 })
  })
})
