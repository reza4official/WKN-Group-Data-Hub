import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto'
import { b64urlEncode } from '../src/lib/encoding'
import { decodeValue, encodeFields, type Doc } from '../src/lib/firestore'
import type { Env } from '../src/env'

export const PROJECT = 'wkngroup-datahub'

/** Satu pasang kunci RSA untuk "Google" (JWKS) dan satu untuk service account Worker. */
export function rsa(): { priv: KeyObject; pem: string; jwk: JsonWebKey } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    priv: privateKey,
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    jwk: publicKey.export({ format: 'jwk' }) as JsonWebKey,
  }
}

export function signJwt(priv: KeyObject, header: object, payload: object): string {
  const h = b64urlEncode(JSON.stringify(header))
  const p = b64urlEncode(JSON.stringify(payload))
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(priv)
  return `${h}.${p}.${b64urlEncode(new Uint8Array(sig))}`
}

type Raw = Record<string, unknown>
interface StoredDoc {
  data: Raw
  version: number
}
interface AuthUser {
  uid: string
  email: string
  password: string
  disabled: boolean
  validSince?: string
}

/** Backend palsu dalam memori: Firestore REST (get, query, commit atomik dengan prasyarat), Identity Toolkit admin, JWKS, OAuth, Turnstile. */
/**
 * Jalur tulis yang sah tanpa catatan audit:
 * - webauthnCredentials/*: penghitung dan waktu pakai passkey saat login biometrik (bukan perubahan oleh pelaku; login bukan aksi data).
 * - resetRequests/* dibuat dari halaman login publik (pelaku belum masuk); pencatatan audit 'reset.request' ditulis oleh handlernya sendiri
 *   dalam commit yang sama, jadi tidak termasuk pengecualian di sini.
 * - system/*: status cadangan dan pemakaian kuota yang ditulis cron (bukan aksi pengguna).
 */
export const AUDIT_EXEMPT: RegExp[] = [/^webauthnCredentials\//, /^system\//]

export class FakeBackend {
  static auditViolations: string[] = []
  docs = new Map<string, StoredDoc>()
  auth = new Map<string, AuthUser>()
  clock = 0
  google = rsa()
  /** Hook untuk mensimulasikan kegagalan atau balapan. */
  failAuthUpdate = false
  beforeCommit?: () => void
  turnstile: { success: boolean; hostname: string } = { success: true, hostname: 'wkngroup-datahub.web.app' }
  calls: string[] = []
  /** Layanan luar palsu (mis. Apps Script, Cloud Monitoring): awalan URL -> penangan. */
  externals = new Map<string, (url: string, init?: RequestInit) => Response | Promise<Response>>()
  private uidSeq = 0

  seedDoc(path: string, data: Raw): void {
    this.docs.set(path, { data: { ...data }, version: ++this.clock })
  }
  getData(path: string): Raw | undefined {
    return this.docs.get(path)?.data
  }
  list(prefix: string): { id: string; data: Raw }[] {
    return [...this.docs.entries()]
      .filter(([k]) => k.startsWith(prefix + '/') && !k.slice(prefix.length + 1).includes('/'))
      .map(([k, v]) => ({ id: k.slice(prefix.length + 1), data: v.data }))
  }
  seedAuth(uid: string, email: string, password: string): void {
    this.auth.set(uid, { uid, email, password, disabled: false })
  }

  idToken(uid: string, over: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000)
    return signJwt(
      this.google.priv,
      { alg: 'RS256', kid: 'k1' },
      {
        aud: PROJECT,
        iss: `https://securetoken.google.com/${PROJECT}`,
        sub: uid,
        iat: now - 10,
        exp: now + 3000,
        auth_time: now - 10,
        firebase: { sign_in_provider: 'password' },
        ...over,
      },
    )
  }

  private ver = (v: StoredDoc) => `2026-01-01T00:00:00.${String(v.version).padStart(6, '0')}Z`
  private raw = (path: string, v: StoredDoc) => ({
    name: `projects/${PROJECT}/databases/(default)/documents/${path}`,
    fields: encodeFields(v.data),
    updateTime: this.ver(v),
  })

  install(): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => this.handle(String(input), init)) as typeof fetch
  }

  private ok(body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } })
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    this.calls.push(`${init?.method ?? 'GET'} ${url}`)
    const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? (JSON.parse(init.body) as Raw) : undefined

    for (const [prefix, fn] of this.externals) if (url.startsWith(prefix)) return fn(url, init)

    if (url.includes('securetoken@system.gserviceaccount.com')) {
      return this.ok({ keys: [{ ...this.google.jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }, { 'Cache-Control': 'public, max-age=3600' })
    }
    if (url === 'https://oauth2.googleapis.com/token') return this.ok({ access_token: 'tok', expires_in: 3600 })
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return this.ok(this.turnstile)

    const docsBase = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
    if (url.startsWith(docsBase)) {
      const rest = url.slice(docsBase.length)
      if (rest.endsWith(':runQuery')) return this.runQuery(body as Raw, rest.slice(1, -':runQuery'.length))
      if (rest === ':commit') return this.commit(body as Raw)
      if (rest === ':batchGet') {
        const names = (body as { documents: string[] }).documents
        return this.ok(
          names.map((n) => {
            const path = n.split('/documents/')[1]
            const d = this.docs.get(path)
            return d ? { found: this.raw(path, d) } : { missing: n }
          }),
        )
      }
      const path = rest.replace(/^\//, '')
      const d = this.docs.get(path)
      return d ? this.ok(this.raw(path, d)) : new Response('{}', { status: 404 })
    }

    const idBase = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`
    if (url.startsWith(idBase)) return this.identity(url.slice(idBase.length), body ?? {})
    return new Response('unexpected ' + url, { status: 500 })
  }

  private runQuery(q: Raw, parent = ''): Response {
    const sq = q.structuredQuery as { from: { collectionId: string }[]; where?: Raw; limit?: number }
    const col = sq.from[0].collectionId
    type FF = { fieldFilter: { field: { fieldPath: string }; op: string; value: Raw } }
    const filters: FF[] = !sq.where
      ? []
      : 'compositeFilter' in sq.where
        ? ((sq.where.compositeFilter as { filters: FF[] }).filters)
        : [sq.where as unknown as FF]
    const base = parent ? `${parent}/${col}` : col
    const rows = this.list(base)
      .filter((r) =>
        filters.every(({ fieldFilter: f }) => {
          const want = decodeValue(f.value as never)
          const have = r.data[f.field.fieldPath]
          if (f.op === 'EQUAL') return have === want
          if (f.op === 'GREATER_THAN_OR_EQUAL') return typeof have === 'string' ? have >= String(want) : Number(have) >= Number(want)
          return Number(have) < Number(want)
        }),
      )
      .sort((x, y) => {
        // Firestore mengurutkan menurut kolom ketidaksamaan lebih dulu, lalu nama dokumen.
        const f = filters.find(({ fieldFilter }) => fieldFilter.op === 'GREATER_THAN_OR_EQUAL')?.fieldFilter.field.fieldPath
        const vx = f ? String(x.data[f] ?? '') : ''
        const vy = f ? String(y.data[f] ?? '') : ''
        return vx < vy ? -1 : vx > vy ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0
      })
      .slice(0, sq.limit ?? 100)
    return this.ok(rows.length ? rows.map((r) => ({ document: this.raw(`${base}/${r.id}`, this.docs.get(`${base}/${r.id}`) as StoredDoc) })) : [{ readTime: 'x' }])
  }

  /** Commit atomik: semua prasyarat diperiksa dulu; satu gagal berarti tidak ada yang berubah. */
  private commit(b: Raw): Response {
    this.beforeCommit?.()
    this.beforeCommit = undefined
    type W = {
      update?: { name: string; fields: Raw }
      delete?: string
      updateMask?: { fieldPaths: string[] }
      currentDocument?: { exists?: boolean; updateTime?: string }
      updateTransforms?: { fieldPath: string; setToServerValue: string }[]
    }
    const writes = b.writes as W[]
    const pathOf = (n: string) => n.split('/documents/')[1]
    // Invarian audit: setiap commit yang mengubah data harus memuat catatan audit di commit yang SAMA.
    // Pengecualian (dengan alasan) ada di AUDIT_EXEMPT. Pelanggaran dicatat dan gagal di akhir pengujian.
    const touched = writes.map((w) => pathOf(w.update?.name ?? (w.delete as string)))
    if (!touched.some((p) => p.startsWith('auditLog/')) && !touched.every((p) => AUDIT_EXEMPT.some((re) => re.test(p)))) {
      FakeBackend.auditViolations.push(touched.join(', '))
    }
    for (const w of writes) {
      const path = pathOf(w.update?.name ?? (w.delete as string))
      const cur = this.docs.get(path)
      const pc = w.currentDocument
      if (pc?.exists === false && cur) return new Response('{"error":{"status":"ALREADY_EXISTS"}}', { status: 409 })
      if (pc?.exists === true && !cur) return new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 })
      if (pc?.updateTime && (!cur || this.ver(cur) !== pc.updateTime)) return new Response('{"error":{"status":"FAILED_PRECONDITION"}}', { status: 409 })
    }
    for (const w of writes) {
      const path = pathOf(w.update?.name ?? (w.delete as string))
      if (w.delete) {
        this.docs.delete(path)
        continue
      }
      const incoming = Object.fromEntries(Object.entries(w.update?.fields ?? {}).map(([k, v]) => [k, decodeValue(v as never)]))
      const cur = this.docs.get(path)
      let data: Raw
      if (w.updateMask) {
        data = { ...(cur?.data ?? {}) }
        for (const f of w.updateMask.fieldPaths) {
          if (f in incoming) data[f] = incoming[f]
          else delete data[f]
        }
      } else data = incoming
      for (const t of w.updateTransforms ?? []) data[t.fieldPath] = new Date().toISOString()
      this.docs.set(path, { data, version: ++this.clock })
    }
    return this.ok({ writeResults: [] })
  }

  private identity(path: string, b: Raw): Response {
    if (path === '/accounts') {
      const email = String(b.email)
      if ([...this.auth.values()].some((u) => u.email === email)) return new Response('{"error":{"message":"EMAIL_EXISTS"}}', { status: 400 })
      const uid = `auth-${++this.uidSeq}`
      this.auth.set(uid, { uid, email, password: String(b.password), disabled: false })
      return this.ok({ localId: uid })
    }
    if (path === '/accounts:update') {
      if (this.failAuthUpdate) return new Response('{}', { status: 500 })
      const u = this.auth.get(String(b.localId))
      if (!u) return new Response('{"error":{"message":"USER_NOT_FOUND"}}', { status: 400 })
      if (b.password !== undefined) u.password = String(b.password)
      if (b.disableUser !== undefined) u.disabled = b.disableUser === true
      if (b.validSince !== undefined) u.validSince = String(b.validSince)
      return this.ok({ localId: u.uid })
    }
    if (path === '/accounts:delete') {
      this.auth.delete(String(b.localId))
      return this.ok({})
    }
    return new Response('unexpected ' + path, { status: 500 })
  }
}

export function makeEnv(sa: ReturnType<typeof rsa>, over: Partial<Env> = {}): Env {
  return {
    FIREBASE_PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: 'https://wkngroup-datahub.web.app,http://localhost:5173',
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'wkn-worker@x.iam.gserviceaccount.com', private_key: sa.pem }),
    ...over,
  }
}

export type { Doc }
