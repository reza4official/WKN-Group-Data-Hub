import type { Env } from '../env'
import { assertLower, requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, CommitError, getDocument, queryDocuments, type Doc, type Write } from '../lib/firestore'
import { HttpError, optEmail, optStr, password, str, type Body } from '../lib/http'
import { createAuthUser, deleteAuthUser, DuplicateAccountError, updateAuthUser } from '../lib/identityAdmin'
import { syntheticEmail, usernameDigest } from '../lib/identity'
import { isSubset } from '../lib/perms'
import type { ServiceAccount } from '../lib/serviceAccount'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

async function getRole(c: Ctx, id: string): Promise<Doc> {
  const role = await getDocument(c.env, c.sa, `roles/${id}`)
  if (!role) throw new HttpError(400, 'unknown_role', 'Role tidak ditemukan.')
  return role
}

/**
 * Role yang boleh diberikan pelaku: levelnya di bawah pelaku DAN seluruh izinnya dimiliki pelaku.
 * Tanpa syarat izin, pelaku bisa membuat akun berizin lebih besar lalu masuk memakainya.
 */
function assertAssignable(actor: Actor, role: Doc): void {
  const level = Number(role.data.level ?? 0)
  if (!(level < actor.level)) throw new HttpError(403, 'forbidden', 'Role harus berlevel di bawah level Anda.')
  const perms = Array.isArray(role.data.perms) ? (role.data.perms as string[]) : []
  if (!isSubset(perms, actor.perms)) throw new HttpError(403, 'forbidden', 'Role itu memiliki izin yang tidak Anda miliki.')
}

async function loadTarget(c: Ctx, uid: string): Promise<Doc> {
  const target = await getDocument(c.env, c.sa, `users/${uid}`)
  if (!target) throw new HttpError(404, 'not_found', 'Akun tidak ditemukan.')
  assertLower(c.actor, Number(target.data.level ?? 0))
  return target
}

/** Email kontak harus unik (dipakai untuk Login Google); duplikat merusak login semua pemilik email itu. */
async function assertEmailFree(c: Ctx, email: string, exceptUid?: string): Promise<void> {
  if (!email) return
  const found = await queryDocuments(c.env, c.sa, 'users', [{ field: 'emailContact', op: 'EQUAL', value: email }], 3)
  if (found.some((d) => d.id !== exceptUid)) throw new HttpError(409, 'email_taken', 'Email itu sudah dipakai akun lain.')
}

export async function createUser(c: Ctx, body: Body): Promise<{ uid: string }> {
  requirePerm(c.actor, 'users')
  const username = str(body, 'username', { max: 64, label: 'Username' })
  const name = str(body, 'name', { max: 120, label: 'Nama' })
  const phone = optStr(body, 'phone', 40, 'No. HP') ?? ''
  const email = optEmail(body, 'emailContact') ?? ''
  const roleId = str(body, 'roleId', { label: 'Role' })
  const pw = password(body)

  const role = await getRole(c, roleId)
  assertAssignable(c.actor, role)
  await assertEmailFree(c, email)

  const digest = await usernameDigest(username)
  let uid: string
  try {
    uid = await createAuthUser(c.env, c.sa, { email: await syntheticEmail(username), password: pw, displayName: name })
  } catch (e) {
    if (e instanceof DuplicateAccountError) throw new HttpError(409, 'username_taken', 'Username sudah dipakai.')
    throw e
  }

  const writes: Write[] = [
    {
      path: `users/${uid}`,
      data: {
        username,
        usernameKey: digest,
        name,
        phone,
        emailContact: email,
        roleId: role.id,
        level: Number(role.data.level),
        companyIds: [],
        projectIds: [],
        disabled: false,
        createdBy: c.actor.uid,
        createdByName: c.actor.name,
      },
      precondition: { exists: false },
      serverTime: ['createdAt'],
    },
    { path: `usernames/${digest}`, data: { uid }, precondition: { exists: false } },
    auditWrite(c.actor, 'user.create', { type: 'user', id: uid, label: username }, { role: String(role.data.name), level: Number(role.data.level) }),
  ]
  try {
    await commit(c.env, c.sa, writes)
  } catch (e) {
    await deleteAuthUser(c.env, c.sa, uid).catch(() => {}) // batalkan akun Auth agar tidak yatim
    if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'username_taken', 'Username sudah dipakai.')
    throw e
  }
  return { uid }
}

export async function updateUser(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'users')
  const uid = str(body, 'uid')
  const target = await loadTarget(c, uid)

  const data: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const track = (k: string, v: unknown) => {
    if (v !== undefined && v !== target.data[k]) {
      data[k] = v
      before[k] = target.data[k]
      after[k] = v
    }
  }
  track('name', body.name === undefined ? undefined : str(body, 'name', { max: 120, label: 'Nama' }))
  track('phone', optStr(body, 'phone', 40, 'No. HP'))
  const email = optEmail(body, 'emailContact')
  if (email !== undefined && email !== target.data.emailContact) {
    await assertEmailFree(c, email, uid)
    track('emailContact', email)
  }
  if (body.roleId !== undefined && body.roleId !== target.data.roleId) {
    const role = await getRole(c, str(body, 'roleId'))
    assertAssignable(c.actor, role)
    data.roleId = role.id
    data.level = Number(role.data.level)
    before.roleId = target.data.roleId
    after.roleId = role.id
  }
  if (Object.keys(data).length === 0) return

  await commit(c.env, c.sa, [
    {
      path: `users/${uid}`,
      data: { ...data, updatedBy: c.actor.uid, updatedByName: c.actor.name },
      mask: [...Object.keys(data), 'updatedBy', 'updatedByName', 'updatedAt'],
      precondition: target.updateTime ? { updateTime: target.updateTime } : { exists: true },
      serverTime: ['updatedAt'],
    },
    auditWrite(c.actor, 'user.update', { type: 'user', id: uid, label: String(target.data.username) }, { before, after }),
  ]).catch(conflictToHttp)
}

export async function setDisabled(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'users')
  const uid = str(body, 'uid')
  if (typeof body.disabled !== 'boolean') throw new HttpError(400, 'bad_request', 'Status tidak valid.')
  const disabled = body.disabled
  const target = await loadTarget(c, uid)
  // Auth lebih dulu: bila gagal, data tidak berubah dan pelaku dapat mengulang.
  await updateAuthUser(c.env, c.sa, uid, { disabled, revokeSessions: disabled })
  await commit(c.env, c.sa, [
    {
      path: `users/${uid}`,
      data: { disabled, updatedBy: c.actor.uid, updatedByName: c.actor.name },
      mask: ['disabled', 'updatedBy', 'updatedByName', 'updatedAt'],
      precondition: target.updateTime ? { updateTime: target.updateTime } : { exists: true },
      serverTime: ['updatedAt'],
    },
    auditWrite(c.actor, disabled ? 'user.disable' : 'user.enable', { type: 'user', id: uid, label: String(target.data.username) }),
  ]).catch(conflictToHttp)
}

export async function deleteUser(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'users')
  const uid = str(body, 'uid')
  const target = await loadTarget(c, uid)
  const key = String(target.data.usernameKey ?? '')
  const writes: Write[] = [
    { path: `users/${uid}`, delete: true, precondition: target.updateTime ? { updateTime: target.updateTime } : { exists: true } },
    auditWrite(c.actor, 'user.delete', { type: 'user', id: uid, label: String(target.data.username) }, { role: String(target.data.roleId) }),
  ]
  if (key) writes.push({ path: `usernames/${key}`, delete: true })
  await commit(c.env, c.sa, writes).catch(conflictToHttp)
  await deleteAuthUser(c.env, c.sa, uid)
}

/**
 * Reset password langsung oleh atasan. Catatan audit ditulis LEBIH DULU; bila perubahan password gagal,
 * dicatat entri pembatalan, sehingga tidak pernah ada perubahan tanpa jejak.
 */
export async function resetPassword(c: Ctx, body: Body): Promise<void> {
  requirePerm(c.actor, 'users')
  const uid = str(body, 'uid')
  const pw = password(body)
  const target = await loadTarget(c, uid)
  const label = String(target.data.username)

  const writes: Write[] = [auditWrite(c.actor, 'user.reset_password', { type: 'user', id: uid, label }, { via: 'langsung' })]
  // Permintaan reset yang masih menunggu untuk akun ini ikut ditutup, atas nama pelaku.
  const pending = await queryDocuments(c.env, c.sa, 'resetRequests', [
    { field: 'targetUid', op: 'EQUAL', value: uid },
    { field: 'status', op: 'EQUAL', value: 'pending' },
  ])
  for (const r of pending) {
    writes.push({
      path: `resetRequests/${r.id}`,
      data: { status: 'done', handledBy: c.actor.uid, handledByName: c.actor.name, handledByRole: c.actor.roleName },
      mask: ['status', 'handledBy', 'handledByName', 'handledByRole', 'handledAt'],
      precondition: r.updateTime ? { updateTime: r.updateTime } : { exists: true },
      serverTime: ['handledAt'],
    })
  }
  await commit(c.env, c.sa, writes).catch(conflictToHttp)
  try {
    await updateAuthUser(c.env, c.sa, uid, { password: pw, revokeSessions: true })
  } catch (e) {
    await commit(c.env, c.sa, [auditWrite(c.actor, 'user.reset_password_failed', { type: 'user', id: uid, label })]).catch(() => {})
    throw e
  }
}

export function conflictToHttp(e: unknown): never {
  if (e instanceof CommitError && e.conflict) throw new HttpError(409, 'conflict', 'Data baru saja diubah orang lain. Muat ulang lalu coba lagi.')
  throw e
}
