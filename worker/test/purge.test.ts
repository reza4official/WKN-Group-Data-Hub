import { describe, expect, it } from 'vitest'
import { useWorld } from './world'

const w = useWorld()
let n = 0
const rid = () => `pg-${++n}-${Math.random().toString(36).slice(2, 10)}`
const has = (path: string) => w.be.docs.has(path)
const under = (prefix: string) => [...w.be.docs.keys()].filter((k) => k.startsWith(prefix))

/** Proyek uji lewat API biasa: perusahaan, proyek, katalog, barang bersaldo awal, beberapa transaksi, dan penugasan akun. */
async function setup(opts: { company?: string; project: string; items?: string[] }) {
  const company = opts.company ?? 'c1'
  const p = await w.post('/projects/create', { companyId: company, name: opts.project }, 'u-own')
  const pid = String(p.body.id)
  const catIds: string[] = []
  for (const nm of opts.items ?? ['Semen', 'Pasir']) {
    const c = await w.post('/catalog/create', { name: `${nm} ${pid}`, unit: 'Sak', minStock: 1 }, 'u-own')
    catIds.push(String(c.body.id))
    await w.post('/items/add', { projectId: pid, catalogId: c.body.id, openingQty: 100, openingDate: '2026-09-01' }, 'u-own')
    await w.post('/ledger/add', { projectId: pid, itemId: c.body.id, type: 'masuk', qty: 10, date: '2026-09-10', requestId: rid() }, 'u-own')
    await w.post('/ledger/add', { projectId: pid, itemId: c.body.id, type: 'keluar', qty: 5, date: '2026-10-02', requestId: rid() }, 'u-own')
  }
  return { pid, catIds }
}
const del = (pid: string, name: string, as = 'u-own', over: Record<string, unknown> = {}) => w.post('/projects/delete', { id: pid, confirmName: name, ...over }, as)
const purge = (r: { body: Record<string, unknown> }) => r.body.purge as { done: boolean; phase: string; deleted: number }

describe('hapus proyek', () => {
  it('menghapus proyek beserta barang, transaksi, total harian/bulanan; membersihkan penugasan akun dan penghitung katalog; proyek lain utuh', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    const b = await setup({ project: 'Proyek Uji B' })
    await w.post('/users/update', { uid: 'u-pm1', projectIds: ['p1', a.pid] }, 'u-own')
    expect(w.be.getData(`catalog/${a.catIds[0]}`)!.projectCount).toBe(1)

    const r = await del(a.pid, 'Proyek Uji A')
    expect(r.status).toBe(200)
    expect(purge(r)).toMatchObject({ done: true, phase: 'selesai' })
    expect(has(`projects/${a.pid}`)).toBe(false)
    expect(under(`projects/${a.pid}/`)).toEqual([]) // tidak ada dokumen yatim di bawahnya
    expect(w.be.getData('users/u-pm1')!.projectIds).toEqual(['p1'])
    expect(w.be.getData(`catalog/${a.catIds[0]}`)!.projectCount).toBe(0)
    expect(has(`catalog/${a.catIds[0]}`)).toBe(true) // katalog tidak ikut terhapus
    // proyek lain dan data lain utuh
    expect(has(`projects/${b.pid}`)).toBe(true)
    expect(under(`projects/${b.pid}/`).length).toBeGreaterThan(6)
    expect(w.be.getData(`catalog/${b.catIds[0]}`)!.projectCount).toBe(1)
    expect(has('projects/p1')).toBe(true)
    // audit: mulai, pembersihan, selesai (dengan total)
    const actions = w.audits().map((x) => x.action)
    expect(actions).toContain('project.delete_start')
    expect(actions).toContain('project.purge')
    const fin = w.lastAudit('project.delete')!
    expect(fin).toMatchObject({ actorUid: 'u-own', targetId: a.pid })
    expect((fin.detail as Record<string, number>).totalDokumenDihapus).toBeGreaterThan(8)
  })

  it('nama konfirmasi wajib dan harus persis sama (setelah dipangkas); tanpa konfirmasi tidak ada yang berubah', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    const before = [...w.be.docs.keys()].length
    for (const bad of [undefined, '', '   ', 'proyek uji a', 'Proyek Uji', 123]) {
      const r = await w.post('/projects/delete', { id: a.pid, ...(bad === undefined ? {} : { confirmName: bad }) }, 'u-own')
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('confirm_mismatch')
    }
    expect([...w.be.docs.keys()].length).toBe(before)
    expect(w.be.getData(`projects/${a.pid}`)!.deleting).toBeUndefined()
    expect((await del(a.pid, '  Proyek Uji A  ')).status).toBe(200) // spasi tepi dipangkas
  })

  it('hanya Owner dan Developer (level >= 90) dengan izin projects; Direktur, Manajer, Admin Logistik, dan tanpa masuk ditolak', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    for (const who of ['u-dir', 'u-pm1', 'u-log']) {
      const r = await del(a.pid, 'Proyek Uji A', who)
      expect(r.status, who).toBe(403)
    }
    expect((await w.post('/projects/delete', { id: a.pid, confirmName: 'Proyek Uji A' })).status).toBe(401)
    expect(has(`projects/${a.pid}`)).toBe(true)
    expect(w.be.getData(`projects/${a.pid}`)!.deleting).toBeUndefined()
    expect((await del(a.pid, 'Proyek Uji A', 'u-dev')).status).toBe(200)
  })

  it('proyek tidak ada: 404; sudah terhapus: 404', async () => {
    expect((await del('tidak-ada', 'x')).status).toBe(404)
    const a = await setup({ project: 'Proyek Uji A' })
    await del(a.pid, 'Proyek Uji A')
    expect((await del(a.pid, 'Proyek Uji A')).status).toBe(404)
  })

  it('selama dihapus proyek tidak bisa diaktifkan, diubah, atau menerima barang dan transaksi (tidak ada lubang aktivasi ulang)', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    const big = await setup({ project: 'Proyek Besar', items: ['A'] })
    for (let i = 0; i < 9000; i++) w.be.seedDoc(`projects/${big.pid}/ledger/x${String(i).padStart(5, '0')}`, { itemId: big.catIds[0], date: '2026-09-10', type: 'masuk', in: 1, out: 0, seq: i + 100 })
    const first = await del(big.pid, 'Proyek Besar')
    expect(purge(first).done).toBe(false)
    expect(w.be.getData(`projects/${big.pid}`)).toMatchObject({ deleting: true, active: false })
    expect((await w.post('/projects/update', { id: big.pid, active: true }, 'u-own')).body.error).toBe('deleting')
    expect((await w.post('/projects/update', { id: big.pid, name: 'Baru' }, 'u-own')).status).toBe(409)
    expect((await w.post('/ledger/add', { projectId: big.pid, itemId: big.catIds[0], type: 'masuk', qty: 1, date: '2026-10-05', requestId: rid() }, 'u-own')).body.error).toBe('inactive')
    expect((await w.post('/items/add', { projectId: big.pid, catalogId: big.catIds[0], openingQty: 1, openingDate: '2026-09-01' }, 'u-own')).status).toBe(400)
    expect((await w.post('/ledger/import', { projectId: big.pid, importId: rid(), rows: [{ itemId: big.catIds[0], type: 'masuk', qty: 1, date: '2026-10-05' }] }, 'u-own')).status).toBe(409)
  })

  it('proyek besar: beberapa putaran, tiap putaran < 50 sub-permintaan dan < 500 penulisan per commit; total tercatat; tanpa yatim', async () => {
    const big = await setup({ project: 'Proyek Besar', items: ['A', 'B', 'C'] })
    for (let i = 0; i < 1300; i++) w.be.seedDoc(`projects/${big.pid}/ledger/x${String(i).padStart(5, '0')}`, { itemId: big.catIds[0], date: '2026-09-10', type: 'masuk', in: 1, out: 0, seq: i + 100 })
    for (let i = 0; i < 600; i++) w.be.seedDoc(`projects/${big.pid}/items/${big.catIds[1]}/days/d${String(i).padStart(4, '0')}`, { date: `d${i}`, in: 1, out: 0 })
    const total = under(`projects/${big.pid}/`).length + 1
    let rounds = 0
    let last = { done: false, phase: '', deleted: 0 }
    let deleted = 0
    while (!last.done && rounds < 40) {
      const c0 = w.be.calls.length
      const r = await del(big.pid, 'Proyek Besar')
      expect(r.status).toBe(200)
      expect(w.be.calls.length - c0).toBeLessThan(50)
      last = purge(r)
      deleted += last.deleted
      rounds++
    }
    expect(last.done).toBe(true)
    expect(rounds).toBeGreaterThan(1)
    expect(under(`projects/${big.pid}`)).toEqual([])
    expect(deleted).toBe(total)
    expect((w.lastAudit('project.delete')!.detail as Record<string, number>).totalDokumenDihapus).toBe(total)
    for (const c of big.catIds) expect(w.be.getData(`catalog/${c}`)!.projectCount).toBe(0)
  })

  it('terputus di tengah jalan lalu diulang: selesai tanpa dokumen yatim dan tanpa mengurangi penghitung katalog dua kali', async () => {
    const a = await setup({ project: 'Proyek Uji A', items: ['A', 'B'] })
    const other = await setup({ project: 'Proyek Lain', items: ['Z'] })
    void other
    // gagalkan commit ke-4 (di tengah penghapusan barang)
    const stopAt = w.be.commitCount + 4
    w.be.onCommit = (k) => {
      if (k === stopAt) throw new Error('koneksi putus')
    }
    const r1 = await del(a.pid, 'Proyek Uji A')
    expect(r1.status).toBe(500)
    w.be.onCommit = undefined
    let r = await del(a.pid, 'Proyek Uji A')
    for (let i = 0; i < 5 && !purge(r).done; i++) r = await del(a.pid, 'Proyek Uji A')
    expect(purge(r).done).toBe(true)
    expect(under(`projects/${a.pid}`)).toEqual([])
    for (const c of a.catIds) expect(w.be.getData(`catalog/${c}`)!.projectCount).toBe(0) // tidak negatif, tidak ganda
  })

  it('kuota hapus harian habis (429): pesan jelas, dapat dilanjutkan', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    w.be.commitStatus = 429
    const r = await del(a.pid, 'Proyek Uji A')
    expect(r.status).toBe(429)
    expect(r.body.error).toBe('quota_exhausted')
    expect(String(r.body.message)).toContain('besok')
    w.be.commitStatus = undefined
    expect(purge(await del(a.pid, 'Proyek Uji A')).done).toBe(true)
  })

  it('pratinjau: jumlah barang, transaksi, akun, perkiraan dokumen; tanpa menghapus apa pun', async () => {
    const a = await setup({ project: 'Proyek Uji A' })
    await w.post('/users/update', { uid: 'u-pm1', projectIds: ['p1', a.pid] }, 'u-own')
    const before = [...w.be.docs.keys()].length
    const r = await w.post('/projects/delete-preview', { id: a.pid }, 'u-own')
    expect(r.body.preview).toMatchObject({ name: 'Proyek Uji A', projects: 1, items: 2, transactions: 4, users: 1, deleting: false, overDailyLimit: false })
    expect((r.body.preview as { estimatedDocs: number }).estimatedDocs).toBeGreaterThan(10)
    expect([...w.be.docs.keys()].length).toBe(before)
    expect((await w.post('/projects/delete-preview', { id: a.pid }, 'u-dir')).status).toBe(403)
    w.be.getData(`projects/${a.pid}/items/${a.catIds[0]}`)!.txCount = 30_000
    expect(((await w.post('/projects/delete-preview', { id: a.pid }, 'u-own')).body.preview as { overDailyLimit: boolean }).overDailyLimit).toBe(true)
  })
})

describe('hapus perusahaan (bertingkat)', () => {
  it('menghapus perusahaan beserta SEMUA proyeknya dan bersih-bersih akun; perusahaan lain utuh', async () => {
    w.be.seedDoc('companies/c2', { name: 'PT. Anak Uji', type: 'anak', active: true })
    w.be.seedDoc('companies/c3', { name: 'PT. Tetap', type: 'anak', active: true })
    const a = await setup({ company: 'c2', project: 'Anak A' })
    const b = await setup({ company: 'c2', project: 'Anak B', items: ['X'] })
    const keep = await setup({ company: 'c3', project: 'Tetap A' })
    await w.post('/users/update', { uid: 'u-pm1', projectIds: ['p1', a.pid, b.pid] }, 'u-own')
    w.be.getData('users/u-pm1')!.companyIds = ['c2', 'c3']
    let r = await w.post('/companies/delete', { id: 'c2', confirmName: 'PT. Anak Uji' }, 'u-own')
    for (let i = 0; i < 10 && !purge(r).done; i++) r = await w.post('/companies/delete', { id: 'c2', confirmName: 'PT. Anak Uji' }, 'u-own')
    expect(purge(r).done).toBe(true)
    expect(has('companies/c2')).toBe(false)
    expect(has(`projects/${a.pid}`) || has(`projects/${b.pid}`)).toBe(false)
    expect(under(`projects/${a.pid}`).concat(under(`projects/${b.pid}`))).toEqual([])
    expect(w.be.getData('users/u-pm1')).toMatchObject({ projectIds: ['p1'], companyIds: ['c3'] })
    expect(has('companies/c3')).toBe(true)
    expect(has(`projects/${keep.pid}`)).toBe(true)
    expect(under(`projects/${keep.pid}/`).length).toBeGreaterThan(5)
    expect(w.lastAudit('company.delete')).toMatchObject({ targetId: 'c2' })
  })

  it('konfirmasi, wewenang, dan proyek baru di perusahaan yang sedang dihapus', async () => {
    w.be.seedDoc('companies/c2', { name: 'PT. Anak Uji', type: 'anak', active: true })
    for (let k = 0; k < 6; k++) await setup({ company: 'c2', project: `Anak ${k}`, items: ['Q'] })
    expect((await w.post('/companies/delete', { id: 'c2', confirmName: 'salah' }, 'u-own')).body.error).toBe('confirm_mismatch')
    expect((await w.post('/companies/delete', { id: 'c2', confirmName: 'PT. Anak Uji' }, 'u-dir')).status).toBe(403)
    const first = await w.post('/companies/delete', { id: 'c2', confirmName: 'PT. Anak Uji' }, 'u-own')
    expect(first.status).toBe(200)
    if (!purge(first).done) {
      expect((await w.post('/projects/create', { companyId: 'c2', name: 'Sisipan' }, 'u-own')).status).toBe(400) // perusahaan nonaktif
      expect((await w.post('/companies/update', { id: 'c2', active: true }, 'u-own')).body.error).toBe('deleting')
    }
  })

  it('pratinjau perusahaan menjumlah semua proyeknya; tiap putaran < 50 sub-permintaan', async () => {
    w.be.seedDoc('companies/c2', { name: 'PT. Anak Uji', type: 'anak', active: true })
    await setup({ company: 'c2', project: 'Anak A' })
    await setup({ company: 'c2', project: 'Anak B' })
    const r = await w.post('/companies/delete-preview', { id: 'c2' }, 'u-own')
    expect(r.body.preview).toMatchObject({ name: 'PT. Anak Uji', projects: 2, items: 4, transactions: 8 })
    const c0 = w.be.calls.length
    await w.post('/companies/delete', { id: 'c2', confirmName: 'PT. Anak Uji' }, 'u-own')
    expect(w.be.calls.length - c0).toBeLessThan(50)
  })
})

describe('hapus barang katalog', () => {
  it('hanya bila tidak dipakai proyek; penjaga nama ikut terhapus sehingga nama dapat dipakai lagi', async () => {
    const c = await w.post('/catalog/create', { name: 'Barang Uji', unit: 'Sak' }, 'u-own')
    const id = String(c.body.id)
    await w.post('/projects/create', { companyId: 'c1', name: 'PX' }, 'u-own')
    await w.post('/items/add', { projectId: 'p1', catalogId: id, openingQty: 1, openingDate: '2026-09-01' }, 'u-own')
    const used = await w.post('/catalog/delete', { id }, 'u-own')
    expect(used.status).toBe(409)
    expect(used.body.error).toBe('in_use')
    expect(has(`catalog/${id}`)).toBe(true)
    await del('p1', 'Proyek 1') // menghapus proyek memakai pembersihan penghitung
    expect(w.be.getData(`catalog/${id}`)!.projectCount).toBe(0)
    expect((await w.post('/catalog/delete', { id }, 'u-pm1')).status).toBe(403)
    expect((await w.post('/catalog/delete', { id }, 'u-dir')).status).toBe(200) // Direktur punya izin katalog
    expect(has(`catalog/${id}`)).toBe(false)
    expect(w.be.list('catalogNames')).toHaveLength(0)
    expect((await w.post('/catalog/create', { name: 'Barang Uji', unit: 'Kg' }, 'u-own')).status).toBe(200) // nama bebas lagi
    expect(w.lastAudit('catalog.delete')).toMatchObject({ actorUid: 'u-dir' })
    expect((await w.post('/catalog/delete', { id: 'tidak-ada' }, 'u-own')).status).toBe(404)
  })
})
