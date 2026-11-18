import { endpoints, type Env } from '../env'
import { getAccessToken, type ServiceAccount } from './serviceAccount'

type FsValue = {
  stringValue?: string
  booleanValue?: boolean
  integerValue?: string
  doubleValue?: number
  nullValue?: null
  arrayValue?: { values?: FsValue[] }
  mapValue?: { fields?: Record<string, FsValue> }
  timestampValue?: string
}
type FsFields = Record<string, FsValue>

export function decodeValue(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decodeValue)
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields ?? {})
  return null
}

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } }
  throw new Error('Tipe nilai tidak didukung')
}

export function encodeFields(o: Record<string, unknown>): FsFields {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encodeValue(v)]))
}

function decodeFields(fields: FsFields): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]))
}

export interface Doc {
  id: string
  data: Record<string, unknown>
  /** Waktu pembaruan terakhir; dipakai sebagai prasyarat penulisan (cegah balapan). */
  updateTime?: string
}

type RawDoc = { name: string; fields?: FsFields; updateTime?: string }
const toDoc = (d: RawDoc): Doc => ({ id: d.name.split('/').pop() ?? '', data: decodeFields(d.fields ?? {}), updateTime: d.updateTime })

async function headers(env: Env, sa: ServiceAccount): Promise<HeadersInit> {
  return { Authorization: `Bearer ${await getAccessToken(env, sa)}`, 'Content-Type': 'application/json' }
}

export async function getDocument(env: Env, sa: ServiceAccount, path: string): Promise<Doc | null> {
  const res = await fetch(`${endpoints(env).firestoreDocs}/${path}`, { headers: await headers(env, sa) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore get gagal (${res.status})`)
  return toDoc((await res.json()) as RawDoc)
}

export interface Filter {
  field: string
  op: 'EQUAL' | 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL'
  value: unknown
}

/** Query sederhana: hanya filter kesamaan (atau satu ketidaksamaan) tanpa pengurutan, agar tidak butuh indeks komposit. */
export async function queryDocuments(env: Env, sa: ServiceAccount, collection: string, filters: Filter[], limit = 100, parent = ''): Promise<Doc[]> {
  const fieldFilters = filters.map((f) => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: encodeValue(f.value) } }))
  const where =
    fieldFilters.length === 0 ? undefined : fieldFilters.length === 1 ? fieldFilters[0] : { compositeFilter: { op: 'AND', filters: fieldFilters } }
  // `parent` = jalur dokumen induk untuk subkoleksi, mis. projects/p1/items/i1
  const res = await fetch(`${endpoints(env).firestoreDocs}${parent ? `/${parent}` : ''}:runQuery`, {
    method: 'POST',
    headers: await headers(env, sa),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], ...(where ? { where } : {}), limit } }),
  })
  if (!res.ok) throw new Error(`Firestore query gagal (${res.status})`)
  const rows = (await res.json()) as { document?: RawDoc }[]
  return rows.filter((r) => r.document).map((r) => toDoc(r.document as RawDoc))
}

export const findUsersByEmail = (env: Env, sa: ServiceAccount, emailLower: string) =>
  queryDocuments(env, sa, 'users', [{ field: 'emailContact', op: 'EQUAL', value: emailLower }], 3)

// ---------- Penulisan ----------

export type Precondition = { exists: boolean } | { updateTime: string }

export interface Write {
  /** Jalur dokumen relatif, mis. users/abc. */
  path: string
  /** Isi dokumen (set penuh bila tanpa `mask`). */
  data?: Record<string, unknown>
  /** Hanya perbarui kolom-kolom ini (merge). */
  mask?: string[]
  delete?: boolean
  precondition?: Precondition
  /** Kolom yang diisi waktu server (REQUEST_TIME). */
  serverTime?: string[]
}

export class CommitError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** ALREADY_EXISTS atau FAILED_PRECONDITION: ada yang lebih dulu mengubah data. */
    readonly conflict: boolean,
  ) {
    super(message)
  }
}

/** Menulis beberapa dokumen secara atomik (semua atau tidak sama sekali). */
export async function commit(env: Env, sa: ServiceAccount, writes: Write[]): Promise<void> {
  const base = endpoints(env).firestoreDocs
  const docName = (path: string) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`
  const body = {
    writes: writes.map((w) => {
      const currentDocument = w.precondition
      if (w.delete) return { delete: docName(w.path), ...(currentDocument ? { currentDocument } : {}) }
      return {
        update: { name: docName(w.path), fields: encodeFields(w.data ?? {}) },
        // Kolom yang diisi lewat transform (waktu server) tidak boleh ikut dalam updateMask.
        ...(w.mask ? { updateMask: { fieldPaths: w.mask.filter((f) => !(w.serverTime ?? []).includes(f)) } } : {}),
        ...(currentDocument ? { currentDocument } : {}),
        ...(w.serverTime?.length ? { updateTransforms: w.serverTime.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}),
      }
    }),
  }
  const res = await fetch(`${base}:commit`, { method: 'POST', headers: await headers(env, sa), body: JSON.stringify(body) })
  if (res.ok) return
  const text = await res.text().catch(() => '')
  const conflict = res.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION|NOT_FOUND/.test(text)
  throw new CommitError(`Firestore commit gagal (${res.status})`, res.status, conflict)
}
