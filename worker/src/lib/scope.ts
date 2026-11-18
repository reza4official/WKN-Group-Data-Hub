import { assertLower, type Actor } from './actor'
import { HttpError } from './http'

/** Izin "projects" berarti mengelola dan melihat SEMUA proyek; akun lain berlingkup proyek yang ditugaskan. */
export const seesAllProjects = (a: Actor): boolean => a.perms.has('projects')

export function canAccessProject(a: Actor, projectId: string): boolean {
  return seesAllProjects(a) || a.projectIds.includes(projectId)
}

export function assertProjectAccess(a: Actor, projectId: string): void {
  if (!canAccessProject(a, projectId)) throw new HttpError(403, 'forbidden', 'Anda tidak ditugaskan pada proyek ini.')
}

/**
 * Pelaku hanya boleh mengelola akun yang (1) berlevel di bawahnya dan (2) bila ia tidak melihat semua
 * proyek, berbagi minimal satu proyek dengannya. Satu tempat ini dipakai semua perubahan akun.
 */
export function assertManagesUser(a: Actor, target: { level: number; projectIds: string[] }): void {
  assertLower(a, target.level)
  if (!seesAllProjects(a) && !target.projectIds.some((p) => a.projectIds.includes(p))) {
    throw new HttpError(403, 'forbidden', 'Akun ini bukan bagian dari proyek Anda.')
  }
}
