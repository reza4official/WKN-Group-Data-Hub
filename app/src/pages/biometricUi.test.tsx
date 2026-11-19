import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '../auth/context'
import { BiometricPrompt } from '../components/BiometricPrompt'
import { ToastProvider } from '../components/Toast'
import { fakeAuth } from '../test-utils'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({
  fetchRegisterOptions: vi.fn(),
  startRegistration: vi.fn(),
  submitRegistration: vi.fn(),
  fetchLoginOptions: vi.fn(),
  startAssertion: vi.fn(),
  rememberCredential: vi.fn(),
}))
vi.mock('../config', () => ({
  config: { apiUrl: '', firebase: {} },
  turnstileSiteKey: '',
  configMissing: false,
  useEmulator: false,
}))
vi.mock('../lib/api', () => ({
  api: vi.fn(),
  requestPasswordReset: vi.fn(),
  ApiError: class extends Error {},
}))
vi.mock('../lib/biometric', async (orig) => ({
  ...(await orig<typeof import('../lib/biometric')>()),
  fetchRegisterOptions: mocks.fetchRegisterOptions,
  startRegistration: mocks.startRegistration,
  submitRegistration: mocks.submitRegistration,
  fetchLoginOptions: mocks.fetchLoginOptions,
  startAssertion: mocks.startAssertion,
  rememberCredential: mocks.rememberCredential,
}))

const wrap = (api: AuthApi, ui: React.ReactNode) =>
  render(
    <AuthContext.Provider value={api}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchRegisterOptions.mockResolvedValue({
    challenge: 'AAAA',
    challengeToken: 't',
    rpId: 'x',
    user: { id: 'u', name: 'u', displayName: 'U' },
    exclude: [],
  })
  mocks.startRegistration.mockResolvedValue({ credentialId: 'cred', kind: 'face' })
  mocks.submitRegistration.mockResolvedValue({ id: 'doc' })
})

describe('tombol biometrik di halaman login', () => {
  it('tidak tampil bila perangkat tidak mendukung', () => {
    wrap(
      fakeAuth({ biometric: { supported: false, kind: 'fingerprint', enabledHere: false } }),
      <LoginPage />,
    )
    expect(screen.queryByRole('button', { name: /Masuk dengan (sidik jari|wajah)/ })).toBeNull()
  })

  it('ikon dan label beradaptasi: sidik jari vs Face ID', () => {
    const { unmount } = wrap(
      fakeAuth({ biometric: { supported: true, kind: 'fingerprint', enabledHere: true } }),
      <LoginPage />,
    )
    const fp = screen.getByRole('button', { name: 'Masuk dengan sidik jari' })
    expect(fp.getAttribute('data-kind')).toBe('fingerprint')
    unmount()
    wrap(fakeAuth({ biometric: { supported: true, kind: 'face', enabledHere: true } }), <LoginPage />)
    const face = screen.getByRole('button', { name: 'Masuk dengan wajah (Face ID)' })
    expect(face.getAttribute('data-kind')).toBe('face')
    expect(face.querySelector('svg')).toBeTruthy()
  })

  it('berada di samping tombol Masuk (satu baris yang sama)', () => {
    wrap(fakeAuth({ biometric: { supported: true, kind: 'fingerprint', enabledHere: true } }), <LoginPage />)
    const masuk = screen.getByRole('button', { name: 'Masuk' })
    const bio = screen.getByRole('button', { name: 'Masuk dengan sidik jari' })
    expect(masuk.parentElement).toBe(bio.parentElement)
    expect(masuk.parentElement?.className).toContain('login-actions')
  })

  it('mengambil tantangan lebih dulu agar ketukan langsung memanggil WebAuthn', () => {
    const api = fakeAuth({ biometric: { supported: true, kind: 'fingerprint', enabledHere: true } })
    wrap(api, <LoginPage />)
    expect(api.prefetchLoginChallenge).toHaveBeenCalled()
  })

  it('aktif: ketukan memanggil loginWithBiometric', async () => {
    const api = fakeAuth({ biometric: { supported: true, kind: 'fingerprint', enabledHere: true } })
    wrap(api, <LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Masuk dengan sidik jari' }))
    await waitFor(() => expect(api.loginWithBiometric).toHaveBeenCalledTimes(1))
  })

  it('belum aktif: menjelaskan cara mengaktifkan dan tidak memanggil WebAuthn', () => {
    const api = fakeAuth({ biometric: { supported: true, kind: 'face', enabledHere: false } })
    wrap(api, <LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Masuk dengan wajah (Face ID)' }))
    expect(screen.getByText(/belum diaktifkan di perangkat ini/)).toBeTruthy()
    expect(api.loginWithBiometric).not.toHaveBeenCalled()
  })

  it('kegagalan login biometrik ditampilkan', async () => {
    const { LoginError } = await import('../auth/context')
    const api = fakeAuth({
      biometric: { supported: true, kind: 'fingerprint', enabledHere: true },
      loginWithBiometric: vi
        .fn()
        .mockRejectedValue(new LoginError('Verifikasi dibatalkan atau waktunya habis.')),
    })
    wrap(api, <LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Masuk dengan sidik jari' }))
    expect(await screen.findByText('Verifikasi dibatalkan atau waktunya habis.')).toBeTruthy()
  })
})

describe('ajakan mengaktifkan biometrik', () => {
  it('dapat dilewati', async () => {
    const api = fakeAuth({
      biometric: { supported: true, kind: 'fingerprint', enabledHere: false },
      bioPrompt: true,
    })
    wrap(api, <BiometricPrompt />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lewati' }))
    expect(api.dismissBioPrompt).toHaveBeenCalled()
    expect(mocks.startRegistration).not.toHaveBeenCalled()
  })

  it('tombol Aktifkan menunggu tantangan siap, lalu memanggil startRegistration seketika dan mendaftarkan', async () => {
    const api = fakeAuth({
      biometric: { supported: true, kind: 'face', enabledHere: false },
      bioPrompt: true,
    })
    wrap(api, <BiometricPrompt />)
    const btn = (await screen.findByRole('button', { name: /Aktifkan sekarang/ })) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    expect(mocks.startRegistration).toHaveBeenCalledTimes(1) // sinkron dari ketukan
    expect(mocks.startRegistration.mock.calls[0][1]).toBe('face') // jenis ikon ikut disimpan
    await waitFor(() => expect(mocks.submitRegistration).toHaveBeenCalled())
    await waitFor(() => expect(api.refreshBiometric).toHaveBeenCalled())
    expect(api.dismissBioPrompt).toHaveBeenCalled()
  })

  it('pembatalan oleh pengguna menampilkan pesan dan mengambil tantangan baru', async () => {
    mocks.startRegistration.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'))
    const api = fakeAuth({
      biometric: { supported: true, kind: 'fingerprint', enabledHere: false },
      bioPrompt: true,
    })
    wrap(api, <BiometricPrompt />)
    const btn = (await screen.findByRole('button', { name: /Aktifkan sekarang/ })) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    expect(await screen.findByText(/dibatalkan/)).toBeTruthy()
    await waitFor(() => expect(mocks.fetchRegisterOptions).toHaveBeenCalledTimes(2))
    expect(api.dismissBioPrompt).not.toHaveBeenCalled()
  })

  it('perangkat sudah memegang kunci: menawarkan "Kenali perangkat ini" (bukan galat buntu) lalu mengingat id-nya', async () => {
    mocks.fetchRegisterOptions.mockResolvedValue({
      challenge: 'AAAA',
      challengeToken: 't',
      rpId: 'x',
      user: { id: 'u', name: 'u', displayName: 'U' },
      exclude: ['ID-LAMA'],
    })
    mocks.startRegistration.mockRejectedValueOnce(new DOMException('x', 'InvalidStateError'))
    mocks.fetchLoginOptions.mockResolvedValue({ challenge: 'BBBB', challengeToken: 'lt', rpId: 'x' })
    mocks.startAssertion.mockResolvedValue({ credentialId: 'ID-LAMA' })
    const api = fakeAuth({
      biometric: { supported: true, kind: 'fingerprint', enabledHere: false },
      bioPrompt: true,
    })
    wrap(api, <BiometricPrompt />)
    const btn = (await screen.findByRole('button', { name: /Aktifkan sekarang/ })) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    const rec = await screen.findByRole('button', { name: /Kenali perangkat ini/ })
    expect(screen.queryByText('Perangkat ini sudah terdaftar.')).toBeNull()
    fireEvent.click(rec)
    expect(mocks.startAssertion).toHaveBeenCalledWith(expect.anything(), ['ID-LAMA']) // sinkron dari ketukan
    await waitFor(() =>
      expect(mocks.rememberCredential).toHaveBeenCalledWith('ID-LAMA', 'fingerprint', expect.anything()),
    )
    await waitFor(() => expect(api.dismissBioPrompt).toHaveBeenCalled())
    expect(mocks.submitRegistration).not.toHaveBeenCalled()
  })
})
