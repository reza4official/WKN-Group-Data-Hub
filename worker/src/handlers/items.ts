import type { Env } from '../env'
import type { Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, getDocument } from '../lib/firestore'
import { HttpError, isoDate, quantity, str, todayWita, type Body } from '../lib/http'
import { canAccessProject, seesAllProjects } from '../lib/scope'
import type { ServiceAccount } from '../lib/serviceAccount'
import { conflictToHttp } from './users'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/**
 * Penyiapan barang proyek (termasuk saldo awal): pemegang izin "projects", atau pemegang izin
 * "inventory.write" yang ditugaskan pada proyek itu.
 */
export function assertCanSetupItems(a: Actor, projectId: string): void {
  if (seesAllProjects(a)) return
  if (a.perms.has('inventory.write') && canAccessProject(a, projectId)) return
  throw new HttpError(403, 'forbidden', 'Anda tidak berwenang menyiapkan barang pada proyek ini.')
}

async function loadProject(c: Ctx, projectId: string) {
  const p = await getDocument(c.env, c.sa, `projects/${projectId}`)
  if (!p) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
  return p
}

/** Saldo awal: jumlah dan tanggal harus ada berdua, tanggal tidak di masa depan (menurut WITA). */
function readOpening(body: Body): { openingQty: number; openingDate: string } | null {
  const hasQty = body.openingQty !== undefined && body.openingQty !== null
  const date = isoDate(body, 'openingDate', 'Tanggal saldo awal')
  if (!hasQty && !date) return null
  if (!hasQty || !date) throw new HttpError(400, 'bad_request', 'Jumlah dan tanggal saldo awal harus diisi bersama.')
  if (date > todayWita()) throw new HttpError(400, 'bad_request', 'Tanggal saldo awal tidak boleh di masa depan.')
  return { openingQty: quantity(body, 'openingQty', 'Saldo awal'), openingDate: date }
}

export async function addProjectItem(c: Ctx, body: Body): Promise<void> {
  const projectId = str(body, 'projectId', { label: 'Proyek' })
  const catalogId = str(body, 'catalogId', { label: 'Barang' })
  assertCanSetupItems(c.actor, projectId)
  const project = await loadProject(c, projectId)
  if (project.data.active === false) throw new HttpError(400, 'bad_request', 'Proyek sudah nonaktif.')
  const cat = await getDocument(c.env, c.sa, `catalog/${catalogId}`)
  if (!cat || cat.data.active === false) throw new HttpError(400, 'unknown_item', 'Barang tidak ada di katalog atau sudah nonaktif.')
  if (await getDocument(c.env, c.sa, `projects/${projectId}/items/${catalogId}`)) throw new HttpError(409, 'item_exists', 'Barang ini sudah ada di proyek.')
  const opening = readOpening(body)
  const minStock = body.minStock === undefined ? Number(cat.data.minStock ?? 0) : quantity(body, 'minStock', 'Batas minimum')

  await commit(c.env, c.sa, [
    {
      path: `projects/${projectId}/items/${catalogId}`,
      data: {
        catalogId,
        openingQty: opening?.openingQty ?? null,
        openingDate: opening?.openingDate ?? null,
        // stok saat ini dan jumlah transaksi dipelihara oleh ledger (Tahap 5)
        currentStock: opening?.openingQty ?? null,
        txCount: 0,
        minStock,
        active: true,
        createdBy: c.actor.uid,
        createdByName: c.actor.name,
      },
      precondition: { exists: false },
      serverTime: ['createdAt'],
    },
    // hitung pemakaian katalog agar barang yang dipakai tidak bisa dinonaktifkan/diubah satuannya
    { path: `catalog/${catalogId}`, data: { projectCount: Number(cat.data.projectCount ?? 0) + 1 }, mask: ['projectCount'], precondition: cat.updateTime ? { updateTime: cat.updateTime } : { exists: true } },
    auditWrite(c.actor, 'item.add', { type: 'item', id: `${projectId}/${catalogId}`, label: `${String(cat.data.name)} @ ${String(project.data.name)}` }, opening ?? { saldoAwal: 'belum diisi' }),
  ]).catch(conflictToHttp)
}

export async function setOpening(c: Ctx, body: Body): Promise<void> {
  const projectId = str(body, 'projectId', { label: 'Proyek' })
  const catalogId = str(body, 'catalogId', { label: 'Barang' })
  assertCanSetupItems(c.actor, projectId)
  const project = await loadProject(c, projectId)
  const item = await getDocument(c.env, c.sa, `projects/${projectId}/items/${catalogId}`)
  if (!item) throw new HttpError(404, 'not_found', 'Barang tidak ada di proyek ini.')
  // Setelah ada transaksi, saldo awal hanya dapat dikoreksi lewat mekanisme koreksi (Tahap 5).
  if (Number(item.data.txCount ?? 0) > 0) throw new HttpError(409, 'has_transactions', 'Saldo awal tidak dapat diubah karena sudah ada transaksi.')
  const opening = readOpening(body)
  if (!opening) throw new HttpError(400, 'bad_request', 'Jumlah dan tanggal saldo awal wajib diisi.')
  const cat = await getDocument(c.env, c.sa, `catalog/${catalogId}`)
  await commit(c.env, c.sa, [
    {
      path: `projects/${projectId}/items/${catalogId}`,
      data: { openingQty: opening.openingQty, openingDate: opening.openingDate, currentStock: opening.openingQty, updatedBy: c.actor.uid, updatedByName: c.actor.name },
      mask: ['openingQty', 'openingDate', 'currentStock', 'updatedBy', 'updatedByName', 'updatedAt'],
      precondition: item.updateTime ? { updateTime: item.updateTime } : { exists: true },
      serverTime: ['updatedAt'],
    },
    auditWrite(c.actor, 'item.set_opening', { type: 'item', id: `${projectId}/${catalogId}`, label: `${String(cat?.data.name ?? catalogId)} @ ${String(project.data.name)}` }, {
      before: { saldo: item.data.openingQty, tanggal: item.data.openingDate },
      after: { saldo: opening.openingQty, tanggal: opening.openingDate },
    }),
  ]).catch(conflictToHttp)
}

export async function updateProjectItem(c: Ctx, body: Body): Promise<void> {
  const projectId = str(body, 'projectId', { label: 'Proyek' })
  const catalogId = str(body, 'catalogId', { label: 'Barang' })
  assertCanSetupItems(c.actor, projectId)
  const project = await loadProject(c, projectId)
  const item = await getDocument(c.env, c.sa, `projects/${projectId}/items/${catalogId}`)
  if (!item) throw new HttpError(404, 'not_found', 'Barang tidak ada di proyek ini.')
  const data: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  if (body.minStock !== undefined) {
    const v = quantity(body, 'minStock', 'Batas minimum')
    if (v !== item.data.minStock) {
      data.minStock = v
      before.minStock = item.data.minStock
    }
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'bad_request', 'Status tidak valid.')
    if (body.active !== item.data.active) {
      data.active = body.active
      before.active = item.data.active
    }
  }
  if (!Object.keys(data).length) return
  await commit(c.env, c.sa, [
    { path: `projects/${projectId}/items/${catalogId}`, data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name }, mask: [...Object.keys(data), 'updatedBy', 'updatedByName', 'updatedAt'], precondition: item.updateTime ? { updateTime: item.updateTime } : { exists: true }, serverTime: ['updatedAt'] },
    auditWrite(c.actor, 'item.update', { type: 'item', id: `${projectId}/${catalogId}`, label: `${catalogId} @ ${String(project.data.name)}` }, { before, after: data }),
  ]).catch(conflictToHttp)
}
