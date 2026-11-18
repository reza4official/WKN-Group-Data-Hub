import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({ config: { apiUrl: 'https://api.test', firebase: {} } }))
vi.mock('./api', () => ({ api: vi.fn(), ApiError: class extends Error {} }))

import {
  b64urlDecode,
  b64urlEncode,
  describeDevice,
  detectBiometricKind,
  forgetCredential,
  hasLocalBiometric,
  localBiometric,
  rememberCredential,
  startAssertion,
  startRegistration,
  webauthnErrorMessage,
} from './biometric'

const UA = {
  iPhone8:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
}

describe('tebakan jenis biometrik (ikon)', () => {
  const k = (ua: string, longSide: number, platform = '', touch = 0) =>
    detectBiometricKind({ ua, platform, maxTouchPoints: touch, longSide })
  it('iPhone: tombol Home (<=736) sidik jari; iPhone X dan setelahnya (>=812) Face ID', () => {
    expect(k(UA.iPhone8, 568)).toBe('fingerprint') // iPhone SE 1
    expect(k(UA.iPhone8, 667)).toBe('fingerprint') // iPhone 8 / SE 2-3
    expect(k(UA.iPhone8, 736)).toBe('fingerprint') // iPhone 8 Plus
    expect(k(UA.iPhone8, 812)).toBe('face') // iPhone X
    expect(k(UA.iPhone8, 844)).toBe('face') // iPhone 13
    expect(k(UA.iPhone8, 932)).toBe('face') // iPhone Pro Max
  })
  it('iPad: Air/dasar (Touch ID) vs Pro (Face ID); iPadOS yang menyamar sebagai Mac', () => {
    expect(k(UA.ipad, 1180)).toBe('fingerprint')
    expect(k(UA.ipad, 1194)).toBe('face')
    expect(k(UA.ipad, 1366)).toBe('face')
    expect(k(UA.mac, 1194, 'MacIntel', 5)).toBe('face') // iPad Pro berpura-pura Mac
    expect(k(UA.mac, 1180, 'MacIntel', 5)).toBe('fingerprint')
  })
  it('Android, Windows, Mac asli: sidik jari', () => {
    expect(k(UA.android, 915)).toBe('fingerprint')
    expect(k(UA.windows, 1920)).toBe('fingerprint')
    expect(k(UA.mac, 1440, 'MacIntel', 0)).toBe('fingerprint')
  })
  it('nama perangkat singkat', () => {
    expect(describeDevice(UA.android)).toBe('Chrome di Android')
    expect(describeDevice(UA.windows)).toBe('Chrome di Windows')
    expect(describeDevice(UA.mac)).toBe('Safari di macOS')
    expect(describeDevice(UA.iPhone8)).toBe('Safari di iOS')
  })
})

describe('base64url', () => {
  it('pulang-pergi untuk semua panjang dan nilai byte', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255)
      expect(b64urlDecode(b64urlEncode(b))).toEqual(b)
    }
    expect(b64urlEncode(new Uint8Array([251, 255, 254]))).toBe('-__-')
  })
})

describe('penyimpanan lokal (per akun)', () => {
  beforeEach(() => localStorage.clear())
  it('mengingat dan melupakan id; jenis tersimpan; ditandai per akun', () => {
    expect(hasLocalBiometric()).toBe(false)
    rememberCredential('abc', 'face', 'u1')
    rememberCredential('abc', 'face', 'u1')
    rememberCredential('def', 'face', 'u2')
    expect(localBiometric()).toEqual({ ids: ['abc', 'def'], kind: 'face' })
    expect(hasLocalBiometric('u1')).toBe(true)
    expect(hasLocalBiometric('u2')).toBe(true)
    expect(hasLocalBiometric('u3')).toBe(false) // akun lain di perangkat yang sama tetap ditawari
    forgetCredential('abc')
    expect(localBiometric().ids).toEqual(['def'])
    expect(hasLocalBiometric('u1')).toBe(false)
    forgetCredential()
    expect(hasLocalBiometric()).toBe(false)
  })
  it('data rusak atau penyimpanan diblokir tidak membuat error', () => {
    localStorage.setItem('wkn.biometric.v2', '{bukan json')
    expect(localBiometric().ids).toEqual([])
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasLocalBiometric()).toBe(false)
    spy.mockRestore()
  })
})

describe('pemanggilan WebAuthn sinkron dari ketukan (syarat Safari)', () => {
  const create = vi.fn()
  const get = vi.fn()
  beforeEach(() => {
    create.mockReset().mockReturnValue(new Promise(() => {}))
    get.mockReset().mockReturnValue(new Promise(() => {}))
    Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
  })
  afterEach(() => vi.restoreAllMocks())

  it('startRegistration memanggil credentials.create seketika (tanpa await), dengan opsi yang benar', () => {
    void startRegistration(
      {
        challenge: 'AAAA',
        challengeToken: 't',
        rpId: 'wkngroup-datahub.web.app',
        user: { id: 'u1', name: 'budi', displayName: 'Budi' },
        exclude: ['AQID'],
      },
      'face',
    )
    expect(create).toHaveBeenCalledTimes(1) // tepat setelah panggilan, sebelum microtask apa pun
    const pk = create.mock.calls[0][0].publicKey
    expect(pk.rp.id).toBe('wkngroup-datahub.web.app')
    expect(pk.authenticatorSelection).toMatchObject({
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    })
    expect(pk.pubKeyCredParams.map((p: { alg: number }) => p.alg)).toEqual([-7, -257])
    expect(pk.attestation).toBe('none')
    expect(pk.excludeCredentials).toHaveLength(1)
  })

  it('startAssertion memanggil credentials.get seketika; allowCredentials dari id lokal, kosong bila tidak ada', () => {
    void startAssertion({ challenge: 'AAAA', challengeToken: 't', rpId: 'x.test' }, ['AQID'])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0].publicKey.allowCredentials).toHaveLength(1)
    expect(get.mock.calls[0][0].publicKey.userVerification).toBe('required')
    void startAssertion({ challenge: 'AAAA', challengeToken: 't', rpId: 'x.test' }, [])
    expect(get.mock.calls[1][0].publicKey.allowCredentials).toEqual([])
  })

  it('pesan kesalahan WebAuthn', () => {
    expect(webauthnErrorMessage(new DOMException('x', 'NotAllowedError'))).toContain('dibatalkan')
    expect(webauthnErrorMessage(new DOMException('x', 'InvalidStateError'))).toContain('sudah terdaftar')
    expect(webauthnErrorMessage(new DOMException('x', 'SecurityError'))).toContain('alamat')
    expect(webauthnErrorMessage(new Error('dibatalkan'))).toContain('dibatalkan')
    expect(webauthnErrorMessage(undefined)).toContain('gagal')
  })
})
