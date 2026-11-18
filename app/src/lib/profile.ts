import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { api } from './api'
import { auth } from './firebase'
import { syntheticEmail } from './identity'

export interface ProfileInput {
  name: string
  phone: string
  emailContact: string
}

/** Mengubah data diri sendiri. Hanya kolom yang berubah yang dikirim; role, level, dan proyek tidak pernah dikirim. */
export async function saveProfile(next: ProfileInput, current: ProfileInput): Promise<string[]> {
  const body: Record<string, string> = {}
  if (next.name.trim() !== current.name) body.name = next.name.trim()
  if (next.phone.trim() !== current.phone) body.phone = next.phone.trim()
  if (next.emailContact.trim().toLowerCase() !== current.emailContact)
    body.emailContact = next.emailContact.trim()
  if (Object.keys(body).length === 0) return []
  const res = await api<{ changed: string[] }>('/profile/update', body)
  return res.changed
}

export const BAD_CURRENT = 'Password lama salah.'

/**
 * Ganti password: password lama dimasukkan ulang (reautentikasi), lalu server menerima token yang baru saja
 * diterbitkan dari login password. Setelah itu masuk ulang diam-diam dengan password baru agar sesi ini tetap hidup.
 */
export async function changeMyPassword(username: string, current: string, next: string): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Sesi Anda berakhir. Masuk kembali.')
  const email = await syntheticEmail(username)
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, current))
  } catch (e) {
    const code = e instanceof FirebaseError ? e.code : ''
    if (code === 'auth/too-many-requests')
      throw new Error('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', { cause: e })
    if (code === 'auth/network-request-failed')
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.', { cause: e })
    throw new Error(BAD_CURRENT, { cause: e })
  }
  await user.getIdToken(true)
  await api('/profile/change-password', { newPassword: next })
  try {
    await signInWithEmailAndPassword(auth, email, next)
  } catch {
    /* sesi tetap berlaku sampai token berikutnya diperbarui; pengguna dapat masuk dengan password baru */
  }
}
