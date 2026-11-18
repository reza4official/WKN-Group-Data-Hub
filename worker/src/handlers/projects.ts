import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, getDocument, queryDocuments } from '../lib/firestore'
import { HttpError, isoDate, oneOf, optStr, str, type Body } from '../lib/http'
import type { ServiceAccount } from '../lib/serviceAccount'
import { conflictToHttp } from './users'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

const COMPANY_TYPES = ['induk', 'anak'] as const
const PROJECT_STATUS = ['berjalan', 'ditunda', 'selesai'] as const
const pre = (updateTime?: string) => (updateTime ? { updateTime } : { exists: true })

// ---------- Perusahaan ----------

export async function createCompany(c: Ctx, body: Body): Promise<{ id: string }> {
  requirePerm(c.actor, 'projects')
  const name = str(body, 'name', { max: 120, label: 'Nama perusahaan' })
  const type = oneOf(body, 'type', COMPANY_TYPES, 'Jenis perusahaan')
  const all = await queryDocuments(c.env, c.sa, 'companies', [], 200)
  if (all.some((x) => String(x.data.name).toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'name_taken', 'Nama perusahaan sudah ada.')
  const id = `c-${crypto.randomUUID().slice(0, 8)}`
  await commit(c.env, c.sa, [
    { path: `companies/${id}`, data: { name, type, active: true, createdBy: c.actor.uid, createdByName: c.actor.name }, precondition: { exists: false }, serverTime: ['createdAt'] },
    auditWrite(c.actor, 'company.create', { type: 'company', id, label: name }, { jenis: type }),
  ]).catch(conflictToHttp)
  return { id }
}

export async function updateCompany(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'projects')
  const id = str(body, 'id')
  const co = await getDocument(c.env, c.sa, `companies/${id}`)
  if (!co) throw new HttpError(404, 'not_found', 'Perusahaan tidak ditemukan.')
  const data: Record<string, unknown> = {}
  const detail: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = str(body, 'name', { max: 120, label: 'Nama perusahaan' })
    if (name !== co.data.name) {
      const all = await queryDocuments(c.env, c.sa, 'companies', [], 200)
      if (all.some((x) => x.id !== id && String(x.data.name).toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'name_taken', 'Nama perusahaan sudah ada.')
      data.name = name
      detail.nama = { dari: co.data.name, menjadi: name }
    }
  }
  if (body.type !== undefined) {
    const type = oneOf(body, 'type', COMPANY_TYPES, 'Jenis perusahaan')
    if (type !== co.data.type) {
      data.type = type
      detail.jenis = type
    }
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'bad_request', 'Status tidak valid.')
    if (body.active !== co.data.active) {
      if (!body.active) {
        const live = await queryDocuments(c.env, c.sa, 'projects', [{ field: 'companyId', op: 'EQUAL', value: id }, { field: 'active', op: 'EQUAL', value: true }], 1)
        if (live.length) throw new HttpError(409, 'in_use', 'Perusahaan masih memiliki proyek aktif. Nonaktifkan proyeknya dulu.')
      }
      data.active = body.active
      detail.aktif = body.active
    }
  }
  if (!Object.keys(data).length) return
  await commit(c.env, c.sa, [
    { path: `companies/${id}`, data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name }, mask: [...Object.keys(data), 'updatedBy', 'updatedByName', 'updatedAt'], precondition: pre(co.updateTime), serverTime: ['updatedAt'] },
    auditWrite(c.actor, 'company.update', { type: 'company', id, label: String(data.name ?? co.data.name) }, detail),
  ]).catch(conflictToHttp)
}

// ---------- Proyek ----------

export async function createProject(c: Ctx, body: Body): Promise<{ id: string }> {
  requirePerm(c.actor, 'projects')
  const companyId = str(body, 'companyId', { label: 'Perusahaan' })
  const name = str(body, 'name', { max: 160, label: 'Nama proyek' })
  const location = optStr(body, 'location', 160, 'Lokasi') ?? ''
  const status = body.status === undefined ? 'berjalan' : oneOf(body, 'status', PROJECT_STATUS, 'Status')
  const startDate = isoDate(body, 'startDate', 'Tanggal mulai') ?? null
  const co = await getDocument(c.env, c.sa, `companies/${companyId}`)
  if (!co || co.data.active === false) throw new HttpError(400, 'unknown_company', 'Perusahaan tidak ditemukan atau nonaktif.')
  const same = await queryDocuments(c.env, c.sa, 'projects', [{ field: 'companyId', op: 'EQUAL', value: companyId }], 500)
  if (same.some((p) => String(p.data.name).toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'name_taken', 'Nama proyek sudah ada pada perusahaan ini.')
  const id = `p-${crypto.randomUUID().slice(0, 8)}`
  await commit(c.env, c.sa, [
    { path: `projects/${id}`, data: { companyId, name, location, status, startDate, active: true, createdBy: c.actor.uid, createdByName: c.actor.name }, precondition: { exists: false }, serverTime: ['createdAt'] },
    auditWrite(c.actor, 'project.create', { type: 'project', id, label: name }, { perusahaan: String(co.data.name) }),
  ]).catch(conflictToHttp)
  return { id }
}

export async function updateProject(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'projects')
  const id = str(body, 'id')
  const p = await getDocument(c.env, c.sa, `projects/${id}`)
  if (!p) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
  const data: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const track = (k: string, v: unknown) => {
    if (v !== undefined && v !== p.data[k]) {
      data[k] = v
      before[k] = p.data[k]
    }
  }
  if (body.name !== undefined) {
    const name = str(body, 'name', { max: 160, label: 'Nama proyek' })
    if (name !== p.data.name) {
      const same = await queryDocuments(c.env, c.sa, 'projects', [{ field: 'companyId', op: 'EQUAL', value: p.data.companyId }], 500)
      if (same.some((x) => x.id !== id && String(x.data.name).toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'name_taken', 'Nama proyek sudah ada pada perusahaan ini.')
    }
    track('name', name)
  }
  track('location', optStr(body, 'location', 160, 'Lokasi'))
  if (body.status !== undefined) track('status', oneOf(body, 'status', PROJECT_STATUS, 'Status'))
  if (body.startDate !== undefined) track('startDate', isoDate(body, 'startDate', 'Tanggal mulai') ?? null)
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'bad_request', 'Status tidak valid.')
    track('active', body.active)
  }
  if (!Object.keys(data).length) return
  await commit(c.env, c.sa, [
    { path: `projects/${id}`, data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name }, mask: [...Object.keys(data), 'updatedBy', 'updatedByName', 'updatedAt'], precondition: pre(p.updateTime), serverTime: ['updatedAt'] },
    auditWrite(c.actor, 'project.update', { type: 'project', id, label: String(data.name ?? p.data.name) }, { before, after: data }),
  ]).catch(conflictToHttp)
}
