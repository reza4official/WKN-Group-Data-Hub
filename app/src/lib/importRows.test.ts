import { describe, expect, it } from 'vitest'
import {
  chunkRows,
  estimateWrites,
  normName,
  parseDate,
  parseQty,
  parseType,
  safeCell,
  validateAll,
  type ImportItem,
  type RawRow,
} from './importRows'

const items: ImportItem[] = [
  { id: 'i1', name: 'Semen Portland', active: true, openingQty: 100, openingDate: '2026-09-01' },
  { id: 'i2', name: 'Pasir  Beton', active: true, openingQty: 0, openingDate: '2026-10-01' },
  { id: 'i3', name: 'Besi', active: false, openingQty: 5, openingDate: '2026-09-01' },
  { id: 'i4', name: 'Paku', active: true, openingQty: null, openingDate: null },
]
const row = (o: Partial<RawRow> = {}): RawRow => ({
  rowNo: 2,
  date: '2026-11-10',
  name: 'Semen Portland',
  type: 'Masuk',
  qty: 5,
  note: 'x',
  ...o,
})
const check = (o: Partial<RawRow>) => validateAll([row(o)], items, '2026-11-18')[0]

describe('sel', () => {
  it('tanggal: Date, serial Excel, ISO, D/M/YYYY; tak valid -> null', () => {
    expect(parseDate(new Date(Date.UTC(2026, 10, 3)))).toBe('2026-11-03')
    expect(parseDate(46329)).toBe('2026-11-03') // 2026-11-03 sebagai nomor seri
    expect(parseDate('2026-1-5')).toBe('2026-01-05')
    expect(parseDate('3/11/2026')).toBe('2026-11-03')
    expect(parseDate('03-11-2026')).toBe('2026-11-03')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('kemarin')).toBeNull()
    expect(parseDate(new Date('x'))).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate(12)).toBeNull()
  })
  it('jumlah: angka dan teks berkoma', () => {
    expect(parseQty(5)).toBe(5)
    expect(parseQty('1,5')).toBe(1.5)
    expect(parseQty(' 2.25 ')).toBe(2.25)
    expect(parseQty('1.000,5')).toBeNull()
    expect(parseQty('abc')).toBeNull()
    expect(parseQty(NaN)).toBeNull()
    expect(parseQty('')).toBeNull()
  })
  it('jenis', () => {
    expect([' MASUK ', 'keluar', 'Barang Masuk', 'Barang keluar'].map(parseType)).toEqual([
      'masuk',
      'keluar',
      'masuk',
      'keluar',
    ])
    expect(parseType('hapus')).toBe('')
  })
  it('normName', () => expect(normName('  Pasir   BETON ')).toBe('pasir beton'))
  it('safeCell mencegah rumus', () => {
    expect(safeCell('=1+1')).toBe("'=1+1")
    expect(safeCell('+62')).toBe("'+62")
    expect(safeCell('-x')).toBe("'-x")
    expect(safeCell('@a')).toBe("'@a")
    expect(safeCell('Semen')).toBe('Semen')
  })
})

describe('validateRow', () => {
  it('baris benar; nama dicocokkan tanpa beda huruf dan spasi ganda', () => {
    const r = check({ name: ' semen  PORTLAND ', type: 'keluar', qty: '2,5' })
    expect(r).toMatchObject({ error: '', itemId: 'i1', type: 'keluar', qty: 2.5, date: '2026-11-10' })
    expect(check({ name: 'pasir beton', date: '2026-10-01' }).error).toBe('')
  })
  it.each([
    [{ date: '' }, 'Tanggal'],
    [{ name: 'Tidak ada' }, 'tidak ada di proyek'],
    [{ name: '' }, 'Nama barang kosong'],
    [{ name: 'Besi' }, 'nonaktif'],
    [{ name: 'Paku' }, 'saldo awal'],
    [{ type: 'pinjam' }, 'Jenis'],
    [{ qty: 'abc' }, 'bukan angka'],
    [{ qty: 0 }, 'lebih dari 0'],
    [{ qty: -3 }, 'lebih dari 0'],
    [{ qty: 1.2345 }, '3 angka desimal'],
    [{ date: '2026-11-19' }, 'masa depan'],
    [{ date: '2026-08-31' }, 'sebelum saldo awal'],
    [{ name: 'Pasir Beton', date: '2026-09-30' }, 'sebelum saldo awal'],
    [{ note: 'x'.repeat(201) }, '200 karakter'],
  ])('menolak %j', (o, msg) => {
    expect(check(o as Partial<RawRow>).error).toContain(msg)
  })
  it('hari ini boleh, tanggal saldo awal boleh', () => {
    expect(check({ date: '2026-11-18' }).error).toBe('')
    expect(check({ date: '2026-09-01' }).error).toBe('')
  })
})

describe('chunkRows dan estimasi', () => {
  const mk = (n: number, item = (k: number) => `i${k % 3}`) =>
    Array.from({ length: n }, (_, k) => ({ itemId: item(k), date: '2026-11-01' }))
  it('maksimal 150 baris per permintaan', () => {
    const c = chunkRows(mk(320))
    expect(c.map((x) => x.length)).toEqual([150, 150, 20])
  })
  it('maksimal 10 barang berbeda per permintaan', () => {
    const c = chunkRows(mk(30, (k) => `i${k}`))
    expect(c.map((x) => new Set(x.map((r) => r.itemId)).size)).toEqual([10, 10, 10])
    expect(c.flat()).toHaveLength(30)
  })
  it('kosong -> tanpa permintaan; urutan dipertahankan', () => {
    expect(chunkRows([])).toEqual([])
    const rows = mk(5)
    expect(chunkRows(rows).flat()).toEqual(rows)
  })
  it('estimasi penulisan', () => {
    const rows = [
      { itemId: 'a', date: '2026-11-01' },
      { itemId: 'a', date: '2026-11-01' },
      { itemId: 'a', date: '2026-11-02' },
      { itemId: 'b', date: '2026-12-01' },
    ]
    // 4 transaksi + 3 hari + 3 bulan (a-nov, a-nov sama, b-des => 2) -> hitung eksplisit
    expect(estimateWrites(rows)).toBe(4 + 3 + 2 + 2 + 1)
  })
})
