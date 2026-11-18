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
import { ApiError } from '../lib/api'
import {
  detectBiometricKind,
  fetchLoginOptions,
  forgetCredential,
  hasLocalBiometric,
  isBiometricSupported,
  localBiometric,
  postAssertion,
  startAssertion,
  webauthnErrorMessage,
  type LoginOptions,
} from '../lib/biometric'
import { auth, db } from '../lib/firebase'
import { syntheticEmail } from '../lib/identity'
import {
  AuthContext,
  LoginError,
  type AuthApi,
  type AuthState,
  type BiometricInfo,
  type Profile,
} from './context'
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
  const [biometric, setBiometric] = useState<BiometricInfo>({
    supported: false,
    kind: localBiometric().kind || detectBiometricKind(),
    enabledHere: hasLocalBiometric(),
  })
  const [bioPrompt, setBioPrompt] = useState(false)
  const supportedRef = useRef(false)
  const loginPrep = useRef<{ opts: LoginOptions; at: number } | null>(null)

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
        phone: String(d.phone ?? ''),
        emailContact: String(d.emailContact ?? ''),
        roleId: String(d.roleId ?? ''),
        level: Number(d.level ?? 0),
        projectIds: Array.isArray(d.projectIds) ? (d.projectIds as string[]) : [],
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

  useEffect(() => {
    let cancelled = false
    void isBiometricSupported().then((ok) => {
      if (cancelled) return
      supportedRef.current = ok
      setBiometric((b) => ({ ...b, supported: ok }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshBiometric = useCallback(() => {
    const l = localBiometric()
    setBiometric((b) => ({ ...b, enabledHere: l.ids.length > 0, kind: l.kind }))
  }, [])

  const prefetchLoginChallenge = useCallback(() => {
    fetchLoginOptions()
      .then((opts) => {
        loginPrep.current = { opts, at: Date.now() }
      })
      .catch(() => {
        loginPrep.current = null
      })
  }, [])

  // Ajakan aktifkan biometrik: hanya setelah login password/Google pada perangkat yang mendukung dan belum aktif.
  const offerBiometric = (uid: string) => {
    if (supportedRef.current && !hasLocalBiometric(uid)) setBioPrompt(true)
  }

  // Pesan penolakan dari percobaan sebelumnya dibersihkan saat percobaan baru dimulai.
  const clearNotice = () => setState((s) => (s.status === 'out' && s.message ? { status: 'out' } : s))

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    clearNotice()
    if (!username.trim()) throw new LoginError('Username wajib diisi.')
    if (password.length < 6) throw new LoginError('Password minimal 6 karakter.')
    try {
      const cred = await signInWithEmailAndPassword(auth, await syntheticEmail(username), password)
      offerBiometric(cred.user.uid)
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
      const signed = await signInWithCustomToken(auth, body.customToken)
      offerBiometric(signed.user.uid)
    } catch (e) {
      if (e instanceof LoginError) throw e
      throw new LoginError(loginErrorMessage(e instanceof FirebaseError ? e.code : undefined))
    } finally {
      linking.current = false
      if (auth.currentUser) void loadProfile(auth.currentUser)
      else setState({ status: 'out' })
    }
  }, [loadProfile])

  /**
   * Login biometrik. Pemanggilan WebAuthn dilakukan SINKRON dari ketukan (tantangan sudah diambil lebih
   * dulu) agar diterima Safari/iOS. Login tidak bergantung pada penyimpanan lokal: bila id tidak ada,
   * browser menawarkan passkey yang ditemukan.
   */
  const loginWithBiometric = useCallback(async () => {
    clearNotice()
    const prep = loginPrep.current
    if (!prep || Date.now() - prep.at > 100_000) {
      prefetchLoginChallenge()
      throw new LoginError('Menyiapkan verifikasi biometrik. Ketuk sekali lagi.')
    }
    loginPrep.current = null
    let pending
    let usedId = ''
    try {
      pending = startAssertion(prep.opts, localBiometric().ids)
    } catch (e) {
      prefetchLoginChallenge()
      throw new LoginError(webauthnErrorMessage(e))
    }
    try {
      const a = await pending
      usedId = a.credentialId
      const { customToken } = await postAssertion(a)
      await signInWithCustomToken(auth, customToken)
    } catch (e) {
      prefetchLoginChallenge()
      if (e instanceof ApiError && e.code === 'biometric_failed') {
        if (usedId) forgetCredential(usedId) // passkey ini kemungkinan sudah dicabut (mis. setelah reset password)
        refreshBiometric()
        throw new LoginError(
          'Login biometrik tidak berlaku lagi di perangkat ini. Masuk dengan password, lalu aktifkan ulang.',
        )
      }
      if (e instanceof ApiError) throw new LoginError(e.message)
      if (e instanceof FirebaseError) throw new LoginError(loginErrorMessage(e.code))
      throw new LoginError(webauthnErrorMessage(e))
    }
  }, [prefetchLoginChallenge, refreshBiometric])

  const logout = useCallback(async () => {
    await signOut(auth)
    setBioPrompt(false)
    setState({ status: 'out' })
  }, [])

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) await loadProfile(auth.currentUser)
  }, [loadProfile])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    if (auth.currentUser) void loadProfile(auth.currentUser)
    else setState({ status: 'out' })
  }, [loadProfile])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      loginWithPassword,
      loginWithGoogle,
      logout,
      retry,
      biometric,
      bioPrompt,
      dismissBioPrompt: () => setBioPrompt(false),
      prefetchLoginChallenge,
      loginWithBiometric,
      refreshBiometric,
      refreshProfile,
    }),
    [
      state,
      loginWithPassword,
      loginWithGoogle,
      logout,
      retry,
      biometric,
      bioPrompt,
      prefetchLoginChallenge,
      loginWithBiometric,
      refreshBiometric,
      refreshProfile,
    ],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
