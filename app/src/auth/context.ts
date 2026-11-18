import { createContext, useContext } from 'react'

export interface Profile {
  uid: string
  username: string
  name: string
  emailContact: string
  roleId: string
  level: number
  projectIds: string[]
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'out'; message?: string }
  | { status: 'error'; message: string }
  | { status: 'in'; profile: Profile; roleName: string; perms: ReadonlySet<string> }

import type { BiometricKind } from '../lib/biometric'

export interface BiometricInfo {
  /** Ada autentikator platform dengan verifikasi pengguna (sidik jari/wajah/kunci layar). */
  supported: boolean
  /** Tebakan jenis ikon; konsisten dengan yang dipilih saat diaktifkan. */
  kind: BiometricKind
  /** Perangkat ini sudah memiliki passkey terdaftar. */
  enabledHere: boolean
}

export interface AuthApi {
  state: AuthState
  loginWithPassword: (username: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  retry: () => void
  biometric: BiometricInfo
  /** Ajakan mengaktifkan biometrik setelah login awal (hanya login password/Google, bukan muat ulang). */
  bioPrompt: boolean
  dismissBioPrompt: () => void
  /** Ambil tantangan lebih dulu agar ketukan tombol langsung memanggil WebAuthn (syarat Safari). */
  prefetchLoginChallenge: () => void
  loginWithBiometric: () => Promise<void>
  refreshBiometric: () => void
}

export class LoginError extends Error {}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return v
}
