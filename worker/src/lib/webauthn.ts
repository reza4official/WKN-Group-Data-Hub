import { b64urlDecode, b64urlEncode } from './encoding'
import { decodeCbor, readItem, type CborValue } from './cbor'
import { HttpError } from './http'
import type { ServiceAccount } from './serviceAccount'

export const ALG_ES256 = -7
export const ALG_RS256 = -257
const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40
export const CHALLENGE_TTL_SECONDS = 120

const te = new TextEncoder()

export const sha256 = async (data: Uint8Array | string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : (data as Uint8Array<ArrayBuffer>)))

export const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** Id dokumen kredensial: SHA-256 dari id kredensial (panjang tetap, aman sebagai kunci dokumen). */
export const credentialDocId = async (credentialIdB64: string): Promise<string> => hex(await sha256(b64urlDecode(credentialIdB64)))

// ---------- Tantangan bertanda (tanpa penyimpanan) ----------

interface ChallengePayload {
  /** jenis: reg (pendaftaran) atau login */
  t: 'reg' | 'login'
  /** uid pemilik (hanya pendaftaran) */
  u?: string
  /** nilai tantangan WebAuthn (base64url) */
  c: string
  /** nonce sekali pakai */
  n: string
  /** kedaluwarsa (detik epoch) */
  e: number
}

async function macKey(sa: ServiceAccount): Promise<CryptoKey> {
  const raw = await sha256(`wkn-webauthn-v1|${sa.private_key}`)
  return crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

const rand = (n: number) => b64urlEncode(crypto.getRandomValues(new Uint8Array(n)))

export async function createChallenge(sa: ServiceAccount, type: 'reg' | 'login', uid?: string): Promise<{ challenge: string; challengeToken: string }> {
  const payload: ChallengePayload = { t: type, ...(uid ? { u: uid } : {}), c: rand(32), n: rand(12), e: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS }
  const body = b64urlEncode(JSON.stringify(payload))
  const mac = await crypto.subtle.sign('HMAC', await macKey(sa), te.encode(body))
  return { challenge: payload.c, challengeToken: `${body}.${b64urlEncode(new Uint8Array(mac))}` }
}

export async function verifyChallenge(sa: ServiceAccount, token: string, type: 'reg' | 'login'): Promise<ChallengePayload> {
  const bad = () => new HttpError(401, 'biometric_failed', 'Verifikasi biometrik gagal.')
  const [body, mac] = String(token).split('.')
  if (!body || !mac) throw bad()
  let ok = false
  let p: ChallengePayload
  try {
    ok = await crypto.subtle.verify('HMAC', await macKey(sa), b64urlDecode(mac) as Uint8Array<ArrayBuffer>, te.encode(body))
    p = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as ChallengePayload
  } catch {
    throw bad() // base64 atau JSON rusak
  }
  if (!ok) throw bad()
  if (p.t !== type || typeof p.e !== 'number' || p.e < Math.floor(Date.now() / 1000)) throw new HttpError(401, 'biometric_failed', 'Verifikasi biometrik kedaluwarsa. Coba lagi.')
  return p
}

// ---------- clientDataJSON ----------

export interface ClientData {
  type: string
  challenge: string
  origin: string
}

/** Memeriksa jenis, tantangan, dan origin (harus persis salah satu origin yang diizinkan, dan sama dengan origin permintaan). */
export function checkClientData(raw: Uint8Array, expectedType: 'webauthn.create' | 'webauthn.get', challenge: string, allowedOrigins: string[], requestOrigin: string | null): ClientData {
  let cd: ClientData
  try {
    cd = JSON.parse(new TextDecoder().decode(raw)) as ClientData
  } catch {
    throw new HttpError(401, 'biometric_failed', 'Verifikasi biometrik gagal.')
  }
  const fail = () => new HttpError(401, 'biometric_failed', 'Verifikasi biometrik gagal.')
  if (cd.type !== expectedType) throw fail()
  if (cd.challenge !== challenge) throw fail()
  if (!allowedOrigins.includes(cd.origin) || cd.origin !== requestOrigin) throw fail()
  return cd
}

export const rpIdOf = (origin: string): string => new URL(origin).hostname

// ---------- authenticatorData ----------

export interface AuthData {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  up: boolean
  uv: boolean
  attested?: { credentialId: Uint8Array; cose: Map<CborValue, CborValue> }
}

export function parseAuthData(buf: Uint8Array): AuthData {
  if (buf.length < 37) throw new Error('authenticatorData terlalu pendek')
  const flags = buf[32]
  const signCount = ((buf[33] << 24) | (buf[34] << 16) | (buf[35] << 8) | buf[36]) >>> 0
  const out: AuthData = { rpIdHash: buf.slice(0, 32), flags, signCount, up: (flags & FLAG_UP) !== 0, uv: (flags & FLAG_UV) !== 0 }
  if (flags & FLAG_AT) {
    if (buf.length < 55) throw new Error('data kredensial terpotong')
    const len = (buf[53] << 8) | buf[54]
    if (buf.length < 55 + len) throw new Error('id kredensial terpotong')
    const credentialId = buf.slice(55, 55 + len)
    const cose = readItem(buf, 55 + len).value
    if (!(cose instanceof Map)) throw new Error('kunci COSE tidak valid')
    out.attested = { credentialId, cose }
  }
  return out
}

export function parseAttestationObject(buf: Uint8Array): Uint8Array {
  const m = decodeCbor(buf)
  if (!(m instanceof Map)) throw new Error('attestationObject tidak valid')
  const ad = m.get('authData')
  if (!(ad instanceof Uint8Array)) throw new Error('authData tidak ada')
  return ad
}

export interface PublicKey {
  alg: number
  jwk: JsonWebKey
}

/** Mengubah kunci COSE menjadi JWK. Hanya ES256 (P-256) dan RS256 yang diizinkan. */
export function coseToKey(cose: Map<CborValue, CborValue>): PublicKey {
  const kty = cose.get(1)
  const alg = cose.get(3)
  if (kty === 2 && alg === ALG_ES256) {
    const crv = cose.get(-1)
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) throw new Error('kunci EC tidak valid')
    return { alg: ALG_ES256, jwk: { kty: 'EC', crv: 'P-256', x: b64urlEncode(x), y: b64urlEncode(y) } }
  }
  if (kty === 3 && alg === ALG_RS256) {
    const n = cose.get(-1)
    const e = cose.get(-2)
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) throw new Error('kunci RSA tidak valid')
    return { alg: ALG_RS256, jwk: { kty: 'RSA', n: b64urlEncode(n), e: b64urlEncode(e) } }
  }
  throw new Error('algoritma kunci tidak didukung')
}

/** Tanda tangan ECDSA WebAuthn berformat DER; WebCrypto meminta r||s mentah 64 byte. */
export function derToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('DER tidak valid')
  let p = 2
  if (der[1] & 0x80) p = 2 + (der[1] & 0x7f)
  const readInt = (): Uint8Array => {
    if (der[p] !== 0x02) throw new Error('DER tidak valid')
    const len = der[p + 1]
    let v = der.slice(p + 2, p + 2 + len)
    p += 2 + len
    while (v.length > 32 && v[0] === 0) v = v.slice(1)
    if (v.length > 32) throw new Error('DER tidak valid')
    const out = new Uint8Array(32)
    out.set(v, 32 - v.length)
    return out
  }
  const r = readInt()
  const s = readInt()
  const raw = new Uint8Array(64)
  raw.set(r, 0)
  raw.set(s, 32)
  return raw
}

export async function verifyAssertionSignature(key: PublicKey, authData: Uint8Array, clientDataJSON: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const signed = new Uint8Array(authData.length + 32)
  signed.set(authData, 0)
  signed.set(await sha256(clientDataJSON), authData.length)
  if (key.alg === ALG_ES256) {
    const k = await crypto.subtle.importKey('jwk', key.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derToRaw(signature) as Uint8Array<ArrayBuffer>, signed)
  }
  if (key.alg === ALG_RS256) {
    const k = await crypto.subtle.importKey('jwk', { ...key.jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, signature as Uint8Array<ArrayBuffer>, signed)
  }
  return false
}

export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i])
