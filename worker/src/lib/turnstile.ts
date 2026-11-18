import { emulatorEnabled, type Env } from '../env'
import { HttpError } from './http'

/** Token palsu untuk pengujian emulator. Hanya berlaku bila emulatorEnabled (proyek berawalan demo-). */
export const EMULATOR_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN'

function allowedHostnames(env: Env): Set<string> {
  const out = new Set<string>()
  for (const o of (env.ALLOWED_ORIGINS ?? '').split(',')) {
    try {
      out.add(new URL(o.trim()).hostname)
    } catch {
      /* abaikan entri yang bukan URL */
    }
  }
  return out
}

/** Memverifikasi token Turnstile di server. Gagal tertutup: tanpa rahasia, permintaan ditolak. */
export async function verifyTurnstile(token: string, ip: string | null, env: Env): Promise<void> {
  if (emulatorEnabled(env) && token === EMULATOR_DUMMY_TOKEN) return
  if (!env.TURNSTILE_SECRET) throw new HttpError(503, 'unavailable', 'Fitur ini belum dikonfigurasi di server.')
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip ? { remoteip: ip } : {}) }),
  })
  if (!res.ok) throw new Error(`Turnstile siteverify gagal (${res.status})`)
  const r = (await res.json()) as { success?: boolean; hostname?: string }
  if (!r.success) throw new HttpError(403, 'turnstile', 'Verifikasi bot gagal. Muat ulang halaman dan coba lagi.')
  if (!r.hostname || !allowedHostnames(env).has(r.hostname)) throw new HttpError(403, 'turnstile', 'Verifikasi bot tidak valid untuk situs ini.')
}
