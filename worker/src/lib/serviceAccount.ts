import { emulatorEnabled, endpoints, type Env } from '../env'
import { b64urlEncode, pemToPkcs8 } from './encoding'

export interface ServiceAccount {
  client_email: string
  private_key: string
  project_id?: string
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let sa: Partial<ServiceAccount>
  try {
    sa = JSON.parse(raw) as Partial<ServiceAccount>
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid')
  }
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT tidak lengkap')
  return { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id }
}

async function signJwt(sa: ServiceAccount, claims: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const head = b64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64urlEncode(JSON.stringify(claims))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${b64urlEncode(new Uint8Array(sig))}`
}

const IDENTITY_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit'

/** Custom token Firebase untuk uid tertentu (berlaku 1 jam; sesi klien tetap permanen lewat refresh token). */
export async function createCustomToken(sa: ServiceAccount, uid: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  return signJwt(sa, { iss: sa.client_email, sub: sa.client_email, aud: IDENTITY_AUD, iat, exp: iat + 3600, uid })
}

let cached: { token: string; exp: number } | null = null

/** Access token OAuth untuk memanggil REST API Google atas nama service account. */
export async function getAccessToken(env: Env, sa: ServiceAccount): Promise<string> {
  if (emulatorEnabled(env)) return 'owner'
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token
  const assertion = await signJwt(sa, {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: endpoints(env).tokenUrl,
    iat: now,
    exp: now + 3600,
  })
  const res = await fetch(endpoints(env).tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`Gagal meminta access token (${res.status})`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: json.access_token, exp: now + json.expires_in }
  return json.access_token
}

export function resetAccessTokenCache(): void {
  cached = null
}
