import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { derToRaw, parseAuthData } from '../src/lib/webauthn'
import { decodeCbor } from '../src/lib/cbor'
import { parseServiceAccount } from '../src/lib/serviceAccount'
import { createChallenge } from '../src/lib/webauthn'
import { cborEncode, VirtualAuthenticator } from './authenticator'
import { useWorld } from './world'

const w = useWorld()
afterEach(() => vi.useRealTimers())

const regOpts = (as: string) => w.post('/auth/webauthn/register-options', {}, as)
const loginOpts = () => w.post('/auth/webauthn/login-options', {})

async function enroll(uid: string, auth = new VirtualAuthenticator(), kind: 'face' | 'fingerprint' = 'fingerprint') {
  const o = await regOpts(uid)
  expect(o.status).toBe(200)
  const r = await w.post('/auth/webauthn/register', { challengeToken: o.body.challengeToken, kind, label: 'Chrome di Android', ...auth.register(o.body.challenge as string) }, uid)
  return { auth, res: r }
}
const login = async (auth: VirtualAuthenticator, uid: string, opt: Parameters<VirtualAuthenticator['assert']>[2] = {}, tokenOver?: string) => {
  const o = await loginOpts()
  return w.post('/auth/webauthn/login', { challengeToken: tokenOver ?? o.body.challengeToken, ...auth.assert(o.body.challenge as string, uid, opt) })
}

describe('pustaka', () => {
  it('CBOR: bulat, negatif, byte, teks, array, map bersarang', () => {
    const m = new Map<any, any>([[1, 2], [3, -7], [-1, new Uint8Array([1, 2, 3])], ['teks', [1, 'a', new Map()]]])
    const back = decodeCbor(cborEncode(m)) as Map<any, any>
    expect(back.get(3)).toBe(-7)
    expect(back.get(-1)).toEqual(new Uint8Array([1, 2, 3]))
    expect(back.get('teks')[1]).toBe('a')
    expect(() => decodeCbor(new Uint8Array([0xfa, 0, 0, 0, 0]))).toThrow() // float ditolak
    expect(() => decodeCbor(new Uint8Array([0x43, 1]))).toThrow() // terpotong
  })

  it('DER -> r||s: menangani bilangan berawalan nol dan pendek', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const { createSign } = require('node:crypto') as typeof import('node:crypto')
    for (let i = 0; i < 40; i++) {
      const sig = createSign('sha256').update(`x${i}`).sign({ key: privateKey, dsaEncoding: 'der' })
      const raw = derToRaw(new Uint8Array(sig))
      const p1363 = createSign('sha256').update(`x${i}`).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
      expect(raw.length).toBe(64)
      expect(Buffer.from(raw).length).toBe(p1363.length)
    }
    expect(() => derToRaw(new Uint8Array([1, 2, 3]))).toThrow()
  })

  it('authenticatorData terlalu pendek ditolak', () => {
    expect(() => parseAuthData(new Uint8Array(10))).toThrow()
  })
})

describe('pendaftaran passkey', () => {
  it('memerlukan login; mengembalikan tantangan dan daftar perangkat yang sudah ada', async () => {
    expect((await w.post('/auth/webauthn/register-options', {})).status).toBe(401)
    const o = await regOpts('u-pm1')
    expect(o.body).toMatchObject({ rpId: 'wkngroup-datahub.web.app', user: { id: 'u-pm1', name: 'pm1' }, exclude: [] })
    expect(String(o.body.challenge).length).toBeGreaterThan(30)
  })

  it('berhasil (ES256): menyimpan kunci publik, jenis, perangkat; tercatat di audit', async () => {
    const { auth, res } = await enroll('u-pm1')
    expect(res.status).toBe(200)
    const doc = w.be.getData(`webauthnCredentials/${res.body.id}`)!
    expect(doc).toMatchObject({ uid: 'u-pm1', credentialId: auth.id, rpId: 'wkngroup-datahub.web.app', alg: -7, kind: 'fingerprint', label: 'Chrome di Android', lastUsedAt: null })
    expect((doc.jwk as JsonWebKey).kty).toBe('EC')
    expect(JSON.stringify(doc)).not.toContain('PRIVATE')
    expect(w.lastAudit('biometric.register')).toMatchObject({ actorUid: 'u-pm1', targetType: 'biometric' })
    // perangkat yang sama tidak dapat didaftarkan dua kali, dan masuk ke daftar exclude
    const o = await regOpts('u-pm1')
    expect(o.body.exclude).toEqual([auth.id])
    const again = await w.post('/auth/webauthn/register', { challengeToken: o.body.challengeToken, kind: 'fingerprint', ...auth.register(o.body.challenge as string) }, 'u-pm1')
    expect(again.status).toBe(409)
  })

  it('berhasil (RS256)', async () => {
    const { res } = await enroll('u-pm1', new VirtualAuthenticator('RS256'), 'face')
    expect(res.status).toBe(200)
    expect(w.be.getData(`webauthnCredentials/${res.body.id}`)).toMatchObject({ alg: -257, kind: 'face' })
  })

  it('menolak: tantangan salah, token milik akun lain, token jenis login, token rusak, kedaluwarsa', async () => {
    const auth = new VirtualAuthenticator()
    const o = await regOpts('u-pm1')
    const send = (over: Record<string, unknown>, as = 'u-pm1') => w.post('/auth/webauthn/register', { challengeToken: o.body.challengeToken, kind: 'face', ...auth.register(o.body.challenge as string), ...over }, as)
    expect((await send({ ...auth.register('tantangan-lain') })).status).toBe(400)
    expect((await send({}, 'u-pm2')).status).toBe(400) // token milik pm1
    const lo = await loginOpts()
    expect((await send({ challengeToken: lo.body.challengeToken })).status).toBe(401) // jenis login
    expect((await send({ challengeToken: `${String(o.body.challengeToken).split('.')[0]}.AAAA` })).status).toBe(401)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 121_000)
    expect((await send({})).status).toBe(401) // kedaluwarsa
  })

  it('menolak: origin, rpId, tanpa UV, tanpa UP, id tidak cocok, tipe salah, algoritma tak didukung', async () => {
    const auth = new VirtualAuthenticator()
    const cases: [string, Parameters<VirtualAuthenticator['register']>[1]][] = [
      ['origin lain', { origin: 'https://jahat.example' }],
      ['rpId lain', { rpId: 'jahat.example' }],
      ['tanpa verifikasi pengguna', { flags: { uv: false } }],
      ['tanpa kehadiran pengguna', { flags: { up: false } }],
      ['jenis clientData salah', { type: 'webauthn.get' }],
      ['algoritma EdDSA', { algOverride: -8 }],
    ]
    for (const [name, opt] of cases) {
      const o = await regOpts('u-pm1')
      const r = await w.post('/auth/webauthn/register', { challengeToken: o.body.challengeToken, kind: 'face', ...auth.register(o.body.challenge as string, opt) }, 'u-pm1')
      expect(r.status, name).toBe(400)
    }
    // id kredensial di authData berbeda dari yang dikirim
    const o = await regOpts('u-pm1')
    const other = new VirtualAuthenticator()
    const body = { challengeToken: o.body.challengeToken, kind: 'face', ...auth.register(o.body.challenge as string), credentialId: other.id }
    expect((await w.post('/auth/webauthn/register', body, 'u-pm1')).status).toBe(400)
    expect(w.be.list('webauthnCredentials')).toHaveLength(0)
  })

  it('maksimal 5 perangkat per akun', async () => {
    for (let i = 0; i < 5; i++) expect((await enroll('u-pm1')).res.status).toBe(200)
    const sixth = await enroll('u-pm1')
    expect(sixth.res.status).toBe(409)
    expect(sixth.res.body.error).toBe('limit')
  })

  it('jenis biometrik harus face atau fingerprint', async () => {
    const auth = new VirtualAuthenticator()
    const o = await regOpts('u-pm1')
    const r = await w.post('/auth/webauthn/register', { challengeToken: o.body.challengeToken, kind: 'iris', ...auth.register(o.body.challenge as string) }, 'u-pm1')
    expect(r.status).toBe(400)
  })
})

describe('login biometrik', () => {
  it('berhasil: menerbitkan custom token untuk uid pemilik; penghitung dan waktu diperbarui', async () => {
    const { auth, res } = await enroll('u-pm1')
    const r = await login(auth, 'u-pm1')
    expect(r.status).toBe(200)
    const payload = JSON.parse(Buffer.from(String(r.body.customToken).split('.')[1], 'base64url').toString())
    expect(payload.uid).toBe('u-pm1')
    const doc = w.be.getData(`webauthnCredentials/${res.body.id}`)!
    expect(doc.signCount).toBe(1)
    expect(typeof doc.lastUsedAt).toBe('string')
    expect(doc.lastNonce).toBeTruthy()
  })

  it('RS256 juga berhasil', async () => {
    const { auth } = await enroll('u-pm1', new VirtualAuthenticator('RS256'))
    expect((await login(auth, 'u-pm1')).status).toBe(200)
  })

  it('penghitung tetap 0 (Apple/passkey tersinkron) diterima berulang kali', async () => {
    const { auth } = await enroll('u-pm1')
    for (let i = 0; i < 3; i++) expect((await login(auth, 'u-pm1', { counter: 0 })).status).toBe(200)
  })

  it('pernyataan yang sama tidak dapat dipakai ulang (sekali pakai)', async () => {
    const { auth } = await enroll('u-pm1')
    const o = await loginOpts()
    const a = auth.assert(o.body.challenge as string, 'u-pm1')
    const body = { challengeToken: o.body.challengeToken, ...a }
    expect((await w.post('/auth/webauthn/login', body)).status).toBe(200)
    const replay = await w.post('/auth/webauthn/login', body)
    expect(replay.status).toBe(401)
    expect(replay.body.error).toBe('biometric_failed')
  })

  it('pernyataan berpenghitung 0 (Apple/passkey tersinkron) juga tidak dapat diputar ulang: dijaga nonce', async () => {
    const { auth } = await enroll('u-pm1')
    const o = await loginOpts()
    const body = { challengeToken: o.body.challengeToken, ...auth.assert(o.body.challenge as string, 'u-pm1', { counter: 0 }) }
    expect((await w.post('/auth/webauthn/login', body)).status).toBe(200)
    expect((await w.post('/auth/webauthn/login', body)).status).toBe(401)
  })

  it('semua kegagalan verifikasi memberi jawaban yang sama (401 biometric_failed)', async () => {
    const { auth } = await enroll('u-pm1')
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
    const fails: [string, Parameters<VirtualAuthenticator['assert']>[2]][] = [
      ['tanda tangan kunci lain', { signer: stranger }],
      ['origin lain', { origin: 'https://jahat.example' }],
      ['rpId lain', { rpId: 'jahat.example' }],
      ['tanpa verifikasi pengguna', { flags: { uv: false } }],
      ['tanpa kehadiran pengguna', { flags: { up: false } }],
      ['jenis clientData salah', { type: 'webauthn.create' }],
      ['userHandle milik akun lain', { userHandle: 'u-own' }],
    ]
    const bodies: unknown[] = []
    for (const [name, opt] of fails) {
      const r = await login(auth, 'u-pm1', opt)
      expect(r.status, name).toBe(401)
      bodies.push(r.body)
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
  })

  it('kredensial tidak dikenal, token tantangan rusak/kedaluwarsa/jenis salah, base64 tidak valid ditolak (401, bukan 500)', async () => {
    const auth = new VirtualAuthenticator()
    expect((await login(auth, 'u-pm1')).status).toBe(401) // belum terdaftar
    const { auth: ok } = await enroll('u-pm1')
    expect((await login(ok, 'u-pm1', {}, 'rusak.rusak')).status).toBe(401)
    const o0 = await loginOpts()
    const bad = { challengeToken: o0.body.challengeToken, ...ok.assert(o0.body.challenge as string, 'u-pm1') }
    expect((await w.post('/auth/webauthn/login', { ...bad, credentialId: '!!!' })).status).toBe(401)
    expect((await w.post('/auth/webauthn/login', { ...bad, userHandle: '###' })).status).toBe(401)
    expect((await w.post('/auth/webauthn/login', { ...bad, signature: '@@' })).status).toBe(400)
    const reg = await regOpts('u-pm1')
    expect((await login(ok, 'u-pm1', {}, String(reg.body.challengeToken))).status).toBe(401) // token pendaftaran
    const o = await loginOpts()
    const a = ok.assert(o.body.challenge as string, 'u-pm1')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 121_000)
    expect((await w.post('/auth/webauthn/login', { challengeToken: o.body.challengeToken, ...a })).status).toBe(401)
  })

  it('penghitung bukan nol yang mundur ditolak (indikasi kunci dikloning)', async () => {
    const { auth } = await enroll('u-pm1')
    expect((await login(auth, 'u-pm1', { counter: 10 })).status).toBe(200)
    expect((await login(auth, 'u-pm1', { counter: 5 })).status).toBe(401)
    expect((await login(auth, 'u-pm1', { counter: 10 })).status).toBe(401)
    expect((await login(auth, 'u-pm1', { counter: 11 })).status).toBe(200)
  })

  it('akun nonaktif ditolak (403), akun yang dihapus ditolak, token tidak diterbitkan', async () => {
    const { auth } = await enroll('u-pm1')
    w.be.getData('users/u-pm1')!.disabled = true
    const r = await login(auth, 'u-pm1')
    expect(r.status).toBe(403)
    expect(r.body.customToken).toBeUndefined()
    w.be.getData('users/u-pm1')!.disabled = false
    expect((await login(auth, 'u-pm1')).status).toBe(200)
    w.be.docs.delete('users/u-pm1')
    expect((await login(auth, 'u-pm1')).status).toBe(401)
  })

  it('origin tidak diizinkan ditolak sebelum apa pun', async () => {
    const r = await worker.fetch(new Request('https://api.test/auth/webauthn/login-options', { method: 'POST', headers: { Origin: 'https://jahat.example' }, body: '{}' }), w.env)
    expect(r.status).toBe(403)
  })

  it('pembatas laju per IP: lewat batas -> 429; gangguan KV tidak menggagalkan', async () => {
    const store = new Map<string, string>()
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) }
    const call = (env: unknown) =>
      worker.fetch(new Request('https://api.test/auth/webauthn/login', { method: 'POST', headers: { Origin: 'https://wkngroup-datahub.web.app', 'CF-Connecting-IP': '7.7.7.7' }, body: JSON.stringify({ challengeToken: 'x.y' }) }), env as never).then((r) => r.status)
    const env = { ...w.env, RATE: kv }
    for (let i = 0; i < 30; i++) expect(await call(env)).toBe(401)
    expect(await call(env)).toBe(429)
    const broken = { get: async () => { throw new Error('down') }, put: async () => { throw new Error('down') } }
    expect(await call({ ...w.env, RATE: broken })).toBe(401)
  })
})

describe('mengelola dan mencabut passkey', () => {
  it('pemilik menghapus perangkatnya; milik orang lain tidak bisa; tercatat di audit', async () => {
    const { res } = await enroll('u-pm1')
    expect((await w.post('/auth/webauthn/remove', { id: res.body.id }, 'u-pm2')).status).toBe(404)
    expect((await w.post('/auth/webauthn/remove', { id: res.body.id }, 'u-own')).status).toBe(404) // bahkan atasan tidak
    expect((await w.post('/auth/webauthn/remove', { id: res.body.id }, 'u-pm1')).status).toBe(200)
    expect(w.be.list('webauthnCredentials')).toHaveLength(0)
    expect(w.lastAudit('biometric.remove')).toMatchObject({ actorUid: 'u-pm1' })
  })

  it('reset password langsung mencabut semua passkey akun itu dan login biometriknya gagal', async () => {
    const { auth } = await enroll('u-log')
    expect(w.be.list('webauthnCredentials')).toHaveLength(1)
    expect((await w.post('/users/reset-password', { uid: 'u-log', password: 'abcdef' }, 'u-pm1')).status).toBe(200)
    expect(w.be.list('webauthnCredentials')).toHaveLength(0)
    expect((await login(auth, 'u-log')).status).toBe(401)
  })

  it('eksekusi permintaan reset juga mencabut passkey', async () => {
    await enroll('u-log')
    await w.post('/auth/reset-request', { username: 'log1', turnstileToken: 't' }, null, { ...w.env, TURNSTILE_SECRET: 's' })
    const id = w.be.list('resetRequests')[0].id
    expect((await w.post('/resets/execute', { id, password: 'abcdef' }, 'u-pm1')).status).toBe(200)
    expect(w.be.list('webauthnCredentials')).toHaveLength(0)
  })

  it('menghapus akun membuang passkey-nya', async () => {
    await enroll('u-log')
    await w.post('/users/delete', { uid: 'u-log' }, 'u-pm1')
    expect(w.be.list('webauthnCredentials')).toHaveLength(0)
  })

  it('akun lain tidak terpengaruh', async () => {
    await enroll('u-log')
    await enroll('u-pm2')
    await w.post('/users/reset-password', { uid: 'u-log', password: 'abcdef' }, 'u-pm1')
    expect(w.be.list('webauthnCredentials').map((c) => c.data.uid)).toEqual(['u-pm2'])
  })
})

describe('tantangan', () => {
  it('tantangan tiap kali berbeda dan menyertakan nonce', async () => {
    const sa = parseServiceAccount(w.env.FIREBASE_SERVICE_ACCOUNT)
    const a = await createChallenge(sa, 'login')
    const b = await createChallenge(sa, 'login')
    expect(a.challenge).not.toBe(b.challenge)
    expect(a.challengeToken).not.toBe(b.challengeToken)
  })
})
