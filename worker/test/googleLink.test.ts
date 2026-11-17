import { createPublicKey, createVerify } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { resetJwksCache } from '../src/lib/idToken'
import { resetAccessTokenCache } from '../src/lib/serviceAccount'
import { claims, installFetch, makeEnv, rsaKeys, signJwt, type World } from './helpers'

const google = rsaKeys()
const sa = rsaKeys()
const env = makeEnv(sa.pem)
const ORIGIN = 'https://wkngroup-datahub.web.app'
let world: World

const call = (token: string | null, over: Record<string, unknown> = {}, origin = ORIGIN) =>
  worker.fetch(
    new Request('https://api.test/auth/google-link', {
      method: 'POST',
      headers: { Origin: origin, ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
    }),
    env,
  ).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, string>, headers: r.headers, over }))

const idToken = (over: Record<string, unknown> = {}) => signJwt(google.priv, { alg: 'RS256', kid: 'k1' }, claims(over))

beforeEach(() => {
  resetJwksCache()
  resetAccessTokenCache()
  world = {
    users: {
      'uid-budi': { username: 'budi', emailContact: 'budi@gmail.com', disabled: false },
      'uid-off': { username: 'off', emailContact: 'off@gmail.com', disabled: true },
      'uid-dup1': { username: 'd1', emailContact: 'dup@gmail.com', disabled: false },
      'uid-dup2': { username: 'd2', emailContact: 'dup@gmail.com', disabled: false },
    },
    deleted: [],
    calls: [],
  }
  installFetch(world, google.jwk, 'k1')
})

describe('POST /auth/google-link', () => {
  it('akun terdaftar: memberi custom token untuk uid terdaftar dan menghapus akun sementara', async () => {
    const r = await call(idToken())
    expect(r.status).toBe(200)
    const [h, p, s] = r.body.customToken.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
    expect(payload.uid).toBe('uid-budi')
    expect(payload.iss).toBe('wkn-worker@x.iam.gserviceaccount.com')
    expect(String(payload.aud)).toContain('identitytoolkit')
    const verify = createVerify('RSA-SHA256').update(`${h}.${p}`)
    expect(verify.verify(createPublicKey(sa.pem), Buffer.from(s, 'base64url'))).toBe(true)
    expect(h.length).toBeGreaterThan(0)
    expect(world.deleted).toEqual(['stray-google-uid'])
  })

  it('email dicocokkan tanpa membedakan huruf besar/kecil', async () => {
    const r = await call(idToken({ email: 'Budi@Gmail.com' }))
    expect(r.status).toBe(200)
  })

  it('email belum terdaftar: ditolak dan akun sementara dihapus', async () => {
    const r = await call(idToken({ email: 'asing@gmail.com' }))
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('not_registered')
    expect(world.deleted).toEqual(['stray-google-uid'])
  })

  it('akun nonaktif: ditolak dan akun sementara dihapus', async () => {
    const r = await call(idToken({ email: 'off@gmail.com' }))
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('disabled')
    expect(world.deleted).toEqual(['stray-google-uid'])
  })

  it('email terdaftar ganda: ditolak', async () => {
    const r = await call(idToken({ email: 'dup@gmail.com' }))
    expect(r.status).toBe(409)
    expect(world.deleted).toEqual(['stray-google-uid'])
  })

  it('email belum terverifikasi: ditolak', async () => {
    const r = await call(idToken({ email_verified: false }))
    expect(r.status).toBe(403)
    expect(world.deleted).toEqual(['stray-google-uid'])
  })

  it('token dari penyedia selain Google tidak pernah memicu penghapusan akun', async () => {
    const r = await call(idToken({ firebase: { sign_in_provider: 'password' }, sub: 'uid-budi' }))
    expect(r.status).toBe(400)
    expect(world.deleted).toEqual([])
  })

  it('tanpa token atau token palsu: 401 dan tidak ada yang dihapus', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('abc.def.ghi')).status).toBe(401)
    expect(world.deleted).toEqual([])
  })
})

describe('CORS dan rute', () => {
  it('origin tidak diizinkan ditolak', async () => {
    const r = await call(idToken(), {}, 'https://jahat.example')
    expect(r.status).toBe(403)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(world.deleted).toEqual([])
  })

  it('origin aplikasi diizinkan dan preflight dijawab', async () => {
    const pre = await worker.fetch(
      new Request('https://api.test/auth/google-link', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      env,
    )
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    const bad = await worker.fetch(
      new Request('https://api.test/auth/google-link', { method: 'OPTIONS', headers: { Origin: 'https://jahat.example' } }),
      env,
    )
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('health memberi versi, rute lain 404', async () => {
    const h = await worker.fetch(new Request('https://api.test/health'), env)
    expect(await h.json()).toMatchObject({ ok: true, version: '0.2.0' })
    expect((await worker.fetch(new Request('https://api.test/x'), env)).status).toBe(404)
  })
})
