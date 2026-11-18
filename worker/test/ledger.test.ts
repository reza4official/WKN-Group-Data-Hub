import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lowestBalanceFrom } from '../src/handlers/ledger'
import { useWorld } from './world'

const w = useWorld()
afterEach(() => vi.useRealTimers())

let n = 0
const rid = () => `req-${++n}-${Math.random().toString(36).slice(2, 10)}`

beforeEach(() => {
  w.be.seedDoc('catalog/i1', { name: 'Semen', unit: 'Sak', active: true, minStock: 10, projectCount: 1 })
  w.be.seedDoc('projects/p1/items/i1', { catalogId: 'i1', openingQty: 100, openingDate: '2026-09-01', currentStock: 100, txCount: 0, minStock: 10, active: true })
})

const add = (over: Record<string, unknown> = {}, as = 'u-log') =>
  w.post('/ledger/add', { projectId: 'p1', itemId: 'i1', type: 'masuk', qty: 5, date: '2026-09-10', note: 'uji', requestId: rid(), ...over }, as)
const item = () => w.be.getData('projects/p1/items/i1')!
const month = (ym = '2026-09') => w.be.getData(`projects/p1/items/i1/months/${ym}`)
const day = (d: string) => w.be.getData(`projects/p1/items/i1/days/${d}`)
const ledger = () => w.be.list('projects/p1/ledger')

describe('mencatat transaksi', () => {
  it('masuk: entri, stok, total harian dan bulanan, serta audit tertulis atomik', async () => {
    const r = await add({ qty: 40, type: 'masuk', note: 'Kiriman supplier' })
    expect(r.status).toBe(200)
    expect(r.body.currentStock).toBe(140)
    const e = w.be.getData(`projects/p1/ledger/${r.body.id}`)!
    expect(e).toMatchObject({ itemId: 'i1', date: '2026-09-10', ym: '2026-09', type: 'masuk', in: 40, out: 0, seq: 1, note: 'Kiriman supplier', createdBy: 'u-log', createdByName: 'Nama log1' })
    expect(typeof e.createdAt).toBe('string') // waktu server
    expect(item()).toMatchObject({ currentStock: 140, txCount: 1 })
    expect(day('2026-09-10')).toMatchObject({ in: 40, out: 0 })
    expect(month()).toMatchObject({ in: 40, out: 0, corrIn: 0, corrOut: 0, count: 1 })
    expect(w.lastAudit('ledger.in')).toMatchObject({ actorUid: 'u-log', targetType: 'ledger', targetId: r.body.id })
  })

  it('keluar mengurangi stok; total bulan dijumlahkan lintas hari', async () => {
    await add({ type: 'masuk', qty: 10, date: '2026-09-10' })
    await add({ type: 'keluar', qty: 30, date: '2026-09-12' })
    await add({ type: 'keluar', qty: 5, date: '2026-09-12' })
    expect(item()).toMatchObject({ currentStock: 75, txCount: 3 })
    expect(day('2026-09-12')).toMatchObject({ out: 35 })
    expect(month()).toMatchObject({ in: 10, out: 35, count: 3 })
    expect(month('2026-10')).toBeUndefined()
  })

  it('bulan berbeda memakai dokumen bulan berbeda', async () => {
    await add({ type: 'masuk', qty: 1, date: '2026-09-30' })
    await add({ type: 'masuk', qty: 2, date: '2026-10-01' })
    expect(month('2026-09')).toMatchObject({ in: 1 })
    expect(month('2026-10')).toMatchObject({ in: 2 })
  })

  it('stok tidak boleh negatif; keluar tepat sebesar stok diperbolehkan (jadi 0)', async () => {
    const bad = await add({ type: 'keluar', qty: 100.001 })
    expect(bad.status).toBe(409)
    expect(bad.body.error).toBe('insufficient')
    expect(String(bad.body.message)).toContain('100')
    expect(ledger()).toHaveLength(0)
    expect(item()).toMatchObject({ currentStock: 100, txCount: 0 })
    expect((await add({ type: 'keluar', qty: 100 })).status).toBe(200)
    expect(item().currentStock).toBe(0)
    expect((await add({ type: 'keluar', qty: 0.001 })).body.error).toBe('insufficient')
  })

  it('pecahan desimal tidak menggeser angka (0,1 + 0,2 = 0,3 persis; keluar 0,3 tidak ditolak salah)', async () => {
    w.be.getData('projects/p1/items/i1')!.openingQty = 0
    w.be.getData('projects/p1/items/i1')!.currentStock = 0
    await add({ type: 'masuk', qty: 0.1 })
    await add({ type: 'masuk', qty: 0.2 })
    expect(item().currentStock).toBe(0.3)
    expect((await add({ type: 'keluar', qty: 0.3 })).status).toBe(200)
    expect(item().currentStock).toBe(0)
    for (let i = 0; i < 10; i++) await add({ type: 'masuk', qty: 0.1 })
    expect(item().currentStock).toBe(1)
    expect((await add({ type: 'keluar', qty: 1 })).status).toBe(200)
  })
})

describe('validasi di server', () => {
  it('barang tanpa saldo awal, barang/proyek nonaktif, tidak ada', async () => {
    w.be.getData('projects/p1/items/i1')!.openingQty = null
    w.be.getData('projects/p1/items/i1')!.openingDate = null
    expect((await add()).body.error).toBe('no_opening')
    w.be.getData('projects/p1/items/i1')!.openingQty = 100
    w.be.getData('projects/p1/items/i1')!.openingDate = '2026-09-01'
    w.be.getData('projects/p1/items/i1')!.active = false
    expect((await add()).body.error).toBe('inactive')
    w.be.getData('projects/p1/items/i1')!.active = false
    w.be.getData('projects/p1/items/i1')!.active = true
    w.be.getData('projects/p1')!.active = false
    expect((await add()).body.error).toBe('inactive')
    w.be.getData('projects/p1')!.active = true
    expect((await add({ itemId: 'zzz' })).status).toBe(404)
    expect((await add({ projectId: 'p9' }, 'u-own')).status).toBe(404)
    expect(ledger()).toHaveLength(0)
  })

  it('tanggal: sebelum saldo awal, format salah, tak ada, masa depan (WITA)', async () => {
    expect((await add({ date: '2026-08-31' })).status).toBe(400)
    expect((await add({ date: '31-08-2026' })).status).toBe(400)
    expect((await add({ date: undefined })).status).toBe(400)
    expect((await add({ date: '2999-01-01' })).status).toBe(400)
    expect((await add({ date: '2026-09-01' })).status).toBe(200) // tepat pada tanggal saldo awal
  })

  it('tanggal hari ini menurut WITA diterima pukul 00:00-08:00 WITA, tanggal besok ditolak', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T18:30:00Z')) // 02:30 WITA tanggal 18
    expect((await add({ date: '2026-11-18' })).status).toBe(200)
    expect((await add({ date: '2026-11-19' })).status).toBe(400)
  })

  it('jumlah: nol, negatif, 4 desimal, teks, NaN, terlalu besar ditolak', async () => {
    for (const q of [0, -1, 1.0001, '5', null, 1e10]) expect((await add({ qty: q })).status, String(q)).toBe(400)
    expect((await add({ qty: 0.001 })).status).toBe(200)
  })

  it('jenis dan ID permintaan', async () => {
    expect((await add({ type: 'koreksi' })).status).toBe(400)
    expect((await add({ type: 'hapus' })).status).toBe(400)
    expect((await add({ requestId: 'pendek' })).status).toBe(400)
    expect((await add({ requestId: 'ada spasi dan /' })).status).toBe(400)
  })

  it('keterangan terlalu panjang ditolak', async () => {
    expect((await add({ note: 'x'.repeat(201) })).status).toBe(400)
  })
})

describe('wewenang', () => {
  it('Admin Logistik yang ditugaskan boleh mencatat; proyek lain, atau tanpa izin, tidak', async () => {
    expect((await add({}, 'u-log')).status).toBe(200)
    expect((await add({}, 'u-logB')).status).toBe(403) // ditugaskan di p2
    // role tanpa inventory.write
    w.be.seedDoc('roles/ro', { name: 'Pembaca', level: 10, system: false, perms: ['inventory.read'] })
    await w.seedUser('u-ro', 'ro', 'ro')
    expect((await add({}, 'u-ro')).status).toBe(403)
    expect((await w.post('/ledger/add', { projectId: 'p1', itemId: 'i1', type: 'masuk', qty: 5, date: '2026-09-10', requestId: rid() })).status).toBe(401)
  })

  it('Owner (izin projects) mencatat di proyek mana pun', async () => {
    expect((await add({}, 'u-own')).status).toBe(200)
  })

  it('akun nonaktif tidak bisa mencatat', async () => {
    w.be.getData('users/u-log')!.disabled = true
    expect((await add({}, 'u-log')).status).toBe(403)
  })
})

describe('idempotensi (permintaan diulang saat jaringan tidak stabil)', () => {
  it('ID permintaan yang sama dari pelaku yang sama tidak mencatat dua kali', async () => {
    const id = rid()
    const a = await add({ requestId: id, qty: 10 })
    const b = await add({ requestId: id, qty: 10 })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(b.body.duplicate).toBe(true)
    expect(b.body.id).toBe(a.body.id)
    expect(ledger()).toHaveLength(1)
    expect(item()).toMatchObject({ currentStock: 110, txCount: 1 })
    expect(month()).toMatchObject({ in: 10, count: 1 })
    expect(w.audits().filter((x) => x.action === 'ledger.in')).toHaveLength(1)
  })

  it('ID yang sama dengan isi berbeda atau pelaku berbeda ditolak', async () => {
    const id = rid()
    await add({ requestId: id, qty: 10 })
    expect((await add({ requestId: id, qty: 11 })).body.error).toBe('duplicate_request')
    expect((await add({ requestId: id, qty: 10 }, 'u-pm1')).body.error).toBe('duplicate_request')
    expect(ledger()).toHaveLength(1)
  })
})

describe('transaksi bertanggal mundur', () => {
  beforeEach(async () => {
    await add({ type: 'keluar', qty: 90, date: '2026-09-10' }) // stok 10
    await add({ type: 'masuk', qty: 5, date: '2026-09-20' }) // stok 15
  })

  it('keluar bertanggal mundur ditolak bila membuat saldo negatif pada tanggal setelahnya', async () => {
    // saldo akhir 10 Sep = 10 (terendah sejak 5 Sep); keluar 11 pada 5 Sep membuat 10 Sep negatif
    const r = await add({ type: 'keluar', qty: 11, date: '2026-09-05' })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('insufficient')
    expect(String(r.body.message)).toContain('10')
    expect(item().currentStock).toBe(15)
  })

  it('keluar bertanggal mundur diterima bila saldo di semua titik sesudahnya cukup', async () => {
    expect((await add({ type: 'keluar', qty: 10, date: '2026-09-05' })).status).toBe(200) // titik terendah 10 -> 0
    expect(item().currentStock).toBe(5)
    // setelah itu tidak ada ruang lagi pada tanggal 5-19 Sep
    expect((await add({ type: 'keluar', qty: 1, date: '2026-09-15' })).body.error).toBe('insufficient')
    // tetapi tanggal 20 Sep (setelah barang masuk) masih ada saldo 5
    expect((await add({ type: 'keluar', qty: 5, date: '2026-09-20' })).status).toBe(200)
  })

  it('barang masuk bertanggal mundur selalu diterima dan menambah ruang bagi keluar berikutnya', async () => {
    expect((await add({ type: 'masuk', qty: 50, date: '2026-09-02' })).status).toBe(200)
    expect((await add({ type: 'keluar', qty: 30, date: '2026-09-05' })).status).toBe(200) // kini titik terendah 60
    expect(item().currentStock).toBe(35)
  })

  it('dalam satu hari barang masuk dihitung lebih dulu daripada keluar', async () => {
    // 10 Sep: akhir hari 10. Pada 20 Sep keluar 15 bersama masuk 5: saldo awal hari 10 + 5 = 15 cukup walau urutan input keluar dulu
    expect((await add({ type: 'keluar', qty: 15, date: '2026-09-20' })).status).toBe(200)
    expect(item().currentStock).toBe(0)
  })
})

describe('koreksi (entri pembalik)', () => {
  it('membalik barang masuk: entri baru, stok turun, total bulan memisahkan koreksi, asli tidak berubah', async () => {
    const a = await add({ type: 'masuk', qty: 40, date: '2026-09-10' })
    const orig = JSON.stringify(w.be.getData(`projects/p1/ledger/${a.body.id}`))
    const r = await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah input jumlah' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(r.body.id).toBe(`${a.body.id}__k`)
    const k = w.be.getData(`projects/p1/ledger/${r.body.id}`)!
    expect(k).toMatchObject({ type: 'koreksi', in: 0, out: 40, date: '2026-09-10', refEntryId: a.body.id, note: 'Salah input jumlah', createdBy: 'u-pm1' })
    expect(JSON.stringify(w.be.getData(`projects/p1/ledger/${a.body.id}`))).toBe(orig) // append-only: asli utuh
    expect(item()).toMatchObject({ currentStock: 100, txCount: 2 })
    expect(day('2026-09-10')).toMatchObject({ in: 40, out: 40 }) // netto 0
    expect(month()).toMatchObject({ in: 40, out: 0, corrIn: 0, corrOut: 40, count: 1, corrCount: 1 })
    expect(w.lastAudit('ledger.correct')).toMatchObject({ actorUid: 'u-pm1', targetId: r.body.id })
    expect((w.lastAudit('ledger.correct')!.detail as Record<string, unknown>).alasan).toBe('Salah input jumlah')
  })

  it('membalik barang keluar mengembalikan stok', async () => {
    const a = await add({ type: 'keluar', qty: 30, date: '2026-09-10' })
    const r = await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah barang' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(item().currentStock).toBe(100)
    expect(month()).toMatchObject({ out: 30, corrIn: 30 })
  })

  it('hanya satu koreksi per transaksi; koreksi tidak dapat dikoreksi', async () => {
    const a = await add({ type: 'masuk', qty: 5 })
    const body = { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }
    expect((await w.post('/ledger/correct', body, 'u-pm1')).status).toBe(200)
    expect((await w.post('/ledger/correct', body, 'u-pm1')).body.error).toBe('already_corrected')
    expect((await w.post('/ledger/correct', { ...body, entryId: `${a.body.id}__k` }, 'u-pm1')).body.error).toBe('not_correctable')
    expect(ledger()).toHaveLength(2)
  })

  it('dua koreksi bersamaan atas transaksi yang sama: hanya satu berhasil', async () => {
    const a = await add({ type: 'masuk', qty: 5 })
    const body = { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }
    const [x, y] = await Promise.all([w.post('/ledger/correct', body, 'u-pm1'), w.post('/ledger/correct', body, 'u-own')])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect(item().currentStock).toBe(100)
    expect(ledger()).toHaveLength(2)
  })

  it('alasan wajib; izin inventory.correct dan lingkup proyek wajib', async () => {
    const a = await add({ type: 'masuk', qty: 5 })
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'ab' }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }, 'u-log')).status).toBe(403) // log tanpa izin koreksi
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }, 'u-pm2')).status).toBe(403) // pm2 di p2
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: 'tidak-ada', reason: 'Salah' }, 'u-pm1')).status).toBe(404)
    expect(ledger()).toHaveLength(1)
  })

  it('membalik barang masuk ditolak bila stok setelah tanggal itu sudah terpakai (akan negatif)', async () => {
    const a = await add({ type: 'masuk', qty: 50, date: '2026-09-10' }) // stok 150
    await add({ type: 'keluar', qty: 140, date: '2026-09-15' }) // stok 10
    const r = await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }, 'u-pm1')
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('insufficient')
    expect(item().currentStock).toBe(10)
    expect(ledger()).toHaveLength(2)
  })

  it('membalik barang masuk diterima bila saldo di semua titik tetap tidak negatif', async () => {
    const a = await add({ type: 'masuk', qty: 50, date: '2026-09-10' })
    await add({ type: 'keluar', qty: 20, date: '2026-09-15' }) // stok 130
    expect((await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }, 'u-pm1')).status).toBe(200)
    expect(item().currentStock).toBe(80)
  })
})

describe('konkurensi', () => {
  it('beberapa keluar bersamaan tidak pernah membuat stok negatif, dan semuanya tercatat konsisten', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => add({ type: 'keluar', qty: 30 })))
    const ok = results.filter((r) => r.status === 200).length
    const insufficient = results.filter((r) => r.status === 409 && r.body.error === 'insufficient').length
    expect(ok).toBe(3)
    expect(insufficient).toBe(1)
    expect(item()).toMatchObject({ currentStock: 10, txCount: 3 })
    expect(ledger()).toHaveLength(3)
    expect(day('2026-09-10')).toMatchObject({ out: 90 })
    expect(month()).toMatchObject({ out: 90, count: 3 })
    // urutan (seq) unik dan berurutan
    expect(ledger().map((e) => e.data.seq).sort()).toEqual([1, 2, 3])
  })

  it('keluar dan masuk bersamaan tetap konsisten antara stok, ledger, dan total', async () => {
    const reqs = [add({ type: 'masuk', qty: 10 }), add({ type: 'keluar', qty: 20 }), add({ type: 'masuk', qty: 5 }), add({ type: 'keluar', qty: 15 })]
    const res = await Promise.all(reqs)
    expect(res.every((r) => r.status === 200)).toBe(true)
    const sum = ledger().reduce((s, e) => s + Number(e.data.in) - Number(e.data.out), 100)
    expect(item().currentStock).toBe(sum)
    expect(item().currentStock).toBe(80)
    expect(month()).toMatchObject({ in: 15, out: 35, count: 4 })
  })

  it('pengaturan saldo awal yang bersaing dengan transaksi: salah satunya kalah dan data tetap konsisten', async () => {
    const [o, t] = await Promise.all([w.post('/items/set-opening', { projectId: 'p1', catalogId: 'i1', openingQty: 500, openingDate: '2026-09-01' }, 'u-own'), add({ type: 'masuk', qty: 10 })])
    // apa pun urutannya, stok = saldo awal tersimpan + total ledger
    const net = ledger().reduce((s, e) => s + Number(e.data.in) - Number(e.data.out), 0)
    expect(item().currentStock).toBe(Number(item().openingQty) + net)
    expect([o.status, t.status].some((s) => s === 200)).toBe(true)
  })

  it('setelah ada transaksi, saldo awal terkunci', async () => {
    await add()
    expect((await w.post('/items/set-opening', { projectId: 'p1', catalogId: 'i1', openingQty: 1, openingDate: '2026-09-01' }, 'u-own')).body.error).toBe('has_transactions')
  })
})

describe('lowestBalanceFrom', () => {
  const D = (date: string, net: number) => ({ date, net })
  it('saldo terendah sejak tanggal tertentu', () => {
    // stok kini 15: 10 Sep net -90, 20 Sep net +5 -> akhir 9 Sep=100, akhir 10 Sep=10, akhir 20 Sep=15
    const days = [D('2026-09-10', -90000), D('2026-09-20', 5000)]
    expect(lowestBalanceFrom(15000, days, '2026-09-05')).toBe(10000)
    expect(lowestBalanceFrom(15000, days, '2026-09-10')).toBe(10000)
    expect(lowestBalanceFrom(15000, days, '2026-09-11')).toBe(10000 + 0) // akhir 11 Sep = 10 (belum ada hari baru)
    expect(lowestBalanceFrom(15000, days, '2026-09-21')).toBe(15000)
    expect(lowestBalanceFrom(15000, [], '2026-09-21')).toBe(15000)
    expect(lowestBalanceFrom(15000, days, '2026-09-01')).toBe(10000)
  })
})

describe('lastTxDate (untuk dashboard)', () => {
  it('mengikuti tanggal pergerakan terkini; tanggal mundur tidak memundurkannya; koreksi tidak mengubahnya', async () => {
    await add({ type: 'masuk', qty: 5, date: '2026-09-10' })
    expect(item().lastTxDate).toBe('2026-09-10')
    await add({ type: 'masuk', qty: 5, date: '2026-09-20' })
    await add({ type: 'masuk', qty: 5, date: '2026-09-15' })
    expect(item().lastTxDate).toBe('2026-09-20')
    const a = await add({ type: 'masuk', qty: 1, date: '2026-09-25' })
    expect(item().lastTxDate).toBe('2026-09-25')
    await w.post('/ledger/correct', { projectId: 'p1', entryId: a.body.id, reason: 'Salah' }, 'u-pm1')
    expect(item().lastTxDate).toBe('2026-09-25')
  })
})
