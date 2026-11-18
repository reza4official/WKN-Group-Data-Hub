import type { Env } from '../env'
import { assertLower, requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, CommitError, getDocument, queryDocuments } from '../lib/firestore'
import { HttpError, password, str, type Body } from '../lib/http'
import { usernameDigest } from '../lib/identity'
import { updateAuthUser } from '../lib/identityAdmin'
import { throttle } from '../lib/rateLimit'
import type { ServiceAccount } from '../lib/serviceAccount'
import { verifyTurnstile } from '../lib/turnstile'
import { conflictToHttp } from './users'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

/**
 * Permintaan reset dari halaman login (tanpa masuk). Jawabannya SELALU sama, apa pun keadaan akunnya
 * (ada, tidak ada, Developer yang tak punya atasan, atau sudah ada permintaan), agar daftar username
 * tidak dapat ditebak.
 */
export async function requestReset(body: Body, ip: string | null, env: Env, sa: ServiceAccount): Promise<{ ok: true }> {
  const username = str(body, 'username', { max: 64, label: 'Username' })
  const token = str(body, 'turnstileToken', { max: 4096, label: 'Verifikasi bot' })
  await verifyTurnstile(token, ip, env)
  await throttle(env, ip)

  const key = await usernameDigest(username)
  const mapping = await getDocument(env, sa, `usernames/${key}`)
  const uid = mapping ? String(mapping.data.uid ?? '') : ''
  const user = uid ? await getDocument(env, sa, `users/${uid}`) : null
  if (!user || user.data.disabled === true) return { ok: true }
  const level = Number(user.data.level ?? 0)
  if (level >= 100) return { ok: true } // Developer tidak punya atasan; reset lewat Firebase Console

  const pending = await queryDocuments(env, sa, 'resetRequests', [
    { field: 'targetUid', op: 'EQUAL', value: uid },
    { field: 'status', op: 'EQUAL', value: 'pending' },
  ], 1)
  if (pending.length) return { ok: true }

  const id = crypto.randomUUID()
  const label = String(user.data.username)
  const pseudoActor: Actor = {
    uid,
    username: label,
    name: String(user.data.name ?? label),
    roleId: String(user.data.roleId ?? ''),
    roleName: String(user.data.roleId ?? ''),
    level,
    perms: new Set(),
  }
  await commit(env, sa, [
    {
      path: `resetRequests/${id}`,
      data: {
        targetUid: uid,
        targetUsername: label,
        targetName: String(user.data.name ?? ''),
        targetRoleId: String(user.data.roleId ?? ''),
        requesterLevel: level,
        status: 'pending',
        handledBy: null,
        handledByName: null,
        handledByRole: null,
      },
      precondition: { exists: false },
      serverTime: ['requestedAt'],
    },
    auditWrite(pseudoActor, 'reset.request', { type: 'reset', id, label }, { catatan: 'Dikirim dari halaman login tanpa autentikasi' }),
  ]).catch(conflictToHttp)
  return { ok: true }
}

/**
 * Eksekusi permintaan oleh atasan. Permintaan "diklaim" lebih dulu dengan prasyarat updateTime, sehingga dua
 * atasan yang menekan tombol bersamaan tidak bisa sama-sama mengganti password. Bila perubahan password
 * gagal, klaim dikembalikan ke "pending" dan dicatat entri pembatalan.
 */
export async function executeReset(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'resets')
  const id = str(body, 'id')
  const pw = password(body)
  const req = await getDocument(c.env, c.sa, `resetRequests/${id}`)
  if (!req) throw new HttpError(404, 'not_found', 'Permintaan tidak ditemukan.')
  if (req.data.status !== 'pending') throw new HttpError(409, 'already_handled', 'Permintaan ini sudah ditangani.')
  const uid = String(req.data.targetUid)
  const target = await getDocument(c.env, c.sa, `users/${uid}`)
  if (!target) throw new HttpError(404, 'not_found', 'Akun pemohon sudah tidak ada.')
  assertLower(c.actor, Number(target.data.level ?? 0))
  const label = String(target.data.username)

  await commit(c.env, c.sa, [
    {
      path: `resetRequests/${id}`,
      data: { status: 'done', handledBy: c.actor.uid, handledByName: c.actor.name, handledByRole: c.actor.roleName },
      mask: ['status', 'handledBy', 'handledByName', 'handledByRole', 'handledAt'],
      precondition: req.updateTime ? { updateTime: req.updateTime } : { exists: true },
      serverTime: ['handledAt'],
    },
    auditWrite(c.actor, 'user.reset_password', { type: 'user', id: uid, label }, { via: 'permintaan', permintaan: id }),
  ]).catch((e) => {
    if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'already_handled', 'Permintaan ini baru saja ditangani orang lain.')
    throw e
  })

  try {
    await updateAuthUser(c.env, c.sa, uid, { password: pw, revokeSessions: true })
  } catch (e) {
    const fresh = await getDocument(c.env, c.sa, `resetRequests/${id}`).catch(() => null)
    await commit(c.env, c.sa, [
      {
        path: `resetRequests/${id}`,
        data: { status: 'pending', handledBy: null, handledByName: null, handledByRole: null, handledAt: null },
        mask: ['status', 'handledBy', 'handledByName', 'handledByRole', 'handledAt'],
        precondition: fresh?.updateTime ? { updateTime: fresh.updateTime } : { exists: true },
      },
      auditWrite(c.actor, 'user.reset_password_failed', { type: 'user', id: uid, label }, { permintaan: id }),
    ]).catch(() => {})
    throw e
  }
}
