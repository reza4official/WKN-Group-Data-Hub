import { beforeEach } from 'vitest'
import shared from '../../shared/permissions.json'
import worker from '../src/index'
import { resetJwksCache } from '../src/lib/idToken'
import { syntheticEmail, usernameDigest } from '../src/lib/identity'
import { resetAccessTokenCache } from '../src/lib/serviceAccount'
import type { Env } from '../src/env'
import { FakeBackend, makeEnv, rsa } from './fakeBackend'

export const ORIGIN = 'https://wkngroup-datahub.web.app'
export const roleDocs = shared.defaultRoles.map((r) => ({ ...r, perms: r.perms === 'all' ? shared.keys : r.perms }))

/** Dunia uji bersama: role bawaan, pengguna per level, dua proyek, satu perusahaan. Diatur ulang sebelum tiap tes. */
export function useWorld() {
  const sa = rsa()
  const w = {
    sa,
    be: new FakeBackend(),
    env: makeEnv(sa) as Env,
    async seedUser(uid: string, username: string, roleId: string, over: Record<string, unknown> = {}) {
      const role = w.be.getData(`roles/${roleId}`) as { level: number }
      const key = await usernameDigest(username)
      w.be.seedDoc(`users/${uid}`, { username, usernameKey: key, name: `Nama ${username}`, phone: '', emailContact: `${username}@x.com`, roleId, level: role.level, disabled: false, companyIds: [], projectIds: ['p1'], ...over })
      w.be.seedDoc(`usernames/${key}`, { uid })
      w.be.seedAuth(uid, await syntheticEmail(username), 'pw-awal-123')
    },
    async post(path: string, body: unknown, as: string | null = null, e: Env = w.env) {
      const headers: Record<string, string> = { Origin: ORIGIN, 'Content-Type': 'application/json' }
      if (as) headers.Authorization = `Bearer ${w.be.idToken(as)}`
      const r = await worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) }), e)
      return { status: r.status, body: (await r.json()) as Record<string, unknown> }
    },
    audits: () => w.be.list('auditLog').map((a) => a.data),
    lastAudit: (action: string) => w.be.list('auditLog').map((a) => a.data).filter((a) => a.action === action).pop(),
  }
  beforeEach(async () => {
    resetJwksCache()
    resetAccessTokenCache()
    w.be = new FakeBackend()
    w.be.install()
    w.env = makeEnv(sa)
    w.be.seedDoc('companies/c1', { name: 'PT. WKN', type: 'induk', active: true })
    w.be.seedDoc('projects/p1', { companyId: 'c1', name: 'Proyek 1', active: true })
    w.be.seedDoc('projects/p2', { companyId: 'c1', name: 'Proyek 2', active: true })
    w.be.seedDoc('projects/p3', { companyId: 'c1', name: 'Proyek Nonaktif', active: false })
    for (const r of roleDocs) w.be.seedDoc(`roles/${r.id}`, { name: r.name, level: r.level, system: r.system, perms: r.perms })
    await w.seedUser('u-dev', 'dev1', 'dev', { projectIds: [] })
    await w.seedUser('u-own', 'own1', 'owner', { projectIds: [] })
    await w.seedUser('u-dir', 'dir1', 'dir', { projectIds: [] })
    await w.seedUser('u-pm1', 'pm1', 'pm') // p1
    await w.seedUser('u-pm2', 'pm2', 'pm', { projectIds: ['p2'] })
    await w.seedUser('u-log', 'log1', 'log') // p1
    await w.seedUser('u-logB', 'log2', 'log', { projectIds: ['p2'] })
  })
  return w
}
