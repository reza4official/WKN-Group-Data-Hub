import { beforeEach, describe, expect, it } from 'vitest'
import { verifyIdToken, resetJwksCache } from '../src/lib/idToken'
import { claims, installFetch, makeEnv, rsaKeys, signJwt, unsignedJwt, type World } from './helpers'

const google = rsaKeys()
const sa = rsaKeys()
const world = (): World => ({ users: {}, deleted: [], calls: [] })

beforeEach(() => {
  resetJwksCache()
  installFetch(world(), google.jwk, 'k1')
})

const sign = (over: Record<string, unknown> = {}, header: object = { alg: 'RS256', kid: 'k1' }) =>
  signJwt(google.priv, header, claims(over))

describe('verifyIdToken', () => {
  const env = makeEnv(sa.pem)

  it('menerima token Google yang sah', async () => {
    const v = await verifyIdToken(sign(), env)
    expect(v).toMatchObject({ uid: 'stray-google-uid', email: 'budi@gmail.com', emailVerified: true, provider: 'google.com' })
  })

  it('menolak aud, iss, dan exp yang salah', async () => {
    await expect(verifyIdToken(sign({ aud: 'lain' }), env)).rejects.toThrow()
    await expect(verifyIdToken(sign({ iss: 'https://securetoken.google.com/lain' }), env)).rejects.toThrow()
    await expect(verifyIdToken(sign({ exp: Math.floor(Date.now() / 1000) - 600 }), env)).rejects.toThrow()
    await expect(verifyIdToken(sign({ iat: Math.floor(Date.now() / 1000) + 3600 }), env)).rejects.toThrow()
    await expect(verifyIdToken(sign({ sub: '' }), env)).rejects.toThrow()
  })

  it('menolak token yang ditandatangani kunci lain atau kid tak dikenal', async () => {
    const other = rsaKeys()
    await expect(verifyIdToken(signJwt(other.priv, { alg: 'RS256', kid: 'k1' }, claims()), env)).rejects.toThrow()
    await expect(verifyIdToken(sign({}, { alg: 'RS256', kid: 'asing' }), env)).rejects.toThrow()
  })

  it('menolak token alg none di produksi, termasuk bila USE_EMULATOR diisi tetapi proyek bukan demo-', async () => {
    const t = unsignedJwt(claims())
    await expect(verifyIdToken(t, env)).rejects.toThrow()
    await expect(verifyIdToken(t, makeEnv(sa.pem, { USE_EMULATOR: 'true' }))).rejects.toThrow()
  })

  it('menerima token alg none hanya pada mode emulator proyek demo-', async () => {
    const demo = makeEnv(sa.pem, { USE_EMULATOR: 'true', FIREBASE_PROJECT_ID: 'demo-wkn' })
    const t = unsignedJwt(claims({ aud: 'demo-wkn', iss: 'https://securetoken.google.com/demo-wkn' }))
    await expect(verifyIdToken(t, demo)).resolves.toMatchObject({ uid: 'stray-google-uid' })
  })

  it('menolak algoritma lain (HS256)', async () => {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
    const p = Buffer.from(JSON.stringify(claims())).toString('base64url')
    await expect(verifyIdToken(`${h}.${p}.abc`, env)).rejects.toThrow()
  })
})
