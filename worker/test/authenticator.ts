import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto'
import { b64urlEncode } from '../src/lib/encoding'

type V = number | string | Uint8Array | V[] | Map<V, V>

/** Penyandi CBOR minimal untuk membuat attestationObject uji. */
export function cborEncode(v: V): Uint8Array {
  const head = (major: number, n: number): number[] => {
    if (n < 24) return [(major << 5) | n]
    if (n < 256) return [(major << 5) | 24, n]
    return [(major << 5) | 25, n >> 8, n & 255]
  }
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v))
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v)
    return Uint8Array.from([...head(3, b.length), ...b])
  }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v])
  if (Array.isArray(v)) return Uint8Array.from([...head(4, v.length), ...v.flatMap((x) => [...cborEncode(x)])])
  const out: number[] = [...head(5, v.size)]
  for (const [k, x] of v) out.push(...cborEncode(k), ...cborEncode(x))
  return Uint8Array.from(out)
}

const sha = (d: Uint8Array | string) => new Uint8Array(createHash('sha256').update(d).digest())
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]))
const u32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])

export interface Flags {
  up?: boolean
  uv?: boolean
}

/** Autentikator virtual: membuat pendaftaran dan pernyataan WebAuthn yang sah (atau sengaja rusak). */
export class VirtualAuthenticator {
  credentialId = new Uint8Array(randomBytes(32))
  signCount = 0
  readonly priv: KeyObject
  readonly jwk: JsonWebKey
  constructor(
    readonly alg: 'ES256' | 'RS256' = 'ES256',
    readonly rpId = 'wkngroup-datahub.web.app',
    readonly origin = 'https://wkngroup-datahub.web.app',
  ) {
    const kp = alg === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 })
    this.priv = kp.privateKey
    this.jwk = kp.publicKey.export({ format: 'jwk' })
  }
  get id() {
    return b64urlEncode(this.credentialId)
  }

  private cose(algOverride?: number): Map<V, V> {
    const d = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))
    if (this.alg === 'ES256') return new Map<V, V>([[1, 2], [3, algOverride ?? -7], [-1, 1], [-2, d(this.jwk.x as string)], [-3, d(this.jwk.y as string)]])
    return new Map<V, V>([[1, 3], [3, algOverride ?? -257], [-1, d(this.jwk.n as string)], [-2, d(this.jwk.e as string)]])
  }

  private flags(f: Flags, extra = 0) {
    return ((f.up === false ? 0 : 1) | (f.uv === false ? 0 : 4) | extra) & 255
  }

  clientData(type: string, challenge: string, origin = this.origin): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  }

  /** Respons credentials.create(). */
  register(challenge: string, opt: { flags?: Flags; rpId?: string; origin?: string; type?: string; algOverride?: number; credentialId?: Uint8Array; challengeOverride?: string } = {}) {
    const credId = opt.credentialId ?? this.credentialId
    const attested = cat(new Uint8Array(16), Uint8Array.from([credId.length >> 8, credId.length & 255]), credId, cborEncode(this.cose(opt.algOverride)))
    const authData = cat(sha(opt.rpId ?? this.rpId), Uint8Array.from([this.flags(opt.flags ?? {}, 0x40)]), u32(this.signCount), attested)
    const attestationObject = cborEncode(new Map<V, V>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
    return {
      credentialId: b64urlEncode(this.credentialId),
      clientDataJSON: b64urlEncode(this.clientData(opt.type ?? 'webauthn.create', opt.challengeOverride ?? challenge, opt.origin)),
      attestationObject: b64urlEncode(attestationObject),
    }
  }

  /** Respons credentials.get(). */
  assert(challenge: string, uid: string, opt: { flags?: Flags; rpId?: string; origin?: string; type?: string; counter?: number; signer?: KeyObject; userHandle?: string | null; credentialId?: Uint8Array } = {}) {
    this.signCount = opt.counter ?? this.signCount + 1
    const authData = cat(sha(opt.rpId ?? this.rpId), Uint8Array.from([this.flags(opt.flags ?? {})]), u32(this.signCount))
    const clientDataJSON = this.clientData(opt.type ?? 'webauthn.get', challenge, opt.origin)
    const data = cat(authData, sha(clientDataJSON))
    const key = opt.signer ?? this.priv
    const sig = this.alg === 'ES256' ? createSign('sha256').update(data).sign({ key, dsaEncoding: 'der' }) : createSign('RSA-SHA256').update(data).sign(key)
    return {
      credentialId: b64urlEncode(opt.credentialId ?? this.credentialId),
      clientDataJSON: b64urlEncode(clientDataJSON),
      authenticatorData: b64urlEncode(authData),
      signature: b64urlEncode(new Uint8Array(sig)),
      userHandle: opt.userHandle === null ? '' : b64urlEncode(new TextEncoder().encode(opt.userHandle ?? uid)),
    }
  }
}
