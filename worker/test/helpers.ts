import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto'
import { b64urlEncode } from '../src/lib/encoding'
import type { Env } from '../src/env'

export const PROJECT = 'wkngroup-datahub'

export function rsaKeys(): { priv: KeyObject; pem: string; jwk: JsonWebKey } {
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

export function unsignedJwt(payload: object): string {
  return `${b64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64urlEncode(JSON.stringify(payload))}.`
}

export function claims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000)
  return {
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: 'stray-google-uid',
    iat: now - 10,
    exp: now + 3000,
    auth_time: now - 10,
    email: 'budi@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...over,
  }
}

export interface World {
  users: Record<string, Record<string, unknown>>
  deleted: string[]
  calls: string[]
}

const fsVal = (v: unknown) =>
  typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) }
const fsDoc = (id: string, data: Record<string, unknown>) => ({
  name: `projects/${PROJECT}/databases/(default)/documents/users/${id}`,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsVal(v)])),
})

/** Menggantikan fetch global dengan dunia palsu: JWKS Google, OAuth token, Firestore, Identity Toolkit. */
export function installFetch(world: World, jwk: JsonWebKey, kid: string): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    world.calls.push(`${init?.method ?? 'GET'} ${url}`)
    const ok = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } })
    if (url.includes('securetoken@system.gserviceaccount.com')) {
      return ok({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }, { 'Cache-Control': 'public, max-age=3600' })
    }
    if (url === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'tok', expires_in: 3600 })
    if (url.endsWith(':runQuery')) {
      const body = JSON.parse(String(init?.body)) as { structuredQuery: { where: { fieldFilter: { value: { stringValue: string } } } } }
      const email = body.structuredQuery.where.fieldFilter.value.stringValue
      const rows = Object.entries(world.users).filter(([, d]) => d.emailContact === email)
      return ok(rows.length ? rows.map(([id, d]) => ({ document: fsDoc(id, d) })) : [{ readTime: 'x' }])
    }
    const m = /\/documents\/users\/([^/]+)$/.exec(url)
    if (m) return world.users[m[1]] ? ok(fsDoc(m[1], world.users[m[1]])) : new Response('{}', { status: 404 })
    if (url.endsWith('/accounts:delete')) {
      world.deleted.push((JSON.parse(String(init?.body)) as { localId: string }).localId)
      return ok({})
    }
    return new Response('unexpected ' + url, { status: 500 })
  }) as typeof fetch
}

export function makeEnv(saPem: string, over: Partial<Env> = {}): Env {
  return {
    FIREBASE_PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: 'https://wkngroup-datahub.web.app,http://localhost:5173',
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'wkn-worker@x.iam.gserviceaccount.com', private_key: saPem }),
    ...over,
  }
}
