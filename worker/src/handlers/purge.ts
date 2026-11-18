import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { batchGetDocuments, commit, CommitError, getDocument, queryDocuments, type Doc, type Write } from '../lib/firestore'
import { HttpError, str, type Body } from '../lib/http'
import type { ServiceAccount } from '../lib/serviceAccount'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/**
 * Penghapusan permanen proyek, perusahaan (beserta seluruh proyeknya), dan barang katalog yang tidak terpakai,
 * untuk membersihkan data uji. Tidak dapat dibatalkan; cadangan Sheets tidak ikut terhapus (lihat docs/RUNBOOK.md).
 *
 * Dirancang resumable di bawah batas Workers paket gratis (50 sub-permintaan per pemanggilan, 500 penulisan per commit):
 * satu pemanggilan menghapus sebanyak anggaran mengizinkan lalu mengembalikan `done: false`; klien mengulang sampai selesai.
 * Setiap commit membawa satu catatan audit (invarian "setiap tulis ada audit"), dan dokumen induk dihapus TERAKHIR.
 */
const BUDGET = 36
const CHUNK = 440
const MIN_MAX_LEVEL = 90
/** Perkiraan batas hapus harian Firestore Spark. */
export const DAILY_DELETE_LIMIT = 20_000

class Meter {
  used = 0
  constructor(readonly budget = BUDGET) {}
  /** Masih cukup anggaran untuk satu langkah yang butuh `n` sub-permintaan. */
  has(n: number): boolean {
    return this.used + n <= this.budget
  }
}

export function assertDeleter(a: Actor): void {
  requirePerm(a, 'projects')
  if (a.level < MIN_MAX_LEVEL) throw new HttpError(403, 'forbidden', 'Hanya Owner dan Developer yang dapat menghapus proyek atau perusahaan.')
}

function confirm(body: Body, expected: string): void {
  const given = typeof body.confirmName === 'string' ? body.confirmName.trim() : ''
  if (!given || given !== expected.trim()) throw new HttpError(400, 'confirm_mismatch', 'Nama konfirmasi tidak sama dengan nama yang akan dihapus.')
}

async function send(c: Ctx, writes: Write[], m: Meter): Promise<void> {
  m.used++
  try {
    await commit(c.env, c.sa, writes)
  } catch (e) {
    if (e instanceof CommitError) {
      if (e.status === 429) throw new HttpError(429, 'quota_exhausted', 'Kuota hapus harian Firestore habis. Penghapusan dapat dilanjutkan besok (data yang sudah terhapus tetap terhapus).')
      if (e.conflict) throw new HttpError(409, 'busy', 'Data sedang diubah pengguna lain. Ulangi.')
    }
    throw e
  }
}
const q = (c: Ctx, m: Meter, col: string, filters: Parameters<typeof queryDocuments>[3], limit: number, parent = '') => {
  m.used++
  return queryDocuments(c.env, c.sa, col, filters, limit, parent)
}
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const pre = (d: Doc) => (d.updateTime ? { updateTime: d.updateTime } : { exists: true })

interface Totals {
  docs: number
}

type Phase = 'transaksi' | 'barang' | 'akun' | 'selesai'

/**
 * Satu putaran penghapusan sebuah proyek. Mengembalikan fase terakhir yang dicapai; 'selesai' berarti dokumen proyek
 * sudah terhapus. Idempoten: dapat diulang kapan pun setelah terputus.
 */
async function purgeProject(c: Ctx, m: Meter, pid: string, project: Doc, t: Totals, label: string, companyName: string): Promise<Phase> {
  const target = { type: 'project' as const, id: pid, label }
  const base = num(project.data.purgeDocs)
  const progress = (): Write => ({ path: `projects/${pid}`, data: { purgeDocs: base + t.docs }, mask: ['purgeDocs'], precondition: { exists: true } })

  // 1. Transaksi
  while (m.has(3)) {
    const led = await q(c, m, 'ledger', [], CHUNK, `projects/${pid}`)
    if (led.length === 0) break
    t.docs += led.length
    await send(c, [...led.map((d): Write => ({ path: `projects/${pid}/ledger/${d.id}`, delete: true })), progress(), auditWrite(c.actor, 'project.purge', target, { fase: 'transaksi', dihapus: led.length })], m)
    if (led.length < CHUNK) continue
  }
  if (!m.has(3)) {
    const more = await q(c, m, 'ledger', [], 1, `projects/${pid}`).catch(() => [])
    if (more.length > 0) return 'transaksi'
  }
  // 2. Barang (beserta total harian dan bulanan); penghitung pemakaian katalog dikurangi dalam commit yang sama
  while (m.has(5)) {
    const items = await q(c, m, 'items', [], 5, `projects/${pid}`)
    if (items.length === 0) break
    for (const it of items) {
      if (!m.has(5)) return 'barang'
      const path = `projects/${pid}/items/${it.id}`
      const [days, months] = await Promise.all([q(c, m, 'days', [], CHUNK, path), q(c, m, 'months', [], CHUNK, path)])
      const room = CHUNK - days.length
      const takeMonths = months.slice(0, Math.max(0, room))
      const itemDone = days.length < CHUNK && months.length <= room
      const writes: Write[] = [
        ...days.map((d): Write => ({ path: `${path}/days/${d.id}`, delete: true })),
        ...takeMonths.map((d): Write => ({ path: `${path}/months/${d.id}`, delete: true })),
      ]
      let removed = days.length + takeMonths.length
      if (itemDone) {
        m.used++
        const cat = (await batchGetDocuments(c.env, c.sa, [`catalog/${it.id}`])).get(`catalog/${it.id}`)
        writes.push({ path, delete: true, precondition: { exists: true } })
        if (cat) writes.push({ path: `catalog/${it.id}`, data: { projectCount: Math.max(0, num(cat.data.projectCount) - 1) }, mask: ['projectCount'], precondition: pre(cat) })
        removed += 1
      }
      t.docs += removed
      writes.push(progress(), auditWrite(c.actor, 'project.purge', target, { fase: 'barang', barang: it.id, dihapus: removed }))
      await send(c, writes, m)
      if (!itemDone) return 'barang' // sisa total harian/bulanan barang ini dilanjutkan di putaran berikutnya
    }
  }
  if (!m.has(4)) return 'barang'
  const left = await q(c, m, 'items', [], 1, `projects/${pid}`)
  if (left.length > 0) return 'barang'

  // 3. Akun yang ditugaskan, lalu dokumen proyek terakhir (atomik bersama audit akhir)
  const users = await q(c, m, 'users', [{ field: 'projectIds', op: 'ARRAY_CONTAINS', value: pid }], CHUNK)
  const writes: Write[] = users.map((u): Write => ({ path: `users/${u.id}`, data: { projectIds: arr(u.data.projectIds).filter((x) => x !== pid) }, mask: ['projectIds', 'updatedAt'], precondition: pre(u), serverTime: ['updatedAt'] }))
  t.docs += users.length
  if (users.length >= CHUNK) {
    await send(c, [...writes, progress(), auditWrite(c.actor, 'project.purge', target, { fase: 'akun', akun: users.length })], m)
    return 'akun'
  }
  t.docs += 1
  await send(
    c,
    [...writes, { path: `projects/${pid}`, delete: true, precondition: { exists: true } }, auditWrite(c.actor, 'project.delete', target, { perusahaan: companyName, totalDokumenDihapus: base + t.docs, akunDiperbarui: users.length })],
    m,
  )
  return 'selesai'
}

async function markDeleting(c: Ctx, kind: 'project' | 'company', id: string, doc: Doc, label: string, m: Meter): Promise<void> {
  if (doc.data.deleting === true) return
  const path = kind === 'project' ? `projects/${id}` : `companies/${id}`
  await send(c, [{ path, data: { deleting: true, active: false, deleteStartedBy: c.actor.uid, deleteStartedByName: c.actor.name, purgeDocs: 0 }, mask: ['deleting', 'active', 'deleteStartedBy', 'deleteStartedByName', 'purgeDocs', 'deleteStartedAt'], precondition: pre(doc), serverTime: ['deleteStartedAt'] }, auditWrite(c.actor, `${kind}.delete_start`, { type: kind, id, label }, {})], m)
}

export interface PurgeResult {
  done: boolean
  phase: Phase | 'proyek'
  deleted: number
}

export async function deleteProject(c: Ctx, body: Body): Promise<PurgeResult> {
  assertDeleter(c.actor)
  const pid = str(body, 'id', { label: 'Proyek' })
  const m = new Meter()
  m.used++
  const project = await getDocument(c.env, c.sa, `projects/${pid}`)
  if (!project) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan (mungkin sudah terhapus).')
  const name = String(project.data.name ?? '')
  confirm(body, name)
  m.used++
  const co = await getDocument(c.env, c.sa, `companies/${String(project.data.companyId ?? '-')}`)
  await markDeleting(c, 'project', pid, project, name, m)
  const t: Totals = { docs: 0 }
  const phase = await purgeProject(c, m, pid, project, t, name, String(co?.data.name ?? ''))
  return { done: phase === 'selesai', phase, deleted: t.docs }
}

export async function deleteCompany(c: Ctx, body: Body): Promise<PurgeResult> {
  assertDeleter(c.actor)
  const cid = str(body, 'id', { label: 'Perusahaan' })
  const m = new Meter()
  m.used++
  const co = await getDocument(c.env, c.sa, `companies/${cid}`)
  if (!co) throw new HttpError(404, 'not_found', 'Perusahaan tidak ditemukan (mungkin sudah terhapus).')
  const name = String(co.data.name ?? '')
  confirm(body, name)
  await markDeleting(c, 'company', cid, co, name, m)
  const t: Totals = { docs: 0 }
  let phase: Phase | 'proyek' = 'proyek'
  while (m.has(8)) {
    const ps = await q(c, m, 'projects', [{ field: 'companyId', op: 'EQUAL', value: cid }], 5)
    if (ps.length === 0) break
    for (const p of ps) {
      if (!m.has(8)) return { done: false, phase: 'proyek', deleted: t.docs }
      const pname = String(p.data.name ?? '')
      await markDeleting(c, 'project', p.id, p, pname, m)
      phase = await purgeProject(c, m, p.id, p, t, pname, name)
      if (phase !== 'selesai') return { done: false, phase, deleted: t.docs }
    }
  }
  if (!m.has(5)) return { done: false, phase: 'proyek', deleted: t.docs }
  const rest = await q(c, m, 'projects', [{ field: 'companyId', op: 'EQUAL', value: cid }], 1)
  if (rest.length > 0) return { done: false, phase: 'proyek', deleted: t.docs }
  const users = await q(c, m, 'users', [{ field: 'companyIds', op: 'ARRAY_CONTAINS', value: cid }], CHUNK)
  const writes: Write[] = users.map((u): Write => ({ path: `users/${u.id}`, data: { companyIds: arr(u.data.companyIds).filter((x) => x !== cid) }, mask: ['companyIds', 'updatedAt'], precondition: pre(u), serverTime: ['updatedAt'] }))
  t.docs += users.length + 1
  if (users.length >= CHUNK) {
    await send(c, [...writes, auditWrite(c.actor, 'company.purge', { type: 'company', id: cid, label: name }, { fase: 'akun', akun: users.length })], m)
    return { done: false, phase: 'akun', deleted: t.docs }
  }
  await send(c, [...writes, { path: `companies/${cid}`, delete: true, precondition: { exists: true } }, auditWrite(c.actor, 'company.delete', { type: 'company', id: cid, label: name }, { akunDiperbarui: users.length })], m)
  return { done: true, phase: 'selesai', deleted: t.docs }
}

// ---------- Pratinjau (tanpa menghapus) ----------

export interface Preview {
  name: string
  projects: number
  items: number
  transactions: number
  users: number
  deleting: boolean
  /** Perkiraan kasar dokumen yang dihapus: barang + transaksi + total harian (<= transaksi) + total bulanan. */
  estimatedDocs: number
  overDailyLimit: boolean
}

async function previewOf(c: Ctx, m: Meter, pid: string): Promise<{ items: number; tx: number; userIds: string[] }> {
  const [items, users] = await Promise.all([q(c, m, 'items', [], 1000, `projects/${pid}`), q(c, m, 'users', [{ field: 'projectIds', op: 'ARRAY_CONTAINS', value: pid }], 300)])
  // Jumlah txCount seluruh barang = jumlah baris ledger proyek (termasuk koreksi), tanpa kueri agregasi.
  return { items: items.length, tx: items.reduce((s, d) => s + num(d.data.txCount), 0), userIds: users.map((u) => u.id) }
}

const estimate = (items: number, tx: number) => items + tx + tx + items * 24 + 1

export async function projectDeletePreview(c: Ctx, body: Body): Promise<Preview> {
  assertDeleter(c.actor)
  const pid = str(body, 'id', { label: 'Proyek' })
  const m = new Meter()
  const project = await getDocument(c.env, c.sa, `projects/${pid}`)
  if (!project) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
  const p = await previewOf(c, m, pid)
  const est = estimate(p.items, p.tx)
  return { name: String(project.data.name ?? ''), projects: 1, items: p.items, transactions: p.tx, users: p.userIds.length, deleting: project.data.deleting === true, estimatedDocs: est, overDailyLimit: est > DAILY_DELETE_LIMIT }
}

export async function companyDeletePreview(c: Ctx, body: Body): Promise<Preview> {
  assertDeleter(c.actor)
  const cid = str(body, 'id', { label: 'Perusahaan' })
  const m = new Meter()
  const co = await getDocument(c.env, c.sa, `companies/${cid}`)
  if (!co) throw new HttpError(404, 'not_found', 'Perusahaan tidak ditemukan.')
  const ps = await q(c, m, 'projects', [{ field: 'companyId', op: 'EQUAL', value: cid }], 30)
  let items = 0
  let tx = 0
  const users = new Set<string>()
  for (const p of ps) {
    const r = await previewOf(c, m, p.id)
    items += r.items
    tx += r.tx
    r.userIds.forEach((id) => users.add(id))
  }
  const est = estimate(items, tx) + ps.length
  return { name: String(co.data.name ?? ''), projects: ps.length, items, transactions: tx, users: users.size, deleting: co.data.deleting === true, estimatedDocs: est, overDailyLimit: est > DAILY_DELETE_LIMIT }
}

// ---------- Barang katalog yang tidak terpakai ----------

export async function deleteCatalogItem(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'catalog')
  const id = str(body, 'id', { label: 'Barang' })
  const cat = await getDocument(c.env, c.sa, `catalog/${id}`)
  if (!cat) throw new HttpError(404, 'not_found', 'Barang tidak ditemukan (mungkin sudah terhapus).')
  if (num(cat.data.projectCount) > 0) throw new HttpError(409, 'in_use', 'Barang masih dipakai proyek. Hapus barang itu dari proyek (atau hapus proyeknya) lebih dulu.')
  const key = typeof cat.data.nameKey === 'string' ? cat.data.nameKey : ''
  const writes: Write[] = [{ path: `catalog/${id}`, delete: true, precondition: pre(cat) }]
  // Penjaga nama ikut dihapus agar nama itu dapat dipakai lagi.
  if (key) writes.push({ path: `catalogNames/${key}`, delete: true })
  writes.push(auditWrite(c.actor, 'catalog.delete', { type: 'catalog', id, label: String(cat.data.name ?? id) }, { satuan: String(cat.data.unit ?? '') }))
  await commit(c.env, c.sa, writes).catch((e) => {
    if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'conflict', 'Barang baru saja dipakai atau diubah. Muat ulang lalu coba lagi.')
    throw e
  })
}
