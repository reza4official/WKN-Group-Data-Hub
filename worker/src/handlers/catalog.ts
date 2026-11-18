import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, CommitError, getDocument, type Write } from '../lib/firestore'
import { HttpError, optStr, quantity, str, type Body } from '../lib/http'
import { usernameDigest } from '../lib/identity'
import type { ServiceAccount } from '../lib/serviceAccount'
import { conflictToHttp } from './users'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/** Kunci keunikan nama barang: hash dari nama yang dinormalisasi (sama seperti username). */
const nameKey = (name: string) => usernameDigest(name)

export async function createCatalogItem(c: Ctx, body: Body): Promise<{ id: string }> {
  requirePerm(c.actor, 'catalog')
  const name = str(body, 'name', { max: 160, label: 'Nama barang' })
  const unit = str(body, 'unit', { max: 40, label: 'Satuan' })
  const category = optStr(body, 'category', 80, 'Kategori') ?? ''
  const minStock = body.minStock === undefined ? 0 : quantity(body, 'minStock', 'Batas minimum')
  const key = await nameKey(name)
  const id = `i-${crypto.randomUUID().slice(0, 8)}`
  try {
    await commit(c.env, c.sa, [
      { path: `catalog/${id}`, data: { name, nameKey: key, unit, category, minStock, active: true, projectCount: 0, createdBy: c.actor.uid, createdByName: c.actor.name }, precondition: { exists: false }, serverTime: ['createdAt'] },
      { path: `catalogNames/${key}`, data: { itemId: id }, precondition: { exists: false } },
      auditWrite(c.actor, 'catalog.create', { type: 'catalog', id, label: name }, { satuan: unit }),
    ])
  } catch (e) {
    if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'name_taken', 'Nama barang sudah ada di katalog.')
    throw e
  }
  return { id }
}

export async function updateCatalogItem(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'catalog')
  const id = str(body, 'id')
  const item = await getDocument(c.env, c.sa, `catalog/${id}`)
  if (!item) throw new HttpError(404, 'not_found', 'Barang tidak ditemukan.')
  const used = Number(item.data.projectCount ?? 0) > 0
  const data: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const writes: Write[] = []
  const track = (k: string, v: unknown) => {
    if (v !== undefined && v !== item.data[k]) {
      data[k] = v
      before[k] = item.data[k]
    }
  }
  if (body.name !== undefined) {
    const name = str(body, 'name', { max: 160, label: 'Nama barang' })
    const key = await nameKey(name)
    if (key !== item.data.nameKey) {
      // Tukar penjaga keunikan secara atomik: lepas yang lama, ambil yang baru (gagal bila nama sudah dipakai).
      writes.push({ path: `catalogNames/${String(item.data.nameKey)}`, delete: true })
      writes.push({ path: `catalogNames/${key}`, data: { itemId: id }, precondition: { exists: false } })
      data.nameKey = key
    }
    track('name', name)
  }
  if (body.unit !== undefined) {
    const unit = str(body, 'unit', { max: 40, label: 'Satuan' })
    if (unit !== item.data.unit && used) throw new HttpError(409, 'in_use', 'Satuan tidak dapat diubah karena barang sudah dipakai di proyek.')
    track('unit', unit)
  }
  track('category', optStr(body, 'category', 80, 'Kategori'))
  if (body.minStock !== undefined) track('minStock', quantity(body, 'minStock', 'Batas minimum'))
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'bad_request', 'Status tidak valid.')
    if (!body.active && used) throw new HttpError(409, 'in_use', 'Barang masih dipakai di proyek dan tidak dapat dinonaktifkan.')
    track('active', body.active)
  }
  if (!Object.keys(data).length) return
  const after = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'nameKey'))
  try {
    await commit(c.env, c.sa, [
      { path: `catalog/${id}`, data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name }, mask: [...Object.keys(data), 'updatedBy', 'updatedByName', 'updatedAt'], precondition: item.updateTime ? { updateTime: item.updateTime } : { exists: true }, serverTime: ['updatedAt'] },
      ...writes,
      auditWrite(c.actor, 'catalog.update', { type: 'catalog', id, label: String(data.name ?? item.data.name) }, { before, after }),
    ])
  } catch (e) {
    if (e instanceof CommitError && e.conflict) {
      if (writes.length) throw new HttpError(409, 'name_taken', 'Nama barang sudah ada di katalog.')
      conflictToHttp(e)
    }
    throw e
  }
}
