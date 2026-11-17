import { describe, expect, it } from 'vitest'
import { googleLinkMessage, loginErrorMessage } from './errors'

describe('pesan kesalahan login', () => {
  it('salah username dan salah password memberi pesan yang sama (tidak membocorkan akun)', () => {
    const a = loginErrorMessage('auth/invalid-credential')
    expect(loginErrorMessage('auth/user-not-found')).toBe(a)
    expect(loginErrorMessage('auth/wrong-password')).toBe(a)
  })
  it('akun nonaktif, jaringan, dan kode tak dikenal', () => {
    expect(loginErrorMessage('auth/user-disabled')).toContain('dinonaktifkan')
    expect(loginErrorMessage('auth/network-request-failed')).toContain('koneksi')
    expect(loginErrorMessage('auth/aneh')).toBe('Tidak dapat masuk. Coba lagi.')
    expect(loginErrorMessage(undefined)).toBe('Tidak dapat masuk. Coba lagi.')
  })
  it('penolakan login Google', () => {
    expect(googleLinkMessage('not_registered')).toContain('belum terdaftar')
    expect(googleLinkMessage('disabled')).toContain('dinonaktifkan')
    expect(googleLinkMessage('server_error')).toBe('Login Google gagal (kode: server_error). Coba lagi.')
    expect(googleLinkMessage('server_error', 500, 'Firestore get gagal (403)')).toBe(
      'Login Google gagal (kode: server_error - Firestore get gagal (403)). Coba lagi.',
    )
    expect(googleLinkMessage(undefined, 502)).toBe('Login Google gagal (kode: HTTP 502). Coba lagi.')
  })
})
