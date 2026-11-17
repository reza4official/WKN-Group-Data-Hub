import type { Env } from './env'
import { googleLink } from './handlers/googleLink'

export const VERSION = '0.2.0'

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

export default {
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

    // Permintaan lintas-origin dari origin yang tidak diizinkan ditolak (selain pemeriksaan kesehatan).
    if (request.headers.get('Origin') && !origin) return json({ error: 'origin_not_allowed' }, 403, null)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, service: 'wkn-data-hub-api', version: VERSION }, 200, origin)
      }
      if (request.method === 'POST' && url.pathname === '/auth/google-link') {
        const r = await googleLink(request.headers.get('Authorization'), env)
        return json(r.body, r.status, origin)
      }
      return json({ error: 'not_found' }, 404, origin)
    } catch (e) {
      console.error('Kesalahan tak terduga', e)
      return json({ error: 'server_error', message: 'Terjadi kesalahan pada server.' }, 500, origin)
    }
  },
}
