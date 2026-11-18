import { config } from '../config'
import { api, ApiError } from './api'

export type BiometricKind = 'face' | 'fingerprint'

const STORE = 'wkn.biometric.v2'

// ---------- base64url ----------
export const b64urlEncode = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const b64urlDecode = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const kindLabel = (k: BiometricKind) => (k === 'face' ? 'wajah (Face ID)' : 'sidik jari')

// ---------- Dukungan dan jenis ikon ----------

/**
 * "Didukung" berarti ada autentikator platform dengan verifikasi pengguna (sidik jari, wajah, ATAU kunci
 * layar/PIN perangkat). WebAuthn tidak dapat memaksa biometrik atau mengetahui jenisnya.
 */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export interface DeviceHints {
  ua: string
  platform: string
  maxTouchPoints: number
  /** sisi terpanjang layar dalam piksel CSS */
  longSide: number
}

export function currentHints(): DeviceHints {
  return {
    ua: navigator.userAgent,
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    longSide: Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0),
  }
}

/**
 * TEBAKAN berdasarkan perangkat, bukan fakta: tidak ada API web yang menyebutkan jenis biometrik.
 *  - iPhone: layar >= 812 (X dan setelahnya) memakai Face ID; di bawahnya Touch ID.
 *  - iPad: layar >= 1194 (iPad Pro) memakai Face ID; lainnya Touch ID.
 *  - Android, Mac, Windows, lainnya: sidik jari (Windows Hello bisa wajah; tidak dapat dibedakan).
 */
export function detectBiometricKind(h: DeviceHints = currentHints()): BiometricKind {
  const iPhone = /iPhone/.test(h.ua)
  const iPad = /iPad/.test(h.ua) || (h.platform === 'MacIntel' && h.maxTouchPoints > 1) // iPadOS menyamar sebagai Mac
  if (iPhone) return h.longSide >= 812 ? 'face' : 'fingerprint'
  if (iPad) return h.longSide >= 1194 ? 'face' : 'fingerprint'
  return 'fingerprint'
}

/** Nama perangkat singkat untuk daftar perangkat, mis. "Chrome di Android". */
export function describeDevice(ua: string = navigator.userAgent): string {
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'perangkat'
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  return `${br} di ${os}`
}

// ---------- Penyimpanan lokal (perangkat ini) ----------
// Disimpan PER AKUN: satu perangkat dapat dipakai beberapa akun, dan tiap akun perlu ajakan/pengaturannya sendiri.

interface LocalItem {
  id: string
  uid: string
  kind: BiometricKind
}
interface Local {
  items: LocalItem[]
}

function readItems(): LocalItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Local> | null
    if (v && Array.isArray(v.items)) {
      return v.items
        .filter((x): x is LocalItem => !!x && typeof x.id === 'string' && typeof x.uid === 'string')
        .map((x) => ({ ...x, kind: x.kind === 'face' ? 'face' : 'fingerprint' }))
    }
  } catch {
    /* penyimpanan dapat diblokir atau rusak */
  }
  return []
}
function writeItems(items: LocalItem[]): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ items }))
  } catch {
    /* tanpa penyimpanan, login tetap bisa lewat passkey yang ditemukan (discoverable) */
  }
}

/** Semua id kredensial yang diketahui perangkat ini (untuk allowCredentials) dan jenis ikon terakhir. */
export function localBiometric(): { ids: string[]; kind: BiometricKind } {
  const items = readItems()
  return {
    ids: items.map((i) => i.id),
    kind: items.length ? items[items.length - 1].kind : detectBiometricKind(),
  }
}
/** Tanpa uid: apakah perangkat ini punya passkey siapa pun (untuk halaman login). Dengan uid: milik akun itu. */
export const hasLocalBiometric = (uid?: string): boolean => readItems().some((i) => !uid || i.uid === uid)
export function rememberCredential(id: string, kind: BiometricKind, uid: string): void {
  writeItems([...readItems().filter((i) => i.id !== id), { id, uid, kind }])
}
/** Melupakan satu id; tanpa argumen, melupakan semuanya. */
export function forgetCredential(id?: string): void {
  writeItems(id ? readItems().filter((i) => i.id !== id) : [])
}

// ---------- Pemanggilan WebAuthn ----------
// PENTING (Safari/iOS): credentials.create/get harus dipanggil langsung dari isyarat pengguna (ketukan),
// tanpa menunggu jaringan di antaranya. Karena itu tantangan diambil SEBELUM tombol ditekan, dan fungsi di
// bawah ini sengaja BUKAN async: panggilan ke browser terjadi sinkron di dalam penangan klik.

export interface RegisterOptions {
  challenge: string
  challengeToken: string
  rpId: string
  user: { id: string; name: string; displayName: string }
  exclude: string[]
}
export interface LoginOptions {
  challenge: string
  challengeToken: string
  rpId: string
}

export const fetchRegisterOptions = () => api<RegisterOptions>('/auth/webauthn/register-options', {})

export async function fetchLoginOptions(): Promise<LoginOptions> {
  const res = await fetch(`${config.apiUrl}/auth/webauthn/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new ApiError('Tidak dapat menyiapkan verifikasi biometrik.', 'error', res.status)
  return (await res.json()) as LoginOptions
}

export interface RegistrationPayload {
  challengeToken: string
  credentialId: string
  clientDataJSON: string
  attestationObject: string
  kind: BiometricKind
  label: string
}

export function startRegistration(o: RegisterOptions, kind: BiometricKind): Promise<RegistrationPayload> {
  const p = navigator.credentials.create({
    publicKey: {
      rp: { id: o.rpId, name: 'WKN Group Data Hub' },
      user: {
        id: new TextEncoder().encode(o.user.id),
        name: o.user.name,
        displayName: o.user.displayName || o.user.name,
      },
      challenge: b64urlDecode(o.challenge),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      excludeCredentials: o.exclude.map((id) => ({ type: 'public-key' as const, id: b64urlDecode(id) })),
      attestation: 'none',
      timeout: 60_000,
    },
  }) as Promise<PublicKeyCredential | null>
  return p.then((cred) => {
    if (!cred) throw new Error('dibatalkan')
    const r = cred.response as AuthenticatorAttestationResponse
    return {
      challengeToken: o.challengeToken,
      credentialId: b64urlEncode(cred.rawId),
      clientDataJSON: b64urlEncode(r.clientDataJSON),
      attestationObject: b64urlEncode(r.attestationObject),
      kind,
      label: describeDevice(),
    }
  })
}

export interface AssertionPayload {
  challengeToken: string
  credentialId: string
  clientDataJSON: string
  authenticatorData: string
  signature: string
  userHandle: string
}

export function startAssertion(o: LoginOptions, knownIds: string[]): Promise<AssertionPayload> {
  const p = navigator.credentials.get({
    publicKey: {
      rpId: o.rpId,
      challenge: b64urlDecode(o.challenge),
      userVerification: 'required',
      timeout: 60_000,
      // Bila id lokal ada, ajukan langsung; bila tidak, browser menawarkan passkey yang ditemukan (discoverable).
      allowCredentials: knownIds.map((id) => ({ type: 'public-key' as const, id: b64urlDecode(id) })),
    },
  }) as Promise<PublicKeyCredential | null>
  return p.then((cred) => {
    if (!cred) throw new Error('dibatalkan')
    const r = cred.response as AuthenticatorAssertionResponse
    return {
      challengeToken: o.challengeToken,
      credentialId: b64urlEncode(cred.rawId),
      clientDataJSON: b64urlEncode(r.clientDataJSON),
      authenticatorData: b64urlEncode(r.authenticatorData),
      signature: b64urlEncode(r.signature),
      userHandle: r.userHandle ? b64urlEncode(r.userHandle) : '',
    }
  })
}

export async function postAssertion(p: AssertionPayload): Promise<{ customToken: string }> {
  const res = await fetch(`${config.apiUrl}/auth/webauthn/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  })
  const j = (await res.json().catch(() => ({}))) as { customToken?: string; error?: string; message?: string }
  if (!res.ok || !j.customToken)
    throw new ApiError(j.message ?? 'Login biometrik gagal.', j.error ?? 'error', res.status)
  return { customToken: j.customToken }
}

export async function submitRegistration(p: RegistrationPayload, uid: string): Promise<{ id: string }> {
  const out = await api<{ id: string }>('/auth/webauthn/register', p as unknown as Record<string, unknown>)
  rememberCredential(p.credentialId, p.kind, uid)
  return out
}

export const removeCredentialOnServer = (id: string) => api('/auth/webauthn/remove', { id })

/** Pesan Indonesia untuk kesalahan WebAuthn dari browser. */
export function webauthnErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || (e instanceof Error && e.message === 'dibatalkan'))
    return 'Verifikasi dibatalkan atau waktunya habis.'
  if (name === 'InvalidStateError') return 'Perangkat ini sudah terdaftar.'
  if (name === 'SecurityError') return 'Browser menolak karena alamat situs tidak cocok.'
  if (name === 'NotSupportedError') return 'Perangkat ini belum mendukung login biometrik.'
  if (e instanceof Error && e.message) return e.message
  return 'Login biometrik gagal. Coba lagi.'
}
