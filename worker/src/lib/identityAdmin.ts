import { endpoints, type Env } from '../env'
import { getAccessToken, type ServiceAccount } from './serviceAccount'

async function call(env: Env, sa: ServiceAccount, path: string, body: unknown): Promise<Response> {
  return fetch(`${endpoints(env).identityAdmin}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken(env, sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export class DuplicateAccountError extends Error {}

/** Membuat akun Authentication. Melempar DuplicateAccountError bila email (hash username) sudah ada. */
export async function createAuthUser(env: Env, sa: ServiceAccount, user: { email: string; password: string; displayName: string }): Promise<string> {
  const res = await call(env, sa, 'accounts', { ...user, emailVerified: true })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (/EMAIL_EXISTS|DUPLICATE/.test(text)) throw new DuplicateAccountError('Username sudah dipakai')
    throw new Error(`Buat akun Auth gagal (${res.status})`)
  }
  return ((await res.json()) as { localId: string }).localId
}

/** Mengganti password, menonaktifkan/mengaktifkan, dan mencabut sesi lama (validSince) bila diminta. */
export async function updateAuthUser(
  env: Env,
  sa: ServiceAccount,
  uid: string,
  change: { password?: string; disabled?: boolean; revokeSessions?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = { localId: uid }
  if (change.password !== undefined) body.password = change.password
  if (change.disabled !== undefined) body.disableUser = change.disabled
  if (change.revokeSessions) body.validSince = String(Math.floor(Date.now() / 1000))
  const res = await call(env, sa, 'accounts:update', body)
  if (!res.ok) throw new Error(`Ubah akun Auth gagal (${res.status})`)
}

export async function deleteAuthUser(env: Env, sa: ServiceAccount, uid: string): Promise<void> {
  const res = await call(env, sa, 'accounts:delete', { localId: uid })
  if (!res.ok) throw new Error(`Hapus akun Auth gagal (${res.status})`)
}
