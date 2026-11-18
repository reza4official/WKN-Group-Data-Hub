import { emulatorEnabled, endpoints, type Env } from '../env'
import { b64urlDecode, decodeJson } from './encoding'

export interface VerifiedToken {
  uid: string
  email?: string
  emailVerified: boolean
  provider?: string
  /** Waktu (detik epoch) autentikasi terakhir; diperbarui saat pengguna memasukkan ulang password. */
  authTime?: number
}

interface Header {
  alg: string
  kid?: string
}
interface Claims {
  aud?: string
  iss?: string
  sub?: string
  iat?: number
  exp?: number
  auth_time?: number
  email?: string
  email_verified?: boolean
  firebase?: { sign_in_provider?: string }
}
interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

export class AuthError extends Error {}

let jwksCache: { keys: Jwk[]; exp: number } | null = null

export function resetJwksCache(): void {
  jwksCache = null
}

async function getJwks(env: Env): Promise<Jwk[]> {
  const now = Date.now()
  if (jwksCache && jwksCache.exp > now) return jwksCache.keys
  const res = await fetch(endpoints(env).jwksUrl)
  if (!res.ok) throw new Error(`Gagal mengambil JWKS (${res.status})`)
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1]
  const { keys } = (await res.json()) as { keys: Jwk[] }
  jwksCache = { keys, exp: now + (maxAge ? Number(maxAge) * 1000 : 300_000) }
  return keys
}

/**
 * Memverifikasi ID token Firebase: tanda tangan RS256 (JWKS Google), aud, iss, exp, iat, sub.
 * Token tanpa tanda tangan (alg "none") hanya diterima dalam mode emulator yang terkunci
 * (USE_EMULATOR=true dan ID proyek diawali "demo-").
 */
export async function verifyIdToken(token: string, env: Env): Promise<VerifiedToken> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError('Format token salah')
  let header: Header
  let claims: Claims
  try {
    header = decodeJson<Header>(parts[0])
    claims = decodeJson<Claims>(parts[1])
  } catch {
    throw new AuthError('Token tidak dapat dibaca')
  }

  if (header.alg === 'none') {
    if (!emulatorEnabled(env)) throw new AuthError('Algoritma token tidak diizinkan')
  } else if (header.alg === 'RS256') {
    if (!header.kid) throw new AuthError('Token tanpa kid')
    const jwk = (await getJwks(env)).find((k) => k.kid === header.kid)
    if (!jwk) throw new AuthError('Kunci penandatangan tidak dikenal')
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    if (!ok) throw new AuthError('Tanda tangan token tidak valid')
  } else {
    throw new AuthError('Algoritma token tidak diizinkan')
  }

  const now = Math.floor(Date.now() / 1000)
  const skew = 60
  const project = env.FIREBASE_PROJECT_ID
  if (claims.aud !== project) throw new AuthError('Audience token salah')
  if (claims.iss !== `https://securetoken.google.com/${project}`) throw new AuthError('Issuer token salah')
  if (typeof claims.exp !== 'number' || claims.exp < now - skew) throw new AuthError('Token kedaluwarsa')
  if (typeof claims.iat !== 'number' || claims.iat > now + skew) throw new AuthError('Waktu token tidak valid')
  if (typeof claims.sub !== 'string' || !claims.sub) throw new AuthError('Token tanpa subjek')

  return {
    uid: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    provider: claims.firebase?.sign_in_provider,
    authTime: typeof claims.auth_time === 'number' ? claims.auth_time : undefined,
  }
}
