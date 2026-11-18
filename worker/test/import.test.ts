import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorld } from './world'

const w = useWorld()
let n = 0
const iid = () => `imp-${++n}-${Math.random().toString(36).slice(2, 10)}`

beforeEach(() => {
  for (const [id, name] of [['i1', 'Semen'], ['i2', 'Pasir']]) {
    w.be.seedDoc(`catalog/${id}`, { name, unit: 'Sak', active: true, minStock: 10, projectCount: 1 })
    w.be.seedDoc(`projects/p1/items/${id}`, { catalogId: id, openingQty: 100, openingDate: '2026-09-01', currentStock: 100, txCount: 0, minStock: 10, active: true })
  }
})

type Row = { itemId: string; type: string; qty: unknown; date: string; note?: string }
const R = (over: Partial<Row> = {}): Row => ({ itemId: 'i1', type: 'masuk', qty: 5, date: '2026-09-10', note: 'n', ...over })
const imp = (rows: Row[], over: Record<string, unknown> = {}, as = 'u-pm1') =>
  w.post('/ledger/import', { projectId: 'p1', importId: iid(), fileName: 'uji.xlsx', rows, ...over }, as)
const item = (i = 'i1') => w.be.getData(`projects/p1/items/${i}`)!
const ledger = () => w.be.list('projects/p1/ledger')
const day = (d: string, i = 'i1') => w.be.getData(`projects/p1/items/${i}/days/${d}`)
const month = (ym: string, i = 'i1') => w.be.getData(`projects/p1/items/${i}/months/${ym}`)
const statuses = (r: { body: { results: { status: string }[] } }) => r.body.results.map((x) => x.status)

describe('impor massal', () => {
  it('baris valid dimasukkan: buku, stok, harian, bulanan, audit tunggal', async () => {
    const r = await imp([R({ qty: 40, date: '2026-09-10' }), R({ type: 'keluar', qty: 30, date: '2026-09-12' }), R({ itemId: 'i2', qty: 7, date: '2026-10-02' })])
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ accepted: 3, rejected: 0, duplicates: 0 })
    expect(statuses(r)).toEqual(['ok', 'ok', 'ok'])
    expect(ledger()).toHaveLength(3)
    expect(ledger()[0].data).toMatchObject({ source: 'import', createdBy: 'u-pm1' })
    expect(item()).toMatchObject({ currentStock: 110, txCount: 2, lastTxDate: '2026-09-12' })
    expect(item('i2')).toMatchObject({ currentStock: 107, txCount: 1, lastTxDate: '2026-10-02' })
    expect(day('2026-09-12')).toMatchObject({ in: 0, out: 30 })
    expect(month('2026-09')).toMatchObject({ in: 40, out: 30, count: 2, corrIn: 0 })
    expect(month('2026-10', 'i2')).toMatchObject({ in: 7, count: 1 })
    expect(w.audits().filter((x) => x.action === 'ledger.import')).toHaveLength(1)
    expect(w.lastAudit('ledger.import')!.detail).toMatchObject({ berkas: 'uji.xlsx', diterima: 3, ditolak: 0 })
  })

  it('hasil akhir sama persis dengan mencatat satu per satu (uji pembanding)', async () => {
    const rows = [
      R({ qty: 12.5, date: '2026-09-05' }), R({ type: 'keluar', qty: 20, date: '2026-09-06' }), R({ qty: 0.1, date: '2026-09-06' }),
      R({ qty: 0.2, date: '2026-09-06' }), R({ type: 'keluar', qty: 3, date: '2026-10-01' }), R({ qty: 9, date: '2026-10-01' }),
    ]
    await imp(rows)
    const snap = (i: string) => ({ item: { ...item(i) }, d: ['2026-09-05', '2026-09-06', '2026-10-01'].map((d) => day(d, i)), m: [month('2026-09', i), month('2026-10', i)] })
    const viaImport = snap('i1')
    // reset dan ulangi lewat /ledger/add
    for (const p of ['days/2026-09-05', 'days/2026-09-06', 'days/2026-10-01', 'months/2026-09', 'months/2026-10']) w.be.docs.delete(`projects/p1/items/i1/${p}`)
    for (const e of ledger()) w.be.docs.delete(`projects/p1/ledger/${e.id}`)
    Object.assign(item(), { currentStock: 100, txCount: 0 })
    delete item().lastTxDate
    // urutan sama dengan pemrosesan impor: masuk dahulu menurut tanggal, lalu keluar
    const order = [...rows.filter((x) => x.type === 'masuk'), ...rows.filter((x) => x.type === 'keluar')].sort((a, b) => 0)
    for (const x of order) expect((await w.post('/ledger/add', { projectId: 'p1', itemId: x.itemId, type: x.type, qty: x.qty, date: x.date, requestId: iid() }, 'u-pm1')).status).toBe(200)
    const viaAdd = snap('i1')
    expect(viaImport.item.currentStock).toBe(viaAdd.item.currentStock)
    expect(viaImport.item.txCount).toBe(viaAdd.item.txCount)
    expect(viaImport.item.lastTxDate).toBe(viaAdd.item.lastTxDate)
    expect(viaImport.d).toEqual(viaAdd.d)
    expect(viaImport.m).toEqual(viaAdd.m)
  })

  it('baris salah ditolak dengan alasan; baris benar tetap masuk', async () => {
    w.be.getData('projects/p1/items/i2')!.active = false
    const r = await imp([
      R(), // 1 ok
      R({ qty: 0 }), // 2
      R({ qty: 1.0001 }), // 3
      R({ qty: 'abc' }), // 4
      R({ date: '2026-08-31' }), // 5 sebelum saldo awal
      R({ date: '2999-01-01' }), // 6 masa depan
      R({ date: '10/09/2026' }), // 7 format
      R({ type: 'koreksi' }), // 8
      R({ itemId: 'zzz' }), // 9 tidak ada
      R({ itemId: 'i2' }), // 10 nonaktif
      R({ note: 'x'.repeat(201) }), // 11
    ])
    expect(r.status).toBe(200)
    expect(statuses(r)).toEqual(['ok', ...Array(10).fill('error')])
    expect(r.body.results[8].code).toBe('not_found')
    expect(r.body.results[9].code).toBe('inactive')
    expect(r.body.results[4].message).toContain('saldo awal')
    expect(r.body).toMatchObject({ accepted: 1, rejected: 10 })
    expect(ledger()).toHaveLength(1)
    expect(item().currentStock).toBe(105)
  })

  it('stok: keluar melebihi stok ditolak; masuk dalam berkas yang sama diproses lebih dulu', async () => {
    const r = await imp([R({ type: 'keluar', qty: 130, date: '2026-09-10' }), R({ qty: 50, date: '2026-09-10' }), R({ type: 'keluar', qty: 30, date: '2026-09-11' })])
    // 100 + 50 masuk = 150; keluar 130 -> 20; keluar 30 sesudahnya melebihi sisa 20
    expect(statuses(r)).toEqual(['ok', 'ok', 'error'])
    expect(r.body.results[2].code).toBe('insufficient')
    expect(item().currentStock).toBe(20)
  })

  it('keluar yang membuat saldo negatif pada hari sesudahnya ditolak, yang lain lolos (maksimal dipenuhi menurut tanggal)', async () => {
    // stok 100. Keluar 60 (10 Sep) lolos; keluar 60 (11 Sep) ditolak (sisa 40); keluar 40 (12 Sep) lolos
    const r = await imp([R({ type: 'keluar', qty: 60, date: '2026-09-10' }), R({ type: 'keluar', qty: 60, date: '2026-09-11' }), R({ type: 'keluar', qty: 40, date: '2026-09-12' })])
    expect(statuses(r)).toEqual(['ok', 'error', 'ok'])
    expect(r.body.results[1].code).toBe('insufficient')
    expect(item().currentStock).toBe(0)
  })

  it('tanggal mundur diperiksa terhadap transaksi yang sudah ada', async () => {
    await w.post('/ledger/add', { projectId: 'p1', itemId: 'i1', type: 'keluar', qty: 90, date: '2026-09-10', requestId: iid() }, 'u-pm1') // stok 10
    const r = await imp([R({ type: 'keluar', qty: 11, date: '2026-09-05' }), R({ type: 'keluar', qty: 10, date: '2026-09-05' })])
    expect(statuses(r)).toEqual(['error', 'ok'])
    expect(item().currentStock).toBe(0)
  })

  it('idempoten: berkas yang sama dikirim ulang tidak mencatat ganda', async () => {
    const id = iid()
    const rows = [R({ qty: 5 }), R({ type: 'keluar', qty: 2, date: '2026-09-11' })]
    expect(statuses(await imp(rows, { importId: id }))).toEqual(['ok', 'ok'])
    const again = await imp(rows, { importId: id })
    expect(statuses(again)).toEqual(['duplicate', 'duplicate'])
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 2 })
    expect(ledger()).toHaveLength(2)
    expect(item()).toMatchObject({ currentStock: 103, txCount: 2 })
    expect(w.audits().filter((x) => x.action === 'ledger.import')).toHaveLength(1)
  })

  it('dua permintaan identik bersamaan: hanya satu yang menulis', async () => {
    const id = iid()
    const rows = [R({ qty: 5 }), R({ qty: 6, date: '2026-09-11' })]
    const [a, b] = await Promise.all([imp(rows, { importId: id }), imp(rows, { importId: id })])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(ledger()).toHaveLength(2)
    expect(item()).toMatchObject({ currentStock: 111, txCount: 2 })
    expect(month('2026-09')).toMatchObject({ in: 11, count: 2 })
  })

  it('bersaing dengan pencatatan tunggal: tabrakan diulang dan hasil konsisten', async () => {
    let fired = false
    w.be.beforeCommit = () => {
      if (fired) return
      fired = true
      const d = w.be.getData('projects/p1/items/i1')!
      w.be.seedDoc('projects/p1/items/i1', { ...d, currentStock: 101, txCount: 1 }) // mengubah updateTime
    }
    const r = await imp([R({ qty: 9 })])
    expect(r.status).toBe(200)
    expect(item()).toMatchObject({ currentStock: 110, txCount: 2 })
  })

  it('wewenang: butuh izin import dan inventory.write serta proyek yang ditugaskan', async () => {
    expect((await imp([R()], {}, 'u-log')).status).toBe(403) // log tanpa izin import
    expect((await imp([R()], {}, 'u-pm2')).status).toBe(403) // proyek lain
    expect((await w.post('/ledger/import', { projectId: 'p1', importId: iid(), rows: [R()] })).status).toBe(401)
    expect((await imp([R()], {}, 'u-own')).status).toBe(200)
  })

  it('batas permintaan', async () => {
    expect((await imp([])).status).toBe(400)
    expect((await imp(Array.from({ length: 151 }, () => R()))).status).toBe(400)
    for (let k = 3; k <= 12; k++) w.be.seedDoc(`projects/p1/items/i${k}`, { openingQty: 1, openingDate: '2026-09-01', currentStock: 1, txCount: 0, active: true })
    const many = Array.from({ length: 11 }, (_, k) => R({ itemId: `i${k + 1}` }))
    expect((await imp(many)).body.error).toBe('too_many_items')
    expect((await imp([R()], { importId: 'x' })).status).toBe(400)
    expect(ledger()).toHaveLength(0)
  })

  it('berkas besar (150 baris, 10 barang) tetap dalam satu commit di bawah batas dan konsisten', async () => {
    for (let k = 3; k <= 10; k++) w.be.seedDoc(`projects/p1/items/i${k}`, { openingQty: 1000, openingDate: '2026-09-01', currentStock: 1000, txCount: 0, active: true })
    const rows = Array.from({ length: 150 }, (_, k) => R({ itemId: `i${(k % 10) + 1}`, type: k % 3 === 0 ? 'keluar' : 'masuk', qty: 1 + (k % 4), date: `2026-09-${String(1 + (k % 28)).padStart(2, '0')}` }))
    const calls0 = w.be.calls.length
    const r = await imp(rows)
    expect(r.status).toBe(200)
    expect(r.body.accepted + r.body.rejected).toBe(150)
    const subrequests = w.be.calls.length - calls0
    expect(subrequests).toBeLessThan(50) // batas sub-permintaan Worker paket gratis (termasuk muat pelaku)
    for (let k = 1; k <= 10; k++) {
      const it = item(`i${k}`) ?? w.be.getData(`projects/p1/items/i${k}`)!
      const net = ledger().filter((e) => e.data.itemId === `i${k}`).reduce((s, e) => s + Number(e.data.in) - Number(e.data.out), Number(it.openingQty))
      expect(it.currentStock).toBe(net)
    }
  })

  it('proyek nonaktif ditolak', async () => {
    w.be.getData('projects/p1')!.active = false
    expect((await imp([R()])).status).toBe(409)
  })
})
