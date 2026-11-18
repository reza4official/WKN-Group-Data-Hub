import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { batchGetDocuments, commit, CommitError, getDocument, type Write } from '../lib/firestore'
import { HttpError, isoDate, optStr, quantity, str, todayWita, type Body } from '../lib/http'
import { usernameDigest } from '../lib/identity'
import type { ServiceAccount } from '../lib/serviceAccount'
import { assertCanSetupItems } from './items'
import type { ImportResult } from './ledger'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/** Impor penyiapan: katalog barang dan saldo awal (barang proyek). Batas 150 baris per permintaan (500 penulisan per commit). */
const MAX_ROWS = 150
const IMPORT_ID = /^[A-Za-z0-9-]{8,48}$/
const TRIES = 4

class Retry extends Error {}
type Summary = { results: ImportResult[]; accepted: number; rejected: number; duplicates: number }

function readRows(body: Body): { importId: string; fileName: string; rows: unknown[] } {
  const importId = str(body, 'importId', { max: 48, label: 'ID impor' })
  if (!IMPORT_ID.test(importId)) throw new HttpError(400, 'bad_request', 'ID impor tidak valid.')
  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'bad_request', 'Tidak ada baris untuk diimpor.')
  if (rows.length > MAX_ROWS) throw new HttpError(400, 'too_many_rows', `Maksimal ${MAX_ROWS} baris per permintaan.`)
  return { importId, fileName: optStr(body, 'fileName', 120, 'Nama berkas') ?? '', rows }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < TRIES; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Retry)) throw e
    }
  }
  throw new HttpError(409, 'busy', 'Data sedang diubah pengguna lain. Coba lagi sebentar lagi.')
}

async function send(c: Ctx, writes: Write[]): Promise<void> {
  try {
    await commit(c.env, c.sa, writes)
  } catch (e) {
    if (e instanceof CommitError && e.conflict) throw new Retry()
    throw e
  }
}

const tally = (results: Map<number, ImportResult>): Summary => {
  const all = [...results.values()].sort((a, b) => a.index - b.index)
  return { results: all, accepted: all.filter((r) => r.status === 'ok').length, rejected: all.filter((r) => r.status === 'error').length, duplicates: all.filter((r) => r.status === 'duplicate').length }
}

// ---------- Katalog barang ----------

interface CatRow {
  index: number
  name: string
  unit: string
  category: string
  minStock: number
  key: string
}

/**
 * Mengimpor katalog barang. Nama harus unik (tanpa membedakan huruf besar/kecil dan spasi tepi), baik terhadap katalog yang ada
 * maupun di dalam berkas. ID barang deterministik dari ID impor + nomor baris, sehingga pengulangan permintaan dikenali.
 */
export async function importCatalog(c: Ctx, body: Body): Promise<Summary> {
  requirePerm(c.actor, 'import')
  requirePerm(c.actor, 'catalog')
  const { importId, fileName, rows } = readRows(body)

  const errors = new Map<number, ImportResult>()
  const parsed: CatRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const index = i + 1
    try {
      const r = rows[i]
      if (!r || typeof r !== 'object') throw new HttpError(400, 'bad_request', 'Baris tidak valid.')
      const row = r as Body
      const name = str(row, 'name', { max: 160, label: 'Nama barang' })
      parsed.push({
        index,
        name,
        unit: str(row, 'unit', { max: 40, label: 'Satuan' }),
        category: optStr(row, 'category', 80, 'Kategori') ?? '',
        minStock: row.minStock === undefined || row.minStock === null || row.minStock === '' ? 0 : quantity(row, 'minStock', 'Batas minimum'),
        key: await usernameDigest(name),
      })
    } catch (e) {
      if (!(e instanceof HttpError)) throw e
      errors.set(index, { index, status: 'error', code: e.code, message: e.message })
    }
  }

  return withRetry(async () => {
    const results = new Map<number, ImportResult>(errors)
    const guards = await batchGetDocuments(c.env, c.sa, parsed.map((p) => `catalogNames/${p.key}`))
    const seen = new Set<string>()
    const writes: Write[] = []
    for (const p of parsed) {
      const id = `i-${importId}-${p.index}`
      const guard = guards.get(`catalogNames/${p.key}`)
      if (guard) {
        if (guard.data.itemId === id) results.set(p.index, { index: p.index, status: 'duplicate', message: 'Baris ini sudah pernah diimpor.' })
        else results.set(p.index, { index: p.index, status: 'error', code: 'name_taken', message: 'Nama barang sudah ada di katalog.' })
        continue
      }
      if (seen.has(p.key)) {
        results.set(p.index, { index: p.index, status: 'error', code: 'name_taken', message: 'Nama barang kembar di dalam berkas (baris sebelumnya sudah memakainya).' })
        continue
      }
      seen.add(p.key)
      results.set(p.index, { index: p.index, status: 'ok' })
      writes.push(
        { path: `catalog/${id}`, data: { name: p.name, nameKey: p.key, unit: p.unit, category: p.category, minStock: p.minStock, active: true, projectCount: 0, source: 'import', importId, createdBy: c.actor.uid, createdByName: c.actor.name }, precondition: { exists: false }, serverTime: ['createdAt'] },
        { path: `catalogNames/${p.key}`, data: { itemId: id }, precondition: { exists: false } },
      )
    }
    const s = tally(results)
    if (writes.length > 0) {
      writes.push(auditWrite(c.actor, 'catalog.import', { type: 'catalog', id: importId, label: fileName || 'impor katalog' }, { berkas: fileName, diterima: s.accepted, ditolak: s.rejected, duplikat: s.duplicates }))
      await send(c, writes)
    }
    return s
  })
}

// ---------- Saldo awal (barang proyek) ----------

interface OpenRow {
  index: number
  catalogId: string
  qty: number
  date: string
  minStock: number | null
}

/**
 * Menambahkan barang katalog ke sebuah proyek beserta saldo awalnya. Barang yang sudah ada di proyek ditolak
 * (saldo awal yang sudah berjalan tidak ditimpa oleh impor).
 */
export async function importOpening(c: Ctx, body: Body): Promise<Summary> {
  requirePerm(c.actor, 'import')
  const projectId = str(body, 'projectId', { label: 'Proyek' })
  assertCanSetupItems(c.actor, projectId)
  const { importId, fileName, rows } = readRows(body)
  const today = todayWita()

  const errors = new Map<number, ImportResult>()
  const parsed: OpenRow[] = []
  rows.forEach((r, i) => {
    const index = i + 1
    try {
      if (!r || typeof r !== 'object') throw new HttpError(400, 'bad_request', 'Baris tidak valid.')
      const row = r as Body
      const date = isoDate(row, 'openingDate', 'Tanggal saldo awal')
      if (!date) throw new HttpError(400, 'bad_request', 'Tanggal saldo awal wajib diisi.')
      if (date > today) throw new HttpError(400, 'bad_request', 'Tanggal saldo awal tidak boleh di masa depan.')
      if (row.openingQty === undefined || row.openingQty === null) throw new HttpError(400, 'bad_request', 'Saldo awal wajib diisi.')
      parsed.push({
        index,
        catalogId: str(row, 'catalogId', { label: 'Barang' }),
        qty: quantity(row, 'openingQty', 'Saldo awal'),
        date,
        minStock: row.minStock === undefined || row.minStock === null || row.minStock === '' ? null : quantity(row, 'minStock', 'Batas minimum'),
      })
    } catch (e) {
      if (!(e instanceof HttpError)) throw e
      errors.set(index, { index, status: 'error', code: e.code, message: e.message })
    }
  })

  return withRetry(async () => {
    const project = await getDocument(c.env, c.sa, `projects/${projectId}`)
    if (!project) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
    if (project.data.active === false) throw new HttpError(400, 'bad_request', 'Proyek sudah nonaktif.')

    const ids = [...new Set(parsed.map((p) => p.catalogId))]
    const [cats, items] = await Promise.all([
      batchGetDocuments(c.env, c.sa, ids.map((id) => `catalog/${id}`)),
      batchGetDocuments(c.env, c.sa, ids.map((id) => `projects/${projectId}/items/${id}`)),
    ])
    const results = new Map<number, ImportResult>(errors)
    const seen = new Set<string>()
    const writes: Write[] = []
    for (const p of parsed) {
      const cat = cats.get(`catalog/${p.catalogId}`)
      const existing = items.get(`projects/${projectId}/items/${p.catalogId}`)
      if (existing) {
        if (existing.data.importId === importId) results.set(p.index, { index: p.index, status: 'duplicate', message: 'Baris ini sudah pernah diimpor.' })
        else results.set(p.index, { index: p.index, status: 'error', code: 'item_exists', message: 'Barang ini sudah ada di proyek (saldo awal tidak ditimpa oleh impor).' })
        continue
      }
      if (!cat || cat.data.active === false) {
        results.set(p.index, { index: p.index, status: 'error', code: 'unknown_item', message: 'Barang tidak ada di katalog atau sudah nonaktif.' })
        continue
      }
      if (seen.has(p.catalogId)) {
        results.set(p.index, { index: p.index, status: 'error', code: 'item_exists', message: 'Barang kembar di dalam berkas (baris sebelumnya sudah memakainya).' })
        continue
      }
      seen.add(p.catalogId)
      results.set(p.index, { index: p.index, status: 'ok' })
      writes.push(
        {
          path: `projects/${projectId}/items/${p.catalogId}`,
          data: {
            catalogId: p.catalogId,
            openingQty: p.qty,
            openingDate: p.date,
            currentStock: p.qty,
            txCount: 0,
            minStock: p.minStock ?? Number(cat.data.minStock ?? 0),
            active: true,
            source: 'import',
            importId,
            createdBy: c.actor.uid,
            createdByName: c.actor.name,
          },
          precondition: { exists: false },
          serverTime: ['createdAt'],
        },
        { path: `catalog/${p.catalogId}`, data: { projectCount: Number(cat.data.projectCount ?? 0) + 1 }, mask: ['projectCount'], precondition: cat.updateTime ? { updateTime: cat.updateTime } : { exists: true } },
      )
    }
    const s = tally(results)
    if (writes.length > 0) {
      writes.push(auditWrite(c.actor, 'item.import', { type: 'item', id: importId, label: String(project.data.name) }, { berkas: fileName, diterima: s.accepted, ditolak: s.rejected, duplikat: s.duplicates }))
      await send(c, writes)
    }
    return s
  })
}
