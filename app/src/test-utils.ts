import { vi } from 'vitest'
import type { AuthApi } from './auth/context'

/** AuthApi lengkap untuk tes; hanya yang perlu diubah yang ditimpa. */
export function fakeAuth(over: Partial<AuthApi> = {}): AuthApi {
  return {
    state: { status: 'out' },
    loginWithPassword: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn(),
    biometric: { supported: false, kind: 'fingerprint', enabledHere: false },
    bioPrompt: false,
    dismissBioPrompt: vi.fn(),
    prefetchLoginChallenge: vi.fn(),
    loginWithBiometric: vi.fn().mockResolvedValue(undefined),
    refreshBiometric: vi.fn(),
    ...over,
  }
}
