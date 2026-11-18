import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareProjects,
  monthlyBars,
  stockSeries,
  diffDays,
  kpis,
  mergeByItem,
  monthEnd,
  prevYm,
  sortRows,
  statusOf,
  summarizeItem,
  type DashItem,
} from './dashboard'
import type { MonthTotals } from './ledger'

const item = (over: Partial<DashItem> = {}): DashItem => ({
  id: 'i1',
  name: 'Semen',
  unit: 'Sak',
  category: 'Bahan',
  projectId: 'p1',
  openingQty: 100,
  openingDate: '2026-08-01',
  currentStock: 0,
  minStock: 20,
  lastTxDate: null,
  txCount: 0,
  active: true,
  ...over,
})
const M = (id: string, i: number, o: number, ci = 0, co = 0, count = 1): MonthTotals => ({
  id,
  in: i,
  out: o,
  corrIn: ci,
  corrOut: co,
  count,
})
const stock = (it: DashItem, ms: MonthTotals[]): DashItem => ({
  ...it,
  currentStock: (it.openingQty ?? 0) + ms.reduce((a, t) => a + t.in - t.out + t.corrIn - t.corrOut, 0),
})

describe('tanggal', () => {
  it('prevYm, monthEnd, diffDays', () => {
    expect(prevYm('2026-01')).toBe('2025-12')
    expect(prevYm('2026-11')).toBe('2026-10')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2)
  })
})

describe('summarizeItem', () => {
  const ms = [M('2026-10', 50, 60), M('2026-11', 30, 45, 0, 0, 4)]
  const itm = stock(item(), ms) // 100+50-60+30-45 = 75
  it('awal, masuk, keluar, sisa, pemakaian, tx', () => {
    const r = summarizeItem(
      itm,
      ms.filter((t) => t.id >= '2026-10'),
      '2026-11',
      '2026-11-18',
    )!
    expect([r.awal, r.masuk, r.keluar, r.sisa]).toEqual([90, 30, 45, 75])
    expect(r.pct).toBeCloseTo((45 / 120) * 100, 9)
    expect(r.tx).toBe(4)
    expect(r.prevMasuk).toBe(50)
    expect(r.prevKeluar).toBe(60)
  })
  it('laju per hari: bulan berjalan dibagi hari berjalan, bulan lalu dibagi hari penuh', () => {
    const r = summarizeItem(itm, ms, '2026-11', '2026-11-18')!
    expect(r.rate).toBeCloseTo(45 / 18, 9)
    expect(r.prevRate).toBeCloseTo(60 / 31, 9)
    expect(r.dKeluar).toBeCloseTo(((45 / 18 - 60 / 31) / (60 / 31)) * 100, 9)
    expect(r.cover).toBeCloseTo(75 / (45 / 18), 9)
  })
  it('bulan lampau memakai hari penuh dan tidak menilai "tidak bergerak"', () => {
    const r = summarizeItem(itm, ms, '2026-10', '2026-11-18')!
    expect(r.rate).toBeCloseTo(60 / 31, 9)
    expect(r.idle).toBeNull()
    expect([r.awal, r.masuk, r.keluar, r.sisa]).toEqual([100, 50, 60, 90])
  })
  it('koreksi mengurangi masuk/keluar efektif dan tidak dihitung ganda', () => {
    const m2 = [M('2026-11', 40, 30, 5, 10)] // masuk efektif 30, keluar efektif 25
    const r = summarizeItem(
      stock(item({ openingDate: '2026-11-01', openingQty: 100 }), m2),
      m2,
      '2026-11',
      '2026-11-18',
    )!
    expect([r.masuk, r.keluar]).toEqual([30, 25])
    expect(r.sisa).toBe(105) // 100 + 30 - 25
    expect(r.pct).toBeCloseTo((25 / 130) * 100, 9)
  })
  it('saldo awal pada bulan yang dilihat menjadi awal; laju dihitung sejak tanggal saldo awal', () => {
    const m2 = [M('2026-11', 0, 30)]
    const r = summarizeItem(
      stock(item({ openingDate: '2026-11-11', openingQty: 100 }), m2),
      m2,
      '2026-11',
      '2026-11-20',
    )!
    expect(r.awal).toBe(100)
    expect(r.rate).toBeCloseTo(30 / 10, 9) // 11..20 = 10 hari
    expect(r.dKeluar).toBeNull()
    expect(r.prevRate).toBe(0)
  })
  it('null: nonaktif, tanpa saldo awal, saldo awal setelah bulan itu', () => {
    expect(summarizeItem(item({ active: false }), [], '2026-11', '2026-11-18')).toBeNull()
    expect(
      summarizeItem(item({ openingQty: null, openingDate: null }), [], '2026-11', '2026-11-18'),
    ).toBeNull()
    expect(summarizeItem(item({ openingDate: '2026-12-02' }), [], '2026-11', '2026-11-18')).toBeNull()
  })
  it('tanpa pemakaian: laju 0, cover null, perubahan null', () => {
    const r = summarizeItem(item({ currentStock: 100 }), [], '2026-11', '2026-11-18')!
    expect([r.rate, r.cover, r.dKeluar, r.dMasuk]).toEqual([0, null, null, null])
  })
  it('pecahan desimal tepat', () => {
    const m2 = [M('2026-11', 0.1, 0.2, 0, 0)]
    const r = summarizeItem(
      stock(item({ openingDate: '2026-11-01', openingQty: 0.5 }), m2),
      m2,
      '2026-11',
      '2026-11-18',
    )!
    expect(r.sisa).toBe(0.4)
  })
})

describe('status', () => {
  it('Kritis, Menipis, Tidak bergerak, Aman', () => {
    expect(statusOf(20, 20, null).label).toBe('Kritis')
    expect(statusOf(0, 0, null).label).toBe('Kritis')
    expect(statusOf(30, 20, null).label).toBe('Menipis')
    expect(statusOf(31, 20, 14).label).toBe('Tidak bergerak')
    expect(statusOf(31, 20, 13).label).toBe('Aman')
    expect(statusOf(31, 20, null).label).toBe('Aman')
  })
  it('hari tidak bergerak dari tanggal transaksi terakhir; barang tanpa transaksi dihitung sejak saldo awal', () => {
    const a = summarizeItem(
      item({ currentStock: 100, lastTxDate: '2026-11-01', txCount: 3, minStock: 5 }),
      [],
      '2026-11',
      '2026-11-18',
    )!
    expect(a.idle).toBe(17)
    expect(a.statusLabel).toBe('Tidak bergerak')
    const b = summarizeItem(
      item({ currentStock: 100, txCount: 0, openingDate: '2026-11-10', minStock: 5 }),
      [],
      '2026-11',
      '2026-11-18',
    )!
    expect(b.idle).toBe(8)
    const c = summarizeItem(
      item({ currentStock: 100, txCount: 4, lastTxDate: null, minStock: 5 }),
      [],
      '2026-11',
      '2026-11-18',
    )!
    expect(c.idle).toBeNull() // data lama tanpa tanggal: tidak dituduh diam
  })
})

describe('cocok dengan hitungan manual dari buku transaksi (acak)', () => {
  type E = { date: string; type: 'masuk' | 'keluar' | 'koreksi'; in: number; out: number }
  function rng(seed: number) {
    return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  }
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}`, () => {
      const r = rng(seed)
      const opening = Math.floor(r() * 200) / 2
      const entries: E[] = []
      const months = new Map<string, MonthTotals>()
      const get = (ym: string) => months.get(ym) ?? (months.set(ym, M(ym, 0, 0, 0, 0, 0)), months.get(ym)!)
      for (let n = 0; n < 40; n++) {
        const ym = ['2026-08', '2026-09', '2026-10', '2026-11'][Math.floor(r() * 4)]
        const date = `${ym}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`
        const q = (1 + Math.floor(r() * 300)) / 10
        const t = r() < 0.5 ? 'masuk' : 'keluar'
        const e: E = { date, type: t, in: t === 'masuk' ? q : 0, out: t === 'keluar' ? q : 0 }
        entries.push(e)
        const m = get(ym)
        m.in += e.in
        m.out += e.out
        m.count = (m.count ?? 0) + 1
        if (r() < 0.2) {
          // koreksi atas transaksi ini: pembalik di tanggal dan bulan yang sama
          entries.push({ date, type: 'koreksi', in: e.out, out: e.in })
          m.corrIn += e.out
          m.corrOut += e.in
        }
      }
      const all = [...months.values()]
      const net = entries.reduce((a, e) => a + e.in - e.out, 0)
      const it = item({
        openingQty: opening,
        openingDate: '2026-08-01',
        currentStock: Math.round((opening + net) * 1000) / 1000,
        minStock: 0,
      })
      for (const ym of ['2026-08', '2026-09', '2026-10', '2026-11']) {
        const row = summarizeItem(
          it,
          all.filter((t) => t.id >= prevYm(ym)),
          ym,
          '2026-11-30',
        )!
        // hitungan manual: ulang buku transaksi dari awal
        let bal = opening
        let inn = 0
        let out = 0
        let awal = ym === '2026-08' ? opening : 0
        for (const e of entries) {
          const eym = e.date.slice(0, 7)
          if (eym < ym) bal += e.in - e.out
          else if (eym === ym) {
            if (e.type === 'masuk') inn += e.in
            else if (e.type === 'keluar') out += e.out
            else {
              // koreksi atas masuk (out>0) mengurangi masuk; atas keluar (in>0) mengurangi keluar
              inn -= e.out
              out -= e.in
            }
          }
        }
        if (ym !== '2026-08') awal = bal
        let end = opening
        for (const e of entries) if (e.date.slice(0, 7) <= ym) end += e.in - e.out
        expect(row.awal).toBeCloseTo(awal, 6)
        expect(row.masuk).toBeCloseTo(inn, 6)
        expect(row.keluar).toBeCloseTo(out, 6)
        expect(row.sisa).toBeCloseTo(end, 6)
        expect(row.sisa).toBeCloseTo(row.awal + row.masuk - row.keluar, 6)
      }
    })
  }
})

describe('gabung, KPI, urut, bandingkan', () => {
  const ms = [M('2026-11', 10, 40, 0, 0, 3)]
  const a = summarizeItem(
    stock(
      item({
        projectId: 'p1',
        openingDate: '2026-11-01',
        openingQty: 100,
        minStock: 10,
        lastTxDate: '2026-11-17',
        txCount: 3,
      }),
      ms,
    ),
    ms,
    '2026-11',
    '2026-11-18',
  )!
  const b = summarizeItem(
    stock(
      item({
        projectId: 'p2',
        openingDate: '2026-11-01',
        openingQty: 50,
        minStock: 10,
        lastTxDate: '2026-11-02',
        txCount: 1,
      }),
      [M('2026-11', 0, 40, 0, 0, 1)],
    ),
    [M('2026-11', 0, 40, 0, 0, 1)],
    '2026-11',
    '2026-11-18',
  )!
  it('barang sama di dua proyek dijumlahkan; status dihitung ulang dari jumlah', () => {
    const [m] = mergeByItem([a, b])
    expect([m.awal, m.masuk, m.keluar, m.sisa, m.min, m.tx]).toEqual([150, 10, 80, 80, 20, 4])
    expect(m.projectIds).toEqual(['p1', 'p2'])
    expect(m.idle).toBe(1) // bergerak kemarin di salah satu proyek
    expect(m.pct).toBeCloseTo((80 / 160) * 100, 9)
    expect(m.statusLabel).toBe('Aman')
  })
  it('KPI', () => {
    const k = kpis([a, b])
    expect(k).toEqual({ items: 2, tx: 4, kritis: 1, idle: 1 })
  })
  it('urut: nilai kosong selalu di akhir; stabil berdasarkan nama', () => {
    const none = { ...a, name: 'Aaa', cover: null }
    const s = sortRows([none, a, b], 'cover', -1).map((r) => r.name)
    expect(s.at(-1)).toBe('Aaa')
    expect(sortRows([none, a, b], 'cover', 1).at(-1)?.name).toBe('Aaa')
    expect(sortRows([b, a], 'status', 1).map((r) => r.projectIds[0])).toEqual(['p2', 'p1']) // b (kritis) lebih dulu dari a (aman)
  })
  it('bandingkan proyek', () => {
    const c = compareProjects(
      new Map([
        ['p1', [a]],
        ['p2', [b]],
      ]),
    )
    expect(c.map((x) => [x.projectId, x.items, x.tx, x.idle])).toEqual([
      ['p1', 1, 3, 0],
      ['p2', 1, 1, 1],
    ])
    expect(c[0].avgPct).toBeCloseTo(a.pct, 9)
  })
})

describe('deret grafik', () => {
  it('sisa stok 30 hari dihitung mundur dari stok kini', () => {
    const s = stockSeries(
      110,
      [
        { date: '2026-11-17', in: 0, out: 30 },
        { date: '2026-11-10', in: 40, out: 0 },
      ],
      '2026-11-18',
      30,
    )
    expect(s).toHaveLength(30)
    expect(s.at(-1)).toEqual({ date: '2026-11-18', value: 110 })
    expect(s.find((x) => x.date === '2026-11-17')?.value).toBe(110) // akhir 17 Nov (setelah keluar 30)
    expect(s.find((x) => x.date === '2026-11-16')?.value).toBe(140)
    expect(s.find((x) => x.date === '2026-11-10')?.value).toBe(140)
    expect(s.find((x) => x.date === '2026-11-09')?.value).toBe(100)
    expect(s[0].date).toBe('2026-10-20')
  })
  it('keluar dan masuk pada hari yang sama; pecahan', () => {
    const s = stockSeries(0.3, [{ date: '2026-11-18', in: 0.2, out: 0.1 }], '2026-11-18', 2)
    expect(s.map((x) => x.value)).toEqual([0.2, 0.3])
  })
  it('batang bulanan: koreksi dikurangkan, bulan kosong 0, urut lama ke baru', () => {
    const b = monthlyBars([M('2026-10', 10, 5, 2, 1), M('2026-08', 7, 0)], '2026-11', 4)
    expect(b).toEqual([
      { ym: '2026-08', masuk: 7, keluar: 0 },
      { ym: '2026-09', masuk: 0, keluar: 0 },
      { ym: '2026-10', masuk: 9, keluar: 3 },
      { ym: '2026-11', masuk: 0, keluar: 0 },
    ])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
