import type { Actor } from './actor'
import type { Write } from './firestore'

export interface AuditTarget {
  type: 'user' | 'role' | 'reset' | 'company' | 'project' | 'catalog' | 'item' | 'biometric' | 'system'
  id: string
  label: string
}

/**
 * Entri audit (append-only). Dituliskan dalam commit yang SAMA dengan perubahan datanya. Waktu berasal
 * dari server Firestore (REQUEST_TIME). Kolom bernama password dibuang agar rahasia tidak pernah tercatat.
 */
export function auditWrite(actor: Actor, action: string, target: AuditTarget, detail: Record<string, unknown> = {}): Write {
  const safe = Object.fromEntries(Object.entries(detail).filter(([k]) => !/pass|secret|token/i.test(k)))
  return {
    path: `auditLog/${crypto.randomUUID()}`,
    data: {
      actorUid: actor.uid,
      actorUsername: actor.username,
      actorName: actor.name,
      actorRole: actor.roleName,
      actorLevel: actor.level,
      action,
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label,
      detail: safe,
    },
    precondition: { exists: false },
    serverTime: ['at'],
  }
}
