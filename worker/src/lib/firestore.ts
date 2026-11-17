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

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]))
}

export interface Doc {
  id: string
  data: Record<string, unknown>
}

async function headers(env: Env, sa: ServiceAccount): Promise<HeadersInit> {
  return { Authorization: `Bearer ${await getAccessToken(env, sa)}`, 'Content-Type': 'application/json' }
}

export async function getDocument(env: Env, sa: ServiceAccount, path: string): Promise<Doc | null> {
  const res = await fetch(`${endpoints(env).firestoreDocs}/${path}`, { headers: await headers(env, sa) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore get gagal (${res.status})`)
  const j = (await res.json()) as { name: string; fields?: Record<string, FsValue> }
  return { id: j.name.split('/').pop() ?? '', data: decodeFields(j.fields ?? {}) }
}

/** Mencari akun terdaftar berdasarkan email kontak (disimpan dalam huruf kecil). */
export async function findUsersByEmail(env: Env, sa: ServiceAccount, emailLower: string): Promise<Doc[]> {
  const res = await fetch(`${endpoints(env).firestoreDocs}:runQuery`, {
    method: 'POST',
    headers: await headers(env, sa),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: { fieldFilter: { field: { fieldPath: 'emailContact' }, op: 'EQUAL', value: { stringValue: emailLower } } },
        limit: 3,
      },
    }),
  })
  if (!res.ok) throw new Error(`Firestore query gagal (${res.status})`)
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, FsValue> } }[]
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: r.document!.name.split('/').pop() ?? '', data: decodeFields(r.document!.fields ?? {}) }))
}

/** Menghapus akun Authentication (dipakai untuk membuang akun Google yang tidak terdaftar). */
export async function deleteAuthUser(env: Env, sa: ServiceAccount, uid: string): Promise<void> {
  const res = await fetch(`${endpoints(env).identityAdmin}/accounts:delete`, {
    method: 'POST',
    headers: await headers(env, sa),
    body: JSON.stringify({ localId: uid }),
  })
  if (!res.ok) throw new Error(`Hapus akun Auth gagal (${res.status})`)
}
