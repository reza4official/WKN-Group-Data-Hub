import type { Env } from '../env'
import { getDocument } from './firestore'
import { HttpError } from './http'
import { AuthError, verifyIdToken } from './idToken'
import type { ServiceAccount } from './serviceAccount'

export interface Actor {
  uid: string
  username: string
  name: string
  roleId: string
  roleName: string
  level: number
  perms: ReadonlySet<string>
  /** Proyek yang ditugaskan kepada pelaku. */
  projectIds: string[]
}

/**
 * Memuat pelaku dari Firestore pada SETIAP permintaan yang mengubah data. Level dan izin tidak pernah
 * dipercaya dari klien: hanya token yang diverifikasi dan dokumen users/roles terbaru.
 */
export async function loadActor(authorization: string | null, env: Env, sa: ServiceAccount): Promise<Actor> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new HttpError(401, 'no_token', 'Anda belum masuk.')
  let uid: string
  try {
    uid = (await verifyIdToken(token, env)).uid
  } catch (e) {
    if (e instanceof AuthError) throw new HttpError(401, 'bad_token', 'Sesi tidak valid. Masuk kembali.')
    throw e
  }
  const user = await getDocument(env, sa, `users/${uid}`)
  if (!user) throw new HttpError(403, 'not_registered', 'Akun ini belum terdaftar.')
  if (user.data.disabled !== false) throw new HttpError(403, 'disabled', 'Akun ini dinonaktifkan.')
  const role = await getDocument(env, sa, `roles/${String(user.data.roleId)}`)
  if (!role) throw new HttpError(403, 'no_role', 'Role akun ini tidak ditemukan.')
  const perms = Array.isArray(role.data.perms) ? (role.data.perms as string[]) : []
  return {
    uid,
    username: String(user.data.username ?? ''),
    name: String(user.data.name ?? ''),
    roleId: role.id,
    roleName: String(role.data.name ?? ''),
    level: Number(role.data.level ?? 0),
    perms: new Set(perms),
    projectIds: Array.isArray(user.data.projectIds) ? (user.data.projectIds as string[]) : [],
  }
}

export function requirePerm(actor: Actor, perm: string): void {
  if (!actor.perms.has(perm)) throw new HttpError(403, 'forbidden', 'Role Anda tidak memiliki izin untuk tindakan ini.')
}

/** Target harus berlevel STRICT lebih rendah daripada pelaku. */
export function assertLower(actor: Actor, targetLevel: number, what = 'akun'): void {
  if (!(targetLevel < actor.level)) throw new HttpError(403, 'forbidden', `Anda hanya dapat mengelola ${what} dengan level di bawah level Anda.`)
}
