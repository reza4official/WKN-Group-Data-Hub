import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { config } from '../config'
import { auth, db } from '../lib/firebase'
import { syntheticEmail } from '../lib/identity'
import { AuthContext, LoginError, type AuthApi, type AuthState, type Profile } from './context'
import { googleLinkMessage, loginErrorMessage } from './errors'

const TRANSIENT = new Set([
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'cancelled',
  'aborted',
  'internal',
])

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const linking = useRef(false)

  const loadProfile = useCallback(async (user: User) => {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (!snap.exists()) {
        await signOut(auth)
        setState({ status: 'out', message: 'Akun ini belum terdaftar. Hubungi atasan Anda.' })
        return
      }
      const d = snap.data()
      if (d.disabled === true) {
        await signOut(auth)
        setState({ status: 'out', message: 'Akun ini dinonaktifkan. Hubungi atasan Anda.' })
        return
      }
      const roleSnap = await getDoc(doc(db, 'roles', String(d.roleId)))
      const r = roleSnap.exists() ? roleSnap.data() : null
      const profile: Profile = {
        uid: user.uid,
        username: String(d.username ?? ''),
        name: String(d.name ?? ''),
        emailContact: String(d.emailContact ?? ''),
        roleId: String(d.roleId ?? ''),
        level: Number(d.level ?? 0),
      }
      setState({
        status: 'in',
        profile,
        roleName: String(r?.name ?? d.roleId ?? ''),
        perms: new Set<string>(Array.isArray(r?.perms) ? (r.perms as string[]) : []),
      })
    } catch (e) {
      // Gangguan jaringan tidak boleh mengeluarkan pengguna (tanpa auto logout): tampilkan pilihan coba lagi.
      const code = e instanceof FirebaseError ? e.code.replace('firestore/', '') : ''
      const transient = TRANSIENT.has(code) || e instanceof TypeError
      setState({
        status: 'error',
        message: transient
          ? 'Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.'
          : 'Profil Anda tidak dapat dimuat. Coba lagi atau keluar.',
      })
    }
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (linking.current) return // alur login Google sedang menukar akun sementara
        if (!user) setState((s) => (s.status === 'out' ? s : { status: 'out' }))
        else void loadProfile(user)
      }),
    [loadProfile],
  )

  // Pesan penolakan dari percobaan sebelumnya dibersihkan saat percobaan baru dimulai.
  const clearNotice = () => setState((s) => (s.status === 'out' && s.message ? { status: 'out' } : s))

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    clearNotice()
    if (!username.trim()) throw new LoginError('Username wajib diisi.')
    if (password.length < 6) throw new LoginError('Password minimal 6 karakter.')
    try {
      await signInWithEmailAndPassword(auth, await syntheticEmail(username), password)
    } catch (e) {
      throw new LoginError(loginErrorMessage(e instanceof FirebaseError ? e.code : undefined))
    }
  }, [])

  const loginWithGoogle = useCallback(async () => {
    clearNotice()
    linking.current = true
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider())
      const idToken = await cred.user.getIdToken()
      let res: Response
      try {
        res = await fetch(`${config.apiUrl}/auth/google-link`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        })
      } catch {
        await signOut(auth).catch(() => {})
        throw new LoginError('Tidak dapat terhubung ke server. Periksa koneksi Anda.')
      }
      const body = (await res.json().catch(() => ({}))) as {
        customToken?: string
        error?: string
        detail?: string
      }
      if (!res.ok || !body.customToken) {
        await signOut(auth).catch(() => {})
        throw new LoginError(googleLinkMessage(body.error, res.status, body.detail))
      }
      await signInWithCustomToken(auth, body.customToken)
    } catch (e) {
      if (e instanceof LoginError) throw e
      throw new LoginError(loginErrorMessage(e instanceof FirebaseError ? e.code : undefined))
    } finally {
      linking.current = false
      if (auth.currentUser) void loadProfile(auth.currentUser)
      else setState({ status: 'out' })
    }
  }, [loadProfile])

  const logout = useCallback(async () => {
    await signOut(auth)
    setState({ status: 'out' })
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    if (auth.currentUser) void loadProfile(auth.currentUser)
    else setState({ status: 'out' })
  }, [loadProfile])

  const api = useMemo<AuthApi>(
    () => ({ state, loginWithPassword, loginWithGoogle, logout, retry }),
    [state, loginWithPassword, loginWithGoogle, logout, retry],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
