import { describe, expect, it } from 'vitest'
import { balanceBefore, buildRows, dayName, summarize, type LedgerEntry, type LedgerItemInfo } from './ledger'

const item: LedgerItemInfo = {
  id: 'i1',
  name: 'Semen',
  unit: 'Sak',
  openingQty: 100,
  openingDate: '2026-09-01',
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
const M = (id: string, i: number, o: number, ci = 0, co = 0) => ({
  id,
  in: i,
  out: o,
  corrIn: ci,
  corrOut: co,
})

describe('dayName', () => {
  it('nama hari dari tanggal', () => {
    expect(dayName('2026-09-10')).toBe('Kamis')
    expect(dayName('2026-11-18')).toBe('Rabu')
    expect(dayName('2026-01-01')).toBe('Kamis')
  })
})

describe('balanceBefore', () => {
  it('bulan saldo awal dimulai dari 0 (baris saldo awal yang menambahkan)', () => {
    expect(balanceBefore(item, [], '2026-09')).toBe(0)
  })
  it('bulan berikutnya = saldo awal + selisih bulan sebelumnya, termasuk koreksi', () => {
    expect(balanceBefore(item, [M('2026-09', 40, 90, 5, 10)], '2026-10')).toBe(100 + 40 - 90 + 5 - 10)
    expect(balanceBefore(item, [M('2026-09', 40, 90), M('2026-10', 5, 0)], '2026-11')).toBe(100 + 40 - 90 + 5)
  })
  it('tanpa saldo awal 0; bulan kemudian tidak ikut', () => {
    expect(balanceBefore({ ...item, openingQty: null, openingDate: null }, [], '2026-10')).toBe(0)
    expect(balanceBefore(item, [M('2026-11', 9, 0)], '2026-10')).toBe(100)
  })
})

describe('buildRows', () => {
  it('baris saldo awal lalu transaksi, Tersisa berjalan', () => {
    const rows = buildRows(
      [item],
      {},
      [e({ in: 40 }), e({ type: 'keluar', out: 30, date: '2026-09-12' })],
      '2026-09',
    )
    expect(rows.map((r) => [r.kind, r.in, r.out, r.balance])).toEqual([
      ['opening', null, null, 100],
      ['masuk', 40, null, 140],
      ['keluar', null, 30, 110],
    ])
  })
  it('dalam satu hari masuk dihitung lebih dulu walau keluar dicatat lebih dulu', () => {
    const rows = buildRows(
      [item],
      {},
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
    const rows = buildRows(
      [item],
      { i1: [M('2026-09', 40, 30)] },
      [e({ ym: '2026-10', date: '2026-10-02', in: 10 })],
      '2026-10',
    )
    expect(rows.map((r) => r.balance)).toEqual([120])
  })
  it('pecahan desimal tepat', () => {
    const it0 = { ...item, openingQty: 0 }
    const rows = buildRows(
      [it0],
      {},
      [e({ in: 0.1, seq: 1 }), e({ in: 0.2, seq: 2 }), e({ type: 'keluar', out: 0.3, seq: 3 })],
      '2026-09',
    )
    expect(rows.map((r) => r.balance)).toEqual([0, 0.1, 0.3, 0])
  })
  it('koreksi menandai transaksi asli dan membalik saldo', () => {
    const a = e({ in: 40, seq: 1 })
    const k = e({ id: `${a.id}__k`, type: 'koreksi', out: 40, refEntryId: a.id, seq: 2 })
    const rows = buildRows([item], {}, [a, k], '2026-09')
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
    }
    const rows = buildRows(
      [item, b],
      {},
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
    expect(buildRows([{ ...item, openingQty: null, openingDate: null }], {}, [], '2026-09')).toEqual([])
    expect(buildRows([item], {}, [], '2026-10')).toEqual([])
  })
})

describe('summarize', () => {
  it('menjumlah masuk dan keluar tanpa kesalahan pecahan', () => {
    const rows = buildRows(
      [{ ...item, openingQty: 0 }],
      {},
      [e({ in: 0.1, seq: 1 }), e({ in: 0.2, seq: 2 })],
      '2026-09',
    )
    expect(summarize(rows)).toEqual({ in: 0.3, out: 0 })
  })
})
