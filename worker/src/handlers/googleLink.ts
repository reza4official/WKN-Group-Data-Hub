import type { Env } from '../env'
import { deleteAuthUser, findUsersByEmail, getDocument } from '../lib/firestore'
import { verifyIdToken } from '../lib/idToken'
import { createCustomToken, parseServiceAccount } from '../lib/serviceAccount'

export type GoogleLinkResult =
  | { status: 200; body: { customToken: string } }
  | { status: 400 | 401 | 403 | 409 | 500; body: { error: string; message: string } }

const err = (status: 400 | 401 | 403 | 409 | 500, error: string, message: string): GoogleLinkResult => ({
  status,
  body: { error, message },
})

/**
 * Login Google hanya untuk akun yang sudah didaftarkan atasan. Firebase selalu membuat akun
 * Auth baru saat login Google, jadi akun "sementara" itu dicocokkan dengan email kontak akun
 * terdaftar, ditukar dengan custom token untuk akun terdaftar, lalu dihapus pada semua hasil.
 */
export async function googleLink(authorization: string | null, env: Env): Promise<GoogleLinkResult> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return err(401, 'no_token', 'Token login tidak ditemukan.')

  let verified
  try {
    verified = await verifyIdToken(token, env)
  } catch {
    return err(401, 'bad_token', 'Token login tidak valid.')
  }
  // Hanya akun yang baru dibuat oleh login Google yang boleh dipertukarkan dan dihapus.
  if (verified.provider !== 'google.com') return err(400, 'wrong_provider', 'Permintaan ini hanya untuk login Google.')

  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT)
  const strayUid = verified.uid
  const cleanup = async () => {
    try {
      await deleteAuthUser(env, sa, strayUid)
    } catch (e) {
      console.error('Gagal menghapus akun Google sementara', e)
    }
  }

  // Jika akun Google ini sendiri sudah terdaftar (punya dokumen users), jangan dihapus.
  const own = await getDocument(env, sa, `users/${strayUid}`)
  if (own) {
    if (own.data.disabled === true) return err(403, 'disabled', 'Akun ini dinonaktifkan.')
    return { status: 200, body: { customToken: await createCustomToken(sa, strayUid) } }
  }

  const email = verified.email?.trim().toLowerCase()
  if (!email || !verified.emailVerified) {
    await cleanup()
    return err(403, 'email_unverified', 'Email Google belum terverifikasi.')
  }

  const matches = await findUsersByEmail(env, sa, email)
  if (matches.length === 0) {
    await cleanup()
    return err(403, 'not_registered', 'Email ini belum terdaftar. Minta atasan Anda membuatkan akun terlebih dahulu.')
  }
  if (matches.length > 1) {
    await cleanup()
    return err(409, 'ambiguous', 'Email ini terdaftar pada lebih dari satu akun. Hubungi atasan Anda.')
  }
  const target = matches[0]
  if (target.data.disabled === true) {
    await cleanup()
    return err(403, 'disabled', 'Akun ini dinonaktifkan.')
  }

  const customToken = await createCustomToken(sa, target.id)
  await cleanup()
  return { status: 200, body: { customToken } }
}
