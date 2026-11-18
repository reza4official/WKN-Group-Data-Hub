import type { Env } from '../env'
import { emulatorEnabled } from '../env'
import { commit } from './firestore'
import { getAccessToken, type ServiceAccount } from './serviceAccount'

/** Batas harian paket gratis Firestore (Spark). Kuota di-reset tengah malam waktu Pasifik, bukan WITA. */
export const LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 }
const METRICS = { reads: 'read_count', writes: 'write_count', deletes: 'delete_count' } as const

/** Awal hari kuota saat ini: tengah malam America/Los_Angeles (mengikuti DST), dalam UTC. */
export function pacificDayStart(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const elapsed = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - elapsed * 1000)
}

export interface Usage {
  status: 'ok' | 'unavailable'
  at: string
  windowStart: string
  reads: number
  writes: number
  deletes: number
  limits: typeof LIMITS
  reason: string
}

async function metric(env: Env, token: string, kind: keyof typeof METRICS, start: Date, end: Date): Promise<number> {
  const secs = Math.max(60, Math.ceil((end.getTime() - start.getTime()) / 1000))
  const q = new URLSearchParams({
    filter: `metric.type="firestore.googleapis.com/document/${METRICS[kind]}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${secs}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  })
  const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${env.FIREBASE_PROJECT_ID}/timeSeries?${q}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw Object.assign(new Error(`Monitoring ${res.status}`), { status: res.status })
  const body = (await res.json()) as { timeSeries?: { points?: { value?: { int64Value?: string; doubleValue?: number } }[] }[] }
  let total = 0
  for (const ts of body.timeSeries ?? []) for (const p of ts.points ?? []) total += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0)
  return Math.round(total)
}

const EMPTY = { reads: 0, writes: 0, deletes: 0, limits: LIMITS }

/**
 * Membaca pemakaian Firestore hari kuota ini dari Cloud Monitoring (satu-satunya sumber yang ikut menghitung bacaan oleh
 * klien) dan menyimpannya di system/usage. Tanpa izin Monitoring Viewer hasilnya "unavailable" dengan petunjuk, bukan galat.
 */
export async function refreshUsage(env: Env, sa: ServiceAccount, now = new Date()): Promise<Usage> {
  const start = pacificDayStart(now)
  const base = { at: now.toISOString(), windowStart: start.toISOString() }
  let usage: Usage
  if (emulatorEnabled(env)) {
    usage = { status: 'unavailable', ...base, ...EMPTY, reason: 'Pemantauan kuota tidak tersedia di emulator.' }
  } else {
    try {
      const token = await getAccessToken(env, sa)
      const [reads, writes, deletes] = await Promise.all((['reads', 'writes', 'deletes'] as const).map((k) => metric(env, token, k, start, now)))
      usage = { status: 'ok', ...base, reads, writes, deletes, limits: LIMITS, reason: '' }
    } catch (e) {
      const st = (e as { status?: number }).status
      usage = {
        status: 'unavailable',
        ...base,
        ...EMPTY,
        reason:
          st === 403
            ? 'Akun layanan Worker belum diberi peran Monitoring Viewer di proyek Firebase (lihat panduan Tahap 9).'
            : st === 404
              ? 'Cloud Monitoring API belum aktif di proyek (lihat panduan Tahap 9).'
              : 'Cloud Monitoring tidak dapat dihubungi saat ini.',
      }
    }
  }
  await commit(env, sa, [{ path: 'system/usage', data: { ...usage } }]).catch(() => {})
  return usage
}
