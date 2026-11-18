import { config } from '../config'
import { auth } from './firebase'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Memanggil Worker dengan ID token pengguna. Semua perubahan data akun, role, dan reset lewat sini. */
export async function api<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new ApiError('Sesi Anda berakhir. Masuk kembali.', 'no_token', 401)
  let res: Response
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi Anda.', 'network', 0)
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string; detail?: string }
  if (!res.ok) {
    const fallback = `Terjadi kesalahan (kode: ${json.error ?? `HTTP ${res.status}`}${json.detail ? ` - ${json.detail}` : ''}).`
    throw new ApiError(
      json.message && json.error !== 'server_error' ? json.message : fallback,
      json.error ?? 'error',
      res.status,
    )
  }
  return json as T
}

/** Permintaan reset password dari halaman login (publik, tanpa masuk). Jawaban server selalu seragam. */
export async function requestPasswordReset(username: string, turnstileToken: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${config.apiUrl}/auth/reset-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, turnstileToken }),
    })
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi Anda.', 'network', 0)
  }
  if (res.ok) return
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
  throw new ApiError(
    json.message ?? `Permintaan gagal (kode: ${json.error ?? `HTTP ${res.status}`}).`,
    json.error ?? 'error',
    res.status,
  )
}
