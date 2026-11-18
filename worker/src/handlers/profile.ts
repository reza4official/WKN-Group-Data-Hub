import type { Env } from '../env'
import type { Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, getDocument } from '../lib/firestore'
import { HttpError, optEmail, optStr, password, str, type Body } from '../lib/http'
import { updateAuthUser } from '../lib/identityAdmin'
import { verifyIdToken } from '../lib/idToken'
import type { ServiceAccount } from '../lib/serviceAccount'
import { assertEmailFree, conflictToHttp } from './users'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/** Password lama harus baru saja dimasukkan ulang: token dengan penyedia password dan auth_time paling lama 5 menit. */
const FRESH_SECONDS = 300

/**
 * Pengguna mengubah data dirinya sendiri: nama, nomor HP, dan email kontak (juga dipakai Login Google).
 * Role, level, proyek, dan status akun TIDAK dapat diubah lewat rute ini, apa pun isi permintaannya.
 */
export async function updateProfile(c: Ctx, body: Body): Promise<{ changed: string[] }> {
  const uid = c.actor.uid
  const me = await getDocument(c.env, c.sa, `users/${uid}`)
  if (!me) throw new HttpError(404, 'not_found', 'Akun tidak ditemukan.')

  const data: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const track = (k: string, v: unknown) => {
    if (v !== undefined && v !== (me.data[k] ?? '')) {
      data[k] = v
      before[k] = me.data[k] ?? ''
      after[k] = v
    }
  }
  if (body.name !== undefined) track('name', str(body, 'name', { max: 120, label: 'Nama' }))
  track('phone', optStr(body, 'phone', 40, 'No. HP'))
  const email = optEmail(body, 'emailContact')
  if (email !== undefined && email !== (me.data.emailContact ?? '')) {
    await assertEmailFree(c, email, uid)
    track('emailContact', email)
  }
  const changed = Object.keys(data)
  if (changed.length === 0) return { changed }

  await commit(c.env, c.sa, [
    {
      path: `users/${uid}`,
      data: { ...data, updatedBy: uid, updatedByName: c.actor.name },
      mask: [...changed, 'updatedBy', 'updatedByName', 'updatedAt'],
      precondition: me.updateTime ? { updateTime: me.updateTime } : { exists: true },
      serverTime: ['updatedAt'],
    },
    auditWrite(c.actor, 'profile.update', { type: 'user', id: uid, label: c.actor.username }, { before, after }),
  ]).catch(conflictToHttp)
  return { changed }
}

/**
 * Ganti password sendiri. Bukti mengetahui password lama = token yang baru saja diterbitkan dari login
 * dengan password (klien memasukkan ulang password lama lebih dulu). Catatan audit ditulis lebih dulu;
 * bila perubahan gagal, dicatat entri pembatalan. Passkey tidak dicabut (tidak bergantung pada password).
 */
export async function changePassword(c: Ctx, body: Body, req: Request): Promise<void> {
  const pw = password(body, 'newPassword')
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  const verified = await verifyIdToken(token, c.env).catch(() => null)
  const now = Math.floor(Date.now() / 1000)
  if (!verified || verified.uid !== c.actor.uid || verified.provider !== 'password' || !verified.authTime || now - verified.authTime > FRESH_SECONDS) {
    throw new HttpError(403, 'reauth_required', 'Masukkan password lama Anda terlebih dahulu.')
  }
  const target = { type: 'user' as const, id: c.actor.uid, label: c.actor.username }
  await commit(c.env, c.sa, [auditWrite(c.actor, 'profile.change_password', target)])
  try {
    await updateAuthUser(c.env, c.sa, c.actor.uid, { password: pw })
  } catch (e) {
    await commit(c.env, c.sa, [auditWrite(c.actor, 'profile.change_password_failed', target)]).catch(() => {})
    throw e
  }
}
