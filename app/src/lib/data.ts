import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'

export interface Role {
  id: string
  name: string
  level: number
  system: boolean
  perms: string[]
}
export interface UserRow {
  id: string
  username: string
  name: string
  phone: string
  emailContact: string
  roleId: string
  level: number
  disabled: boolean
}
export interface ResetRequest {
  id: string
  targetUsername: string
  targetName: string
  targetRoleId: string
  requesterLevel: number
  status: 'pending' | 'done'
  requestedAt: unknown
  handledByName: string | null
  handledByRole: string | null
  handledAt: unknown
}
export interface AuditRow {
  id: string
  at: unknown
  actorName: string
  actorUsername: string
  actorRole: string
  action: string
  targetType: string
  targetId: string
  targetLabel: string
  detail: Record<string, unknown>
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function listRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, 'roles'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        name: str(x.name),
        level: Number(x.level ?? 0),
        system: x.system === true,
        perms: Array.isArray(x.perms) ? (x.perms as string[]) : [],
      }
    })
    .sort((a, b) => b.level - a.level)
}

/** Kueri HARUS memuat batas level agar lolos Firestore Rules. */
export async function listUsersBelow(level: number): Promise<UserRow[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('level', '<', level)))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        username: str(x.username),
        name: str(x.name),
        phone: str(x.phone),
        emailContact: str(x.emailContact),
        roleId: str(x.roleId),
        level: Number(x.level ?? 0),
        disabled: x.disabled === true,
      }
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
}

export async function listResetRequests(level: number): Promise<ResetRequest[]> {
  const snap = await getDocs(query(collection(db, 'resetRequests'), where('requesterLevel', '<', level)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      targetUsername: str(x.targetUsername),
      targetName: str(x.targetName),
      targetRoleId: str(x.targetRoleId),
      requesterLevel: Number(x.requesterLevel ?? 0),
      status: x.status === 'done' ? 'done' : 'pending',
      requestedAt: x.requestedAt,
      handledByName: (x.handledByName as string | null) ?? null,
      handledByRole: (x.handledByRole as string | null) ?? null,
      handledAt: x.handledAt,
    }
  })
}

export async function listAudit(max = 200): Promise<AuditRow[]> {
  const snap = await getDocs(query(collection(db, 'auditLog'), orderBy('at', 'desc'), limit(max)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      at: x.at,
      actorName: str(x.actorName),
      actorUsername: str(x.actorUsername),
      actorRole: str(x.actorRole),
      action: str(x.action),
      targetType: str(x.targetType),
      targetId: str(x.targetId),
      targetLabel: str(x.targetLabel),
      detail: (x.detail as Record<string, unknown>) ?? {},
    }
  })
}
