import { describe, expect, it } from 'vitest'
import { useWorld } from './world'

const w = useWorld()
let n = 0
const iid = () => `imp-${++n}-${Math.random().toString(36).slice(2, 10)}`

const cat = (rows: unknown[], over: Record<string, unknown> = {}, as = 'u-own') => w.post('/catalog/import', { importId: iid(), fileName: 'katalog.xlsx', rows, ...over }, as)
const opening = (rows: unknown[], over: Record<string, unknown> = {}, as = 'u-own') => w.post('/items/import', { projectId: 'p1', importId: iid(), fileName: 'awal.xlsx', rows, ...over }, as)
const statuses = (r: { body: { results: { status: string }[] } }) => r.body.results.map((x) => x.status)
const catalogDocs = () => w.be.list('catalog')

describe('impor katalog barang', () => {
  it('membuat barang dan penjaga nama dalam satu commit, dengan audit tunggal', async () => {
    const r = await cat([{ name: 'Semen Portland', unit: 'Sak', category: 'Bahan', minStock: 20 }, { name: ' Pasir  Beton ', unit: 'm3' }])
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ accepted: 2, rejected: 0, duplicates: 0 })
    const docs = catalogDocs()
    expect(docs).toHaveLength(2)
    expect(docs.find((d) => d.data.name === 'Semen Portland')!.data).toMatchObject({ unit: 'Sak', category: 'Bahan', minStock: 20, active: true, projectCount: 0, source: 'import', createdBy: 'u-own' })
    expect(docs.find((d) => d.data.name === 'Pasir  Beton')!.data).toMatchObject({ minStock: 0, category: '' }) // spasi tepi dipangkas (sama seperti pembuatan manual)
    expect(w.be.list('catalogNames')).toHaveLength(2)
    expect(w.audits().filter((a) => a.action === 'catalog.import')).toHaveLength(1)
  })

  it('nama harus unik terhadap katalog yang ada (huruf besar/kecil dan spasi tepi tidak dibedakan) dan di dalam berkas', async () => {
    await w.post('/catalog/create', { name: 'Semen', unit: 'Sak' }, 'u-own')
    const r = await cat([{ name: '  SEMEN ', unit: 'Kg' }, { name: 'Besi', unit: 'Btg' }, { name: 'besi', unit: 'Btg' }])
    expect(statuses(r)).toEqual(['error', 'ok', 'error'])
    expect(r.body.results.map((x: { code?: string }) => x.code)).toEqual(['name_taken', undefined, 'name_taken'])
    expect(catalogDocs()).toHaveLength(2)
  })

  it('baris salah ditolak dengan alasan; yang benar tetap masuk', async () => {
    const r = await cat([{ name: '', unit: 'x' }, { name: 'A', unit: '' }, { name: 'B', unit: 'x', minStock: -1 }, { name: 'C', unit: 'x', minStock: 1.0001 }, { name: 'D'.repeat(161), unit: 'x' }, { name: 'Baik', unit: 'Sak', minStock: '5' }, { name: 'Baik2', unit: 'Sak', minStock: 5 }, 7])
    expect(statuses(r)).toEqual(['error', 'error', 'error', 'error', 'error', 'error', 'ok', 'error'])
    expect(catalogDocs()).toHaveLength(1)
  })

  it('idempoten: berkas yang sama dikirim ulang tidak mencatat ganda', async () => {
    const id = iid()
    const rows = [{ name: 'Semen', unit: 'Sak' }, { name: 'Pasir', unit: 'm3' }]
    expect(statuses(await cat(rows, { importId: id }))).toEqual(['ok', 'ok'])
    const again = await cat(rows, { importId: id })
    expect(statuses(again)).toEqual(['duplicate', 'duplicate'])
    expect(catalogDocs()).toHaveLength(2)
    expect(w.audits().filter((a) => a.action === 'catalog.import')).toHaveLength(1)
  })

  it('dua permintaan identik bersamaan: satu menulis', async () => {
    const id = iid()
    const rows = [{ name: 'Semen', unit: 'Sak' }]
    const [a, b] = await Promise.all([cat(rows, { importId: id }), cat(rows, { importId: id })])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(catalogDocs()).toHaveLength(1)
  })

  it('wewenang: izin catalog dan import; tanpa masuk 401', async () => {
    expect((await cat([{ name: 'X', unit: 'y' }], {}, 'u-pm1')).status).toBe(403) // pm tanpa izin katalog
    expect((await cat([{ name: 'X', unit: 'y' }], {}, 'u-log')).status).toBe(403)
    expect((await w.post('/catalog/import', { importId: iid(), rows: [{ name: 'X', unit: 'y' }] })).status).toBe(401)
    expect(catalogDocs()).toHaveLength(0)
  })

  it('batas: kosong, 151 baris, ID impor buruk', async () => {
    expect((await cat([])).status).toBe(400)
    expect((await cat(Array.from({ length: 151 }, (_, k) => ({ name: `B${k}`, unit: 'x' })))).status).toBe(400)
    expect((await cat([{ name: 'A', unit: 'x' }], { importId: 'x' })).status).toBe(400)
  })

  it('150 baris dalam satu commit di bawah batas sub-permintaan', async () => {
    const calls0 = w.be.calls.length
    const r = await cat(Array.from({ length: 150 }, (_, k) => ({ name: `Barang ${k}`, unit: 'x' })))
    expect(r.body.accepted).toBe(150)
    expect(w.be.calls.length - calls0).toBeLessThan(15)
    expect(catalogDocs()).toHaveLength(150)
  })
})

describe('impor saldo awal (barang proyek)', () => {
  const mkCat = async (...names: string[]) => {
    const ids: string[] = []
    for (const nm of names) ids.push(String((await w.post('/catalog/create', { name: nm, unit: 'Sak', minStock: 7 }, 'u-own')).body.id))
    return ids
  }

  it('menambah barang ke proyek dengan saldo awal, stok, jumlah pemakaian katalog, dan audit tunggal', async () => {
    const [a, b] = await mkCat('Semen', 'Pasir')
    const r = await opening([{ catalogId: a, openingQty: 100, openingDate: '2026-09-01' }, { catalogId: b, openingQty: 0, openingDate: '2026-09-01', minStock: 3 }])
    expect(r.body).toMatchObject({ accepted: 2, rejected: 0 })
    expect(w.be.getData(`projects/p1/items/${a}`)).toMatchObject({ openingQty: 100, openingDate: '2026-09-01', currentStock: 100, txCount: 0, minStock: 7, active: true, source: 'import', createdBy: 'u-own' })
    expect(w.be.getData(`projects/p1/items/${b}`)).toMatchObject({ openingQty: 0, currentStock: 0, minStock: 3 })
    expect(w.be.getData(`catalog/${a}`)!.projectCount).toBe(1)
    expect(w.audits().filter((x) => x.action === 'item.import')).toHaveLength(1)
  })

  it('barang yang sudah di proyek tidak ditimpa; kembar di berkas, tak ada di katalog, nonaktif ditolak', async () => {
    const [a, b, c] = await mkCat('Semen', 'Pasir', 'Besi')
    await w.post('/items/add', { projectId: 'p1', catalogId: a, openingQty: 50, openingDate: '2026-09-01' }, 'u-own')
    w.be.getData(`catalog/${c}`)!.active = false
    const r = await opening([
      { catalogId: a, openingQty: 999, openingDate: '2026-09-01' },
      { catalogId: b, openingQty: 5, openingDate: '2026-09-01' },
      { catalogId: b, openingQty: 6, openingDate: '2026-09-01' },
      { catalogId: 'tidak-ada', openingQty: 1, openingDate: '2026-09-01' },
      { catalogId: c, openingQty: 1, openingDate: '2026-09-01' },
    ])
    expect(statuses(r)).toEqual(['error', 'ok', 'error', 'error', 'error'])
    expect(r.body.results.map((x: { code?: string }) => x.code)).toEqual(['item_exists', undefined, 'item_exists', 'unknown_item', 'unknown_item'])
    expect(w.be.getData(`projects/p1/items/${a}`)).toMatchObject({ openingQty: 50 })
    expect(w.be.getData(`projects/p1/items/${b}`)).toMatchObject({ openingQty: 5 })
  })

  it('validasi nilai: tanggal masa depan/format, saldo negatif, 4 desimal, tanpa saldo atau tanggal', async () => {
    const [a] = await mkCat('Semen')
    const r = await opening([
      { catalogId: a, openingQty: 1, openingDate: '2999-01-01' },
      { catalogId: a, openingQty: 1, openingDate: '01/09/2026' },
      { catalogId: a, openingQty: -1, openingDate: '2026-09-01' },
      { catalogId: a, openingQty: 1.0001, openingDate: '2026-09-01' },
      { catalogId: a, openingDate: '2026-09-01' },
      { catalogId: a, openingQty: 1 },
    ])
    expect(statuses(r)).toEqual(Array(6).fill('error'))
    expect(w.be.list('projects/p1/items')).toHaveLength(0)
  })

  it('idempoten: sesi impor yang sama tidak menggandakan penghitung pemakaian katalog', async () => {
    const [a] = await mkCat('Semen')
    const id = iid()
    const rows = [{ catalogId: a, openingQty: 10, openingDate: '2026-09-01' }]
    await opening(rows, { importId: id })
    const again = await opening(rows, { importId: id })
    expect(statuses(again)).toEqual(['duplicate'])
    expect(w.be.getData(`catalog/${a}`)!.projectCount).toBe(1)
  })

  it('wewenang: Manajer Proyek di proyeknya boleh; proyek lain, Admin Logistik tanpa import, dan proyek nonaktif tidak', async () => {
    const [a] = await mkCat('Semen')
    const row = [{ catalogId: a, openingQty: 1, openingDate: '2026-09-01' }]
    expect((await opening(row, {}, 'u-pm1')).status).toBe(200)
    expect((await opening(row, {}, 'u-pm2')).status).toBe(403)
    expect((await opening(row, {}, 'u-log')).status).toBe(403)
    expect((await opening(row, { projectId: 'p3' })).status).toBe(400) // proyek nonaktif
    expect((await opening(row, { projectId: 'p9' })).status).toBe(404)
  })

  it('setelah impor, transaksi langsung bisa dicatat (saldo awal terisi)', async () => {
    const [a] = await mkCat('Semen')
    await opening([{ catalogId: a, openingQty: 100, openingDate: '2026-09-01' }])
    const r = await w.post('/ledger/add', { projectId: 'p1', itemId: a, type: 'keluar', qty: 30, date: '2026-09-10', requestId: iid() }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(w.be.getData(`projects/p1/items/${a}`)!.currentStock).toBe(70)
  })

  it('150 baris dalam satu commit, sub-permintaan terjaga', async () => {
    const ids = await Promise.all(Array.from({ length: 150 }, (_, k) => w.post('/catalog/create', { name: `B${k}`, unit: 'x' }, 'u-own').then((r) => String(r.body.id))))
    const calls0 = w.be.calls.length
    const r = await opening(ids.map((id) => ({ catalogId: id, openingQty: 1, openingDate: '2026-09-01' })))
    expect(r.body.accepted).toBe(150)
    expect(w.be.calls.length - calls0).toBeLessThan(15)
  })
})
