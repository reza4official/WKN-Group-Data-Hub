import type { Env } from './env'
import { googleLink } from './handlers/googleLink'
import { loginOptions, loginWithAssertion, registerCredential, registerOptions, removeCredential } from './handlers/biometric'
import { createCatalogItem, updateCatalogItem } from './handlers/catalog'
import { companyDeletePreview, deleteCatalogItem, deleteCompany, deleteProject, projectDeletePreview } from './handlers/purge'
import { importCatalog, importOpening } from './handlers/importSetup'
import { runBackupNow } from './handlers/backup'
import { refreshUsageNow, runScheduled } from './handlers/scheduled'
import { changePassword, updateProfile } from './handlers/profile'
import { addEntry, correctEntry, importEntries } from './handlers/ledger'
import { addProjectItem, setOpening, updateProjectItem } from './handlers/items'
import { createCompany, createProject, updateCompany, updateProject } from './handlers/projects'
import { createRole, deleteRole, updateRole } from './handlers/roles'
import { executeReset, requestReset } from './handlers/resets'
import { createUser, deleteUser, resetPassword, setDisabled, updateUser } from './handlers/users'
import { loadActor, type Actor } from './lib/actor'
import { HttpError, type Body } from './lib/http'
import { parseServiceAccount, type ServiceAccount } from './lib/serviceAccount'

export const VERSION = '1.0.0'

const MAX_BODY = 20_000

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return list.includes(origin) ? origin : null
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' })
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return new Response(JSON.stringify(body), { status, headers })
}

async function readBody(request: Request): Promise<Body> {
  const len = Number(request.headers.get('Content-Length') ?? '0')
  if (len > MAX_BODY) throw new HttpError(400, 'bad_request', 'Permintaan terlalu besar.')
  const text = await request.text()
  if (text.length > MAX_BODY) throw new HttpError(400, 'bad_request', 'Permintaan terlalu besar.')
  if (!text) return {}
  try {
    const v = JSON.parse(text) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Body
  } catch {
    /* jatuh ke kesalahan di bawah */
  }
  throw new HttpError(400, 'bad_request', 'Isi permintaan tidak valid.')
}

type Ctx = { actor: Actor; env: Env; sa: ServiceAccount }

/** Rute yang mengubah data: memerlukan pelaku yang masuk. Semuanya POST agar CORS sederhana. */
const AUTHED: Record<string, (c: Ctx, body: Body, req: Request) => Promise<unknown>> = {
  '/auth/webauthn/register-options': registerOptions,
  '/auth/webauthn/register': registerCredential,
  '/auth/webauthn/remove': removeCredential,
  '/users/create': createUser,
  '/users/update': updateUser,
  '/users/set-disabled': setDisabled,
  '/users/delete': deleteUser,
  '/users/reset-password': resetPassword,
  '/roles/create': createRole,
  '/roles/update': updateRole,
  '/roles/delete': deleteRole,
  '/resets/execute': executeReset,
  '/companies/create': createCompany,
  '/companies/update': updateCompany,
  '/projects/create': createProject,
  '/projects/update': updateProject,
  '/catalog/create': createCatalogItem,
  '/catalog/update': updateCatalogItem,
  '/items/add': addProjectItem,
  '/items/set-opening': setOpening,
  '/items/update': updateProjectItem,
  '/ledger/add': addEntry,
  '/ledger/correct': correctEntry,
  '/ledger/import': importEntries,
  '/catalog/import': importCatalog,
  '/catalog/delete': async (c, b) => void (await deleteCatalogItem(c, b)),
  '/projects/delete-preview': async (c, b) => ({ preview: await projectDeletePreview(c, b) }),
  '/projects/delete': async (c, b) => ({ purge: await deleteProject(c, b) }),
  '/companies/delete-preview': async (c, b) => ({ preview: await companyDeletePreview(c, b) }),
  '/companies/delete': async (c, b) => ({ purge: await deleteCompany(c, b) }),
  '/items/import': importOpening,
  '/backup/run': async (c) => ({ backup: await runBackupNow(c) }),
  '/usage/refresh': refreshUsageNow,
  '/profile/update': updateProfile,
  '/profile/change-password': changePassword,
}

export default {
  /** Cron Trigger (wrangler.toml): pemantau kuota tiap jam dan cadangan harian. */
  async scheduled(event: { scheduledTime: number }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(runScheduled(env, new Date(event.scheduledTime)))
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = allowedOrigin(request, env)

    if (request.method === 'OPTIONS') {
      const headers = new Headers({ Vary: 'Origin' })
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin)
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        headers.set('Access-Control-Max-Age', '86400')
      }
      return new Response(null, { status: 204, headers })
    }

    // Permintaan lintas-origin dari origin yang tidak diizinkan ditolak.
    if (request.headers.get('Origin') && !origin) return json({ error: 'origin_not_allowed' }, 403, null)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, service: 'wkn-data-hub-api', version: VERSION }, 200, origin)
      }
      if (request.method !== 'POST') return json({ error: 'not_found' }, 404, origin)

      if (url.pathname === '/auth/google-link') {
        const r = await googleLink(request.headers.get('Authorization'), env)
        return json(r.body, r.status, origin)
      }

      if (url.pathname === '/auth/reset-request') {
        const body = await readBody(request)
        const out = await requestReset(body, request.headers.get('CF-Connecting-IP'), env, parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT))
        return json(out, 200, origin)
      }

      if (url.pathname === '/auth/webauthn/login-options') {
        return json(await loginOptions(request, env, parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT)), 200, origin)
      }
      if (url.pathname === '/auth/webauthn/login') {
        const body = await readBody(request)
        return json(await loginWithAssertion(body, request, env, parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT)), 200, origin)
      }

      const handler = AUTHED[url.pathname]
      if (!handler) return json({ error: 'not_found' }, 404, origin)
      const body = await readBody(request)
      const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT)
      const actor = await loadActor(request.headers.get('Authorization'), env, sa)
      const result = await handler({ actor, env, sa }, body, request)
      return json({ ok: true, ...((result as object | undefined) ?? {}) }, 200, origin)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status, origin)
      console.error('Kesalahan tak terduga', e)
      // Ringkasan langkah yang gagal (mis. "Firestore get gagal (403)") membantu penelusuran. Pesan ini
      // dibuat oleh kode kita sendiri dan tidak memuat rahasia.
      const detail = e instanceof Error ? e.message.slice(0, 160) : undefined
      return json({ error: 'server_error', message: 'Terjadi kesalahan pada server.', detail }, 500, origin)
    }
  },
}
