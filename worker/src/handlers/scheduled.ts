import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { getDocument } from '../lib/firestore'
import { parseServiceAccount, type ServiceAccount } from '../lib/serviceAccount'
import { refreshUsage, type Usage } from '../lib/usage'
import { runBackup } from './backup'

/** Cadangan harian pukul 19:00 UTC = 03:00 WITA (cron Worker berjalan tiap jam untuk memantau kuota). */
export const BACKUP_HOUR_UTC = 19

/**
 * Pemanggilan cron per jam: segarkan pemakaian kuota; pada jam cadangan jalankan cadangan. Anggaran sub-permintaan:
 * kuota ±5 + cadangan 38 = 43 dari 50 (paket gratis).
 */
export async function runScheduled(env: Env, now: Date): Promise<void> {
  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT)
  try {
    await refreshUsage(env, sa, now)
  } catch (e) {
    console.error('Pemantauan kuota gagal', e instanceof Error ? e.message : e)
  }
  if (now.getUTCHours() === BACKUP_HOUR_UTC) {
    try {
      await runBackup(env, sa, 'cron', 38, now)
    } catch (e) {
      console.error('Cadangan gagal', e instanceof Error ? e.message : e)
    }
  }
}

/** Tombol "Segarkan" pada halaman Cadangan & Kuota: izin audit, paling cepat tiap 60 detik. */
export async function refreshUsageNow(c: { actor: Actor; env: Env; sa: ServiceAccount }): Promise<{ usage: Usage | Record<string, unknown> }> {
  requirePerm(c.actor, 'audit')
  const cur = await getDocument(c.env, c.sa, 'system/usage')
  if (cur && typeof cur.data.at === 'string' && Date.now() - new Date(cur.data.at).getTime() < 60_000) return { usage: cur.data }
  return { usage: await refreshUsage(c.env, c.sa) }
}
