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

export interface AuthApi {
  state: AuthState
  loginWithPassword: (username: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  retry: () => void
}

export class LoginError extends Error {}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return v
}
