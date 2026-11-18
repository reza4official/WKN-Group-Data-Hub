import type { Env } from '../env'
import { HttpError } from './http'

const LIMIT_PER_HOUR = 10

/**
 * Pembatas laju sekunder per IP (Turnstile adalah pertahanan utama). Satu tulis KV per permintaan.
 * Kegagalan KV (kuota habis, gangguan) TIDAK menggagalkan permintaan; hanya batas yang terlampaui yang menolak.
 */
export async function throttle(env: Env, ip: string | null): Promise<void> {
  if (!env.RATE || !ip) return
  const key = `rr:${ip}:${Math.floor(Date.now() / 3_600_000)}`
  let count = 0
  try {
    count = Number((await env.RATE.get(key)) ?? '0')
  } catch (e) {
    console.error('KV get gagal, pembatas dilewati', e)
    return
  }
  if (count >= LIMIT_PER_HOUR) throw new HttpError(429, 'rate_limited', 'Terlalu banyak permintaan. Coba lagi dalam satu jam.')
  try {
    await env.RATE.put(key, String(count + 1), { expirationTtl: 3700 })
  } catch (e) {
    console.error('KV put gagal (mungkin kuota harian habis), pembatas dilewati', e)
  }
}
