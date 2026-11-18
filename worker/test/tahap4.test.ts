import { afterEach, describe, expect, it, vi } from 'vitest'
import { quantity, todayWita, isoDate } from '../src/lib/http'
import { useWorld } from './world'

const w = useWorld()
const asLog = (e: Record<string, unknown>[]) => e

describe('lingkup proyek pada akun', () => {
  it('Manajer Proyek hanya mengelola akun yang berbagi proyek dengannya', async () => {
    // log2 hanya di proyek p2; pm1 hanya di p1
    for (const [path, body] of [
      ['/users/update', { uid: 'u-logB', name: 'x' }],
      ['/users/set-disabled', { uid: 'u-logB', disabled: true }],
      ['/users/reset-password', { uid: 'u-logB', password: 'abcdef' }],
      ['/users/delete', { uid: 'u-logB' }],
    ] as const) {
      const r = await w.post(path, body, 'u-pm1')
      expect(r.status, path).toBe(403)
    }
    expect((await w.post('/users/update', { uid: 'u-log', name: 'Baru' }, 'u-pm1')).status).toBe(200)
    expect(w.be.auth.has('u-logB')).toBe(true)
  })

  it('pemegang izin projects (Owner/Direktur) mengelola akun lintas proyek', async () => {
    expect((await w.post('/users/update', { uid: 'u-logB', name: 'x' }, 'u-dir')).status).toBe(200)
    expect((await w.post('/users/reset-password', { uid: 'u-logB', password: 'abcdef' }, 'u-own')).status).toBe(200)
  })

  it('akun tanpa proyek tidak dapat dikelola Manajer Proyek', async () => {
    await w.seedUser('u-nop', 'nop', 'log', { projectIds: [] })
    expect((await w.post('/users/update', { uid: 'u-nop', name: 'x' }, 'u-pm1')).status).toBe(403)
  })

  it('membuat akun: wajib minimal satu proyek, dan hanya proyek milik pelaku', async () => {
    const base = { username: 'Baru', name: 'Baru', roleId: 'log', password: 'abcdef' }
    expect((await w.post('/users/create', { ...base }, 'u-pm1')).status).toBe(400) // tanpa proyek
    expect((await w.post('/users/create', { ...base, projectIds: [] }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/users/create', { ...base, projectIds: ['p2'] }, 'u-pm1')).status).toBe(403) // bukan proyeknya
    expect((await w.post('/users/create', { ...base, projectIds: ['p1', 'p2'] }, 'u-pm1')).status).toBe(403) // sebagian bukan
    const ok = await w.post('/users/create', { ...base, projectIds: ['p1'] }, 'u-pm1')
    expect(ok.status).toBe(200)
    expect(w.be.getData(`users/${ok.body.uid}`)!.projectIds).toEqual(['p1'])
  })

  it('Owner boleh membuat akun tanpa proyek atau dengan proyek mana pun; proyek tak dikenal/nonaktif ditolak', async () => {
    const base = { username: 'X1', name: 'X', roleId: 'log', password: 'abcdef' }
    expect((await w.post('/users/create', { ...base }, 'u-own')).status).toBe(200)
    expect((await w.post('/users/create', { ...base, username: 'X2', projectIds: ['p2'] }, 'u-own')).status).toBe(200)
    expect((await w.post('/users/create', { ...base, username: 'X3', projectIds: ['p-tidak-ada'] }, 'u-own')).body.error).toBe('unknown_project')
    expect((await w.post('/users/create', { ...base, username: 'X4', projectIds: ['p3'] }, 'u-own')).body.error).toBe('unknown_project') // nonaktif
  })

  it('mengubah proyek akun: proyek di luar lingkup pelaku tidak ikut hilang', async () => {
    w.be.getData('users/u-log')!.projectIds = ['p1', 'p2']
    // pm1 (hanya p1) mengosongkan: p2 tetap ada
    await w.post('/users/update', { uid: 'u-log', projectIds: [] }, 'u-pm1')
    expect(w.be.getData('users/u-log')!.projectIds).toEqual(['p2'])
    // setelah itu pm1 tidak lagi berbagi proyek dengan akun tersebut, sehingga tidak dapat mengelolanya
    expect((await w.post('/users/update', { uid: 'u-log', projectIds: ['p1'] }, 'u-pm1')).status).toBe(403)
    // Owner menugaskan p1 dan p2; pm1 yang berbagi p1 kembali dapat mengelola, dan tidak bisa menambah proyek bukan miliknya
    await w.post('/users/update', { uid: 'u-log', projectIds: ['p1', 'p2'] }, 'u-own')
    expect((await w.post('/users/update', { uid: 'u-log', projectIds: ['p1', 'p2'] }, 'u-pm1')).status).toBe(403) // p2 bukan proyek pm1
    expect((await w.post('/users/update', { uid: 'u-log', projectIds: ['p1'] }, 'u-pm1')).status).toBe(200)
    expect([...(w.be.getData('users/u-log')!.projectIds as string[])].sort()).toEqual(['p1', 'p2'])
    // Owner mengganti sepenuhnya
    await w.post('/users/update', { uid: 'u-log', projectIds: ['p2'] }, 'u-own')
    expect(w.be.getData('users/u-log')!.projectIds).toEqual(['p2'])
    expect(w.lastAudit('user.update')!.detail).toMatchObject({ after: { projectIds: ['p2'] } })
  })

  it('permintaan reset menyimpan proyek pemohon; eksekusi hanya oleh atasan yang berlingkup sama', async () => {
    const mk = (u: string) =>
      w.post('/auth/reset-request', { username: u, turnstileToken: 't' }, null, { ...w.env, TURNSTILE_SECRET: 's' } as never)
    await mk('log2')
    await mk('log1')
    const reqs = w.be.list('resetRequests')
    const rB = reqs.find((r) => r.data.targetUsername === 'log2')!
    const rA = reqs.find((r) => r.data.targetUsername === 'log1')!
    expect(rB.data.targetProjectIds).toEqual(['p2'])
    expect((await w.post('/resets/execute', { id: rB.id, password: 'abcdef' }, 'u-pm1')).status).toBe(403) // p2 bukan proyek pm1
    expect((await w.post('/resets/execute', { id: rA.id, password: 'abcdef' }, 'u-pm1')).status).toBe(200)
    expect((await w.post('/resets/execute', { id: rB.id, password: 'abcdef' }, 'u-dir')).status).toBe(200)
  })
})

describe('perusahaan dan proyek', () => {
  it('hanya pemegang izin projects; nama perusahaan unik; jenis valid', async () => {
    expect((await w.post('/companies/create', { name: 'Anak A', type: 'anak' }, 'u-pm1')).status).toBe(403)
    const ok = await w.post('/companies/create', { name: 'Anak A', type: 'anak' }, 'u-own')
    expect(ok.status).toBe(200)
    expect(w.be.getData(`companies/${ok.body.id}`)).toMatchObject({ name: 'Anak A', type: 'anak', active: true })
    expect(w.lastAudit('company.create')).toMatchObject({ actorUid: 'u-own' })
    expect((await w.post('/companies/create', { name: '  anak a ', type: 'anak' }, 'u-own')).status).toBe(409)
    expect((await w.post('/companies/create', { name: 'Z', type: 'cabang' }, 'u-own')).status).toBe(400)
  })

  it('perusahaan dengan proyek aktif tidak dapat dinonaktifkan', async () => {
    expect((await w.post('/companies/update', { id: 'c1', active: false }, 'u-own')).body.error).toBe('in_use')
    await w.post('/projects/update', { id: 'p1', active: false }, 'u-own')
    await w.post('/projects/update', { id: 'p2', active: false }, 'u-own')
    expect((await w.post('/companies/update', { id: 'c1', active: false }, 'u-own')).status).toBe(200)
  })

  it('proyek: perusahaan harus aktif, nama unik per perusahaan, status dan tanggal valid', async () => {
    const base = { companyId: 'c1', name: 'Jalan Baru', location: 'Maros', status: 'berjalan', startDate: '2026-09-01' }
    expect((await w.post('/projects/create', base, 'u-pm1')).status).toBe(403)
    const ok = await w.post('/projects/create', base, 'u-dir')
    expect(ok.status).toBe(200)
    expect(w.be.getData(`projects/${ok.body.id}`)).toMatchObject({ companyId: 'c1', name: 'Jalan Baru', status: 'berjalan', active: true })
    expect((await w.post('/projects/create', { ...base, name: 'JALAN baru' }, 'u-dir')).status).toBe(409)
    expect((await w.post('/projects/create', { ...base, name: 'B', companyId: 'tidak-ada' }, 'u-dir')).body.error).toBe('unknown_company')
    expect((await w.post('/projects/create', { ...base, name: 'C', status: 'batal' }, 'u-dir')).status).toBe(400)
    expect((await w.post('/projects/create', { ...base, name: 'D', startDate: '2026-02-30' }, 'u-dir')).status).toBe(400)
    expect((await w.post('/projects/update', { id: ok.body.id, status: 'selesai', location: 'Pangkep' }, 'u-dir')).status).toBe(200)
    expect(w.lastAudit('project.update')!.detail).toMatchObject({ before: { status: 'berjalan' }, after: { status: 'selesai' } })
  })
})

describe('katalog barang', () => {
  const item = { name: 'Semen Portland', unit: 'Sak 50 kg', category: 'Bahan', minStock: 100 }

  it('izin catalog; nama unik tanpa membedakan huruf besar/kecil dan spasi tepi', async () => {
    expect((await w.post('/catalog/create', item, 'u-pm1')).status).toBe(403)
    const ok = await w.post('/catalog/create', item, 'u-own')
    expect(ok.status).toBe(200)
    expect(w.be.getData(`catalog/${ok.body.id}`)).toMatchObject({ name: 'Semen Portland', unit: 'Sak 50 kg', active: true, projectCount: 0 })
    expect((await w.post('/catalog/create', { ...item, name: '  semen PORTLAND ' }, 'u-own')).body.error).toBe('name_taken')
    expect(w.be.list('catalog')).toHaveLength(1)
  })

  it('mengganti nama menukar penjaga keunikan secara atomik', async () => {
    const a = await w.post('/catalog/create', item, 'u-own')
    const b = await w.post('/catalog/create', { ...item, name: 'Pasir' }, 'u-own')
    expect((await w.post('/catalog/update', { id: b.body.id, name: 'semen portland' }, 'u-own')).body.error).toBe('name_taken')
    expect(w.be.getData(`catalog/${b.body.id}`)!.name).toBe('Pasir') // tidak berubah sama sekali
    expect((await w.post('/catalog/update', { id: a.body.id, name: 'Semen Tiga Roda' }, 'u-own')).status).toBe(200)
    expect((await w.post('/catalog/create', { ...item, name: 'Semen Portland' }, 'u-own')).status).toBe(200) // nama lama kini bebas
  })

  it('batas minimum: tidak negatif, bukan NaN/teks, maksimal 3 desimal', async () => {
    for (const bad of [-1, 'abc', null, 1.2345, 2e9]) expect((await w.post('/catalog/create', { ...item, name: `n${String(bad)}`, minStock: bad }, 'u-own')).status).toBe(400)
    expect((await w.post('/catalog/create', { ...item, name: 'ok', minStock: 12.345 }, 'u-own')).status).toBe(200)
  })

  it('barang yang sudah dipakai proyek tidak dapat dinonaktifkan atau diubah satuannya', async () => {
    const a = await w.post('/catalog/create', item, 'u-own')
    await w.post('/items/add', { projectId: 'p1', catalogId: a.body.id }, 'u-pm1')
    expect((await w.post('/catalog/update', { id: a.body.id, active: false }, 'u-own')).body.error).toBe('in_use')
    expect((await w.post('/catalog/update', { id: a.body.id, unit: 'Kg' }, 'u-own')).body.error).toBe('in_use')
    expect((await w.post('/catalog/update', { id: a.body.id, category: 'Baru', minStock: 5 }, 'u-own')).status).toBe(200)
    const unused = await w.post('/catalog/create', { ...item, name: 'Lain' }, 'u-own')
    expect((await w.post('/catalog/update', { id: unused.body.id, active: false }, 'u-own')).status).toBe(200)
  })
})

describe('barang proyek dan saldo awal', () => {
  const setup = async () => {
    const a = await w.post('/catalog/create', { name: 'Semen', unit: 'Sak', minStock: 50 }, 'u-own')
    return a.body.id as string
  }

  it('Admin Logistik yang ditugaskan dapat menambah barang; di proyek lain tidak', async () => {
    const id = await setup()
    expect((await w.post('/items/add', { projectId: 'p2', catalogId: id }, 'u-log')).status).toBe(403)
    const ok = await w.post('/items/add', { projectId: 'p1', catalogId: id, openingQty: 120.5, openingDate: '2026-09-01' }, 'u-log')
    expect(ok.status).toBe(200)
    expect(w.be.getData(`projects/p1/items/${id}`)).toMatchObject({ catalogId: id, openingQty: 120.5, openingDate: '2026-09-01', currentStock: 120.5, txCount: 0, minStock: 50, active: true })
    expect(w.be.getData(`catalog/${id}`)!.projectCount).toBe(1)
    expect(w.lastAudit('item.add')).toMatchObject({ actorUid: 'u-log' })
  })

  it('barang boleh ditambah tanpa saldo awal (ditandai belum ada); duplikat ditolak', async () => {
    const id = await setup()
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: id }, 'u-pm1')).status).toBe(200)
    expect(w.be.getData(`projects/p1/items/${id}`)).toMatchObject({ openingQty: null, openingDate: null, currentStock: null })
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: id }, 'u-pm1')).body.error).toBe('item_exists')
  })

  it('validasi saldo awal: pasangan jumlah+tanggal, tidak negatif, 3 desimal, bukan masa depan WITA', async () => {
    const id = await setup()
    const add = (extra: Record<string, unknown>) => w.post('/items/add', { projectId: 'p1', catalogId: id, ...extra }, 'u-own')
    expect((await add({ openingQty: 10 })).status).toBe(400) // tanpa tanggal
    expect((await add({ openingDate: '2026-09-01' })).status).toBe(400) // tanpa jumlah
    expect((await add({ openingQty: -5, openingDate: '2026-09-01' })).status).toBe(400)
    expect((await add({ openingQty: 1.2345, openingDate: '2026-09-01' })).status).toBe(400)
    expect((await add({ openingQty: '10', openingDate: '2026-09-01' })).status).toBe(400)
    expect((await add({ openingQty: 10, openingDate: '01-09-2026' })).status).toBe(400)
    expect((await add({ openingQty: 10, openingDate: '2999-01-01' })).status).toBe(400) // masa depan
    expect((await add({ openingQty: 0, openingDate: '2026-09-01' })).status).toBe(200) // nol sah
  })

  it('proyek nonaktif, proyek/barang tidak ada, dan barang katalog nonaktif ditolak', async () => {
    const id = await setup()
    expect((await w.post('/items/add', { projectId: 'p3', catalogId: id }, 'u-own')).status).toBe(400) // nonaktif
    expect((await w.post('/items/add', { projectId: 'p-x', catalogId: id }, 'u-own')).status).toBe(404)
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: 'i-x' }, 'u-own')).body.error).toBe('unknown_item')
    await w.post('/catalog/update', { id, active: false }, 'u-own')
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: id }, 'u-own')).body.error).toBe('unknown_item')
  })

  it('saldo awal dapat diatur selama belum ada transaksi; setelah ada transaksi dikunci', async () => {
    const id = await setup()
    await w.post('/items/add', { projectId: 'p1', catalogId: id }, 'u-pm1')
    const r = await w.post('/items/set-opening', { projectId: 'p1', catalogId: id, openingQty: 80, openingDate: '2026-09-01' }, 'u-log')
    expect(r.status).toBe(200)
    expect(w.be.getData(`projects/p1/items/${id}`)).toMatchObject({ openingQty: 80, currentStock: 80 })
    expect(w.lastAudit('item.set_opening')!.detail).toMatchObject({ before: { saldo: null }, after: { saldo: 80, tanggal: '2026-09-01' } })
    // simulasi transaksi pertama (Tahap 5 akan menaikkan txCount)
    w.be.getData(`projects/p1/items/${id}`)!.txCount = 1
    expect((await w.post('/items/set-opening', { projectId: 'p1', catalogId: id, openingQty: 99, openingDate: '2026-09-02' }, 'u-log')).body.error).toBe('has_transactions')
    expect(w.be.getData(`projects/p1/items/${id}`)!.openingQty).toBe(80)
  })

  it('mengubah batas minimum dan menonaktifkan barang proyek; role tanpa wewenang ditolak', async () => {
    const id = await setup()
    await w.post('/items/add', { projectId: 'p1', catalogId: id }, 'u-pm1')
    expect((await w.post('/items/update', { projectId: 'p1', catalogId: id, minStock: 70, active: false }, 'u-pm1')).status).toBe(200)
    expect(w.be.getData(`projects/p1/items/${id}`)).toMatchObject({ minStock: 70, active: false })
    expect((await w.post('/items/update', { projectId: 'p1', catalogId: id, minStock: -1 }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/items/update', { projectId: 'p1', catalogId: id, minStock: 5 }, 'u-pm2')).status).toBe(403) // pm2 di p2
  })
})

describe('utilitas', () => {
  afterEach(() => vi.useRealTimers())

  it('todayWita memakai UTC+8, bukan tanggal UTC', () => {
    expect(todayWita(new Date('2026-11-17T15:59:59Z'))).toBe('2026-11-17')
    expect(todayWita(new Date('2026-11-17T16:00:00Z'))).toBe('2026-11-18') // 00:00 WITA
    expect(todayWita(new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-18')
  })

  it('tanggal "hari ini" menurut WITA diterima pada pukul 00:00-08:00 WITA (UTC masih kemarin)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T18:00:00Z')) // 02:00 WITA 18 Nov
    const id = (await w.post('/catalog/create', { name: 'Semen', unit: 'Sak' }, 'u-own')).body.id
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: id, openingQty: 1, openingDate: '2026-11-18' }, 'u-own')).status).toBe(200)
    const id2 = (await w.post('/catalog/create', { name: 'Pasir', unit: 'm3' }, 'u-own')).body.id
    expect((await w.post('/items/add', { projectId: 'p1', catalogId: id2, openingQty: 1, openingDate: '2026-11-19' }, 'u-own')).status).toBe(400)
  })

  it('quantity dan isoDate', () => {
    expect(quantity({ q: 1.5 }, 'q')).toBe(1.5)
    expect(() => quantity({ q: NaN }, 'q')).toThrow()
    expect(() => quantity({ q: Infinity }, 'q')).toThrow()
    expect(isoDate({ d: '2026-02-28' }, 'd')).toBe('2026-02-28')
    expect(() => isoDate({ d: '2026-13-01' }, 'd')).toThrow()
    expect(asLog([])).toEqual([])
  })
})
