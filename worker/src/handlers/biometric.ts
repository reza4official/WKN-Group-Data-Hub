import type { Env } from '../env'
import type { Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, CommitError, getDocument, queryDocuments } from '../lib/firestore'
import { b64urlDecode } from '../lib/encoding'
import { HttpError, oneOf, optStr, str, type Body } from '../lib/http'
import { throttle } from '../lib/rateLimit'
import { createCustomToken, type ServiceAccount } from '../lib/serviceAccount'
import {
  ALG_ES256,
  ALG_RS256,
  checkClientData,
  coseToKey,
  createChallenge,
  credentialDocId,
  equalBytes,
  parseAttestationObject,
  parseAuthData,
  rpIdOf,
  sha256,
  verifyAssertionSignature,
  verifyChallenge,
} from '../lib/webauthn'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

const MAX_CREDENTIALS = 5
const KINDS = ['face', 'fingerprint'] as const
const FAIL = () => new HttpError(401, 'biometric_failed', 'Login biometrik gagal. Masuk dengan username dan password, lalu aktifkan ulang biometrik.')
const REG_FAIL = (msg = 'Pendaftaran biometrik gagal.') => new HttpError(400, 'biometric_register_failed', msg)

const allowedOrigins = (env: Env): string[] => (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

function requestOrigin(req: Request, env: Env): string {
  const o = req.headers.get('Origin')
  if (!o || !allowedOrigins(env).includes(o)) throw new HttpError(400, 'bad_request', 'Origin tidak diizinkan untuk biometrik.')
  return o
}

const bytes = (body: Body, key: string, max = 8192): Uint8Array => {
  const s = str(body, key, { max, label: key })
  try {
    return b64urlDecode(s)
  } catch {
    throw new HttpError(400, 'bad_request', 'Data biometrik tidak valid.')
  }
}

// ---------- Pendaftaran (harus sudah masuk) ----------

export async function registerOptions(c: Ctx, _body: Body, req: Request) {
  const origin = requestOrigin(req, c.env)
  const { challenge, challengeToken } = await createChallenge(c.sa, 'reg', c.actor.uid)
  const mine = await queryDocuments(c.env, c.sa, 'webauthnCredentials', [{ field: 'uid', op: 'EQUAL', value: c.actor.uid }], 50)
  return {
    challenge,
    challengeToken,
    rpId: rpIdOf(origin),
    user: { id: c.actor.uid, name: c.actor.username, displayName: c.actor.name },
    exclude: mine.map((d) => String(d.data.credentialId)),
  }
}

export async function registerCredential(c: Ctx, body: Body, req: Request): Promise<{ id: string }> {
  const origin = requestOrigin(req, c.env)
  const payload = await verifyChallenge(c.sa, str(body, 'challengeToken', { max: 2000 }), 'reg')
  if (payload.u !== c.actor.uid) throw REG_FAIL()
  const credentialId = str(body, 'credentialId', { max: 1400 })
  const kind = oneOf(body, 'kind', KINDS, 'Jenis biometrik')
  const label = optStr(body, 'label', 80, 'Nama perangkat') || 'Perangkat ini'

  try {
    checkClientData(bytes(body, 'clientDataJSON'), 'webauthn.create', payload.c, allowedOrigins(c.env), origin)
  } catch {
    throw REG_FAIL()
  }
  let ad
  try {
    ad = parseAuthData(parseAttestationObject(bytes(body, 'attestationObject', 16384)))
  } catch {
    throw REG_FAIL()
  }
  const rpId = rpIdOf(origin)
  if (!equalBytes(ad.rpIdHash, await sha256(rpId))) throw REG_FAIL()
  if (!ad.up || !ad.uv) throw REG_FAIL('Perangkat tidak melakukan verifikasi pengguna (biometrik atau kunci layar).')
  let given: Uint8Array
  try {
    given = b64urlDecode(credentialId)
  } catch {
    throw REG_FAIL()
  }
  if (!ad.attested || !equalBytes(ad.attested.credentialId, given)) throw REG_FAIL()
  let key
  try {
    key = coseToKey(ad.attested.cose)
  } catch {
    throw REG_FAIL('Jenis kunci perangkat belum didukung.')
  }
  if (key.alg !== ALG_ES256 && key.alg !== ALG_RS256) throw REG_FAIL()

  const mine = await queryDocuments(c.env, c.sa, 'webauthnCredentials', [{ field: 'uid', op: 'EQUAL', value: c.actor.uid }], 50)
  if (mine.length >= MAX_CREDENTIALS) throw new HttpError(409, 'limit', `Maksimal ${MAX_CREDENTIALS} perangkat. Hapus salah satu dulu.`)

  const id = await credentialDocId(credentialId)
  try {
    await commit(c.env, c.sa, [
      {
        path: `webauthnCredentials/${id}`,
        data: { uid: c.actor.uid, credentialId, rpId, alg: key.alg, jwk: key.jwk, signCount: ad.signCount, kind, label, lastUsedAt: null, lastNonce: null },
        precondition: { exists: false },
        serverTime: ['createdAt'],
      },
      auditWrite(c.actor, 'biometric.register', { type: 'biometric', id, label: c.actor.username }, { perangkat: label, jenis: kind }),
    ])
  } catch (e) {
    if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'already_registered', 'Perangkat ini sudah terdaftar.')
    throw e
  }
  return { id }
}

export async function removeCredential(c: Ctx, body: Body): Promise<void> {
  const id = str(body, 'id', { max: 100 })
  const cred = await getDocument(c.env, c.sa, `webauthnCredentials/${id}`)
  if (!cred || cred.data.uid !== c.actor.uid) throw new HttpError(404, 'not_found', 'Perangkat tidak ditemukan.')
  await commit(c.env, c.sa, [
    { path: `webauthnCredentials/${id}`, delete: true, precondition: cred.updateTime ? { updateTime: cred.updateTime } : { exists: true } },
    auditWrite(c.actor, 'biometric.remove', { type: 'biometric', id, label: c.actor.username }, { perangkat: String(cred.data.label ?? '') }),
  ]).catch((e) => {
    if (e instanceof CommitError && e.conflict) return // sudah terhapus
    throw e
  })
}

// ---------- Login (publik) ----------

export async function loginOptions(req: Request, env: Env, sa: ServiceAccount) {
  const origin = requestOrigin(req, env)
  await throttle(env, req.headers.get('CF-Connecting-IP'), 'wo', 60)
  const { challenge, challengeToken } = await createChallenge(sa, 'login')
  return { challenge, challengeToken, rpId: rpIdOf(origin) }
}

/**
 * Login biometrik: memverifikasi pernyataan (assertion) WebAuthn terhadap kunci publik yang tersimpan,
 * lalu menerbitkan custom token. Semua kegagalan verifikasi memberi jawaban yang sama.
 */
export async function loginWithAssertion(body: Body, req: Request, env: Env, sa: ServiceAccount): Promise<{ customToken: string }> {
  const origin = requestOrigin(req, env)
  await throttle(env, req.headers.get('CF-Connecting-IP'), 'wl', 30)
  const payload = await verifyChallenge(sa, str(body, 'challengeToken', { max: 2000 }), 'login')
  const credentialId = str(body, 'credentialId', { max: 1400 })
  const clientDataJSON = bytes(body, 'clientDataJSON')
  const authDataRaw = bytes(body, 'authenticatorData')
  const signature = bytes(body, 'signature', 1024)
  let userHandle: Uint8Array | null = null
  if (typeof body.userHandle === 'string' && body.userHandle) {
    try {
      userHandle = b64urlDecode(body.userHandle)
    } catch {
      throw FAIL()
    }
  }

  try {
    checkClientData(clientDataJSON, 'webauthn.get', payload.c, allowedOrigins(env), origin)
  } catch {
    throw FAIL()
  }
  let id: string
  try {
    id = await credentialDocId(credentialId)
  } catch {
    throw FAIL() // id kredensial bukan base64url yang valid
  }
  const cred = await getDocument(env, sa, `webauthnCredentials/${id}`)
  if (!cred) throw FAIL()
  const rpId = String(cred.data.rpId)
  if (rpId !== rpIdOf(origin)) throw FAIL()

  let ad
  try {
    ad = parseAuthData(authDataRaw)
  } catch {
    throw FAIL()
  }
  if (!equalBytes(ad.rpIdHash, await sha256(rpId)) || !ad.up || !ad.uv) throw FAIL()

  const uid = String(cred.data.uid)
  if (userHandle && new TextDecoder().decode(userHandle) !== uid) throw FAIL()

  let valid = false
  try {
    valid = await verifyAssertionSignature({ alg: Number(cred.data.alg), jwk: cred.data.jwk as JsonWebKey }, authDataRaw, clientDataJSON, signature)
  } catch {
    valid = false
  }
  if (!valid) throw FAIL()

  // Penghitung: Apple dan passkey tersinkron selalu mengirim 0; hanya nilai bukan nol yang mundur yang ditolak.
  const stored = Number(cred.data.signCount ?? 0)
  if (ad.signCount > 0 && stored > 0 && ad.signCount <= stored) throw FAIL()
  // Sekali pakai: pernyataan yang sama (tantangan yang sama) tidak dapat dipakai ulang.
  if (cred.data.lastNonce === payload.n) throw FAIL()

  const user = await getDocument(env, sa, `users/${uid}`)
  if (!user) throw FAIL()
  if (user.data.disabled !== false) throw new HttpError(403, 'disabled', 'Akun ini dinonaktifkan.')

  try {
    await commit(env, sa, [
      {
        path: `webauthnCredentials/${id}`,
        data: { signCount: Math.max(stored, ad.signCount), lastNonce: payload.n },
        mask: ['signCount', 'lastNonce', 'lastUsedAt'],
        precondition: cred.updateTime ? { updateTime: cred.updateTime } : { exists: true },
        serverTime: ['lastUsedAt'],
      },
    ])
  } catch (e) {
    if (e instanceof CommitError && e.conflict) throw FAIL() // penggunaan ganda bersamaan
    throw e
  }
  return { customToken: await createCustomToken(sa, uid) }
}
