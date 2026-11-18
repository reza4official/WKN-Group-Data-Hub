import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  api: vi.fn(),
  reauth: vi.fn(),
  signIn: vi.fn(),
  getIdToken: vi.fn(),
  user: { getIdToken: vi.fn() },
}))
vi.mock('./api', () => ({ api: m.api }))
vi.mock('./firebase', () => ({ auth: { currentUser: m.user } }))
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: (e: string, p: string) => ({ e, p }) },
  reauthenticateWithCredential: m.reauth,
  signInWithEmailAndPassword: m.signIn,
}))
import { FirebaseError } from 'firebase/app'
import { BAD_CURRENT, changeMyPassword, saveProfile } from './profile'

const cur = { name: 'Budi', phone: '0812', emailContact: 'budi@x.com' }
beforeEach(() => {
  vi.clearAllMocks()
  m.api.mockResolvedValue({ changed: ['name'] })
  m.reauth.mockResolvedValue(undefined)
  m.signIn.mockResolvedValue(undefined)
  m.user.getIdToken.mockResolvedValue('t')
})

describe('saveProfile', () => {
  it('mengirim hanya kolom yang berubah (dan tidak pernah role/level/proyek)', async () => {
    await saveProfile({ name: ' Budi Baru ', phone: '0812', emailContact: 'BUDI@x.com ' }, cur)
    expect(m.api).toHaveBeenCalledWith('/profile/update', { name: 'Budi Baru' })
    await saveProfile({ name: 'Budi', phone: ' 0899', emailContact: '' }, cur)
    expect(m.api).toHaveBeenLastCalledWith('/profile/update', { phone: '0899', emailContact: '' })
  })
  it('tanpa perubahan tidak memanggil server', async () => {
    expect(await saveProfile({ ...cur, emailContact: 'Budi@X.com' }, cur)).toEqual([])
    expect(m.api).not.toHaveBeenCalled()
  })
})

describe('changeMyPassword', () => {
  it('urutan: reautentikasi, token segar, server, masuk ulang dengan password baru', async () => {
    const order: string[] = []
    m.reauth.mockImplementation(async () => order.push('reauth'))
    m.user.getIdToken.mockImplementation(async (force: boolean) => order.push(`token:${force}`))
    m.api.mockImplementation(async () => order.push('api'))
    m.signIn.mockImplementation(async () => order.push('signin'))
    await changeMyPassword('budi', 'lama', 'baru-123')
    expect(order).toEqual(['reauth', 'token:true', 'api', 'signin'])
    expect(m.api).toHaveBeenCalledWith('/profile/change-password', { newPassword: 'baru-123' })
    expect(m.reauth.mock.calls[0][1]).toMatchObject({ p: 'lama' })
    expect(m.signIn.mock.calls[0][2]).toBe('baru-123')
  })
  it('password lama salah: server tidak dipanggil', async () => {
    m.reauth.mockRejectedValue(new FirebaseError('auth/invalid-credential', 'x'))
    await expect(changeMyPassword('budi', 'salah', 'baru-123')).rejects.toThrow(BAD_CURRENT)
    expect(m.api).not.toHaveBeenCalled()
  })
  it('terlalu banyak percobaan dan jaringan punya pesan sendiri', async () => {
    m.reauth.mockRejectedValue(new FirebaseError('auth/too-many-requests', 'x'))
    await expect(changeMyPassword('budi', 'a', 'baru-123')).rejects.toThrow(/Terlalu banyak/)
    m.reauth.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'x'))
    await expect(changeMyPassword('budi', 'a', 'baru-123')).rejects.toThrow(/terhubung/)
  })
  it('masuk ulang gagal tidak menggagalkan penggantian yang sudah berhasil', async () => {
    m.signIn.mockRejectedValue(new Error('x'))
    await expect(changeMyPassword('budi', 'lama', 'baru-123')).resolves.toBeUndefined()
  })
})
