import { describe, expect, it } from 'vitest'
import { pacificDayStart, refreshUsage } from '../src/lib/usage'
import { parseServiceAccount } from '../src/lib/serviceAccount'
import { useWorld } from './world'

const w = useWorld()
const sa = () => parseServiceAccount(w.env.FIREBASE_SERVICE_ACCOUNT)
const MON = 'https://monitoring.googleapis.com/v3/projects/wkngroup-datahub/timeSeries'

describe('awal hari kuota (tengah malam Pasifik)', () => {
  it('musim dingin (PST, UTC-8) dan musim panas (PDT, UTC-7)', () => {
    expect(pacificDayStart(new Date('2026-11-18T03:00:00Z')).toISOString()).toBe('2026-11-17T08:00:00.000Z') // 19:00 PST tgl 17
    expect(pacificDayStart(new Date('2026-11-18T09:30:00Z')).toISOString()).toBe('2026-11-18T08:00:00.000Z')
    expect(pacificDayStart(new Date('2026-07-10T03:00:00Z')).toISOString()).toBe('2026-07-09T07:00:00.000Z') // PDT
  })
  it('tepat tengah malam Pasifik dan satu detik sebelumnya', () => {
    expect(pacificDayStart(new Date('2026-11-18T08:00:00Z')).toISOString()).toBe('2026-11-18T08:00:00.000Z')
    expect(pacificDayStart(new Date('2026-11-18T07:59:59Z')).toISOString()).toBe('2026-11-17T08:00:00.000Z')
  })
})

describe('refreshUsage', () => {
  const series = (n: number) => ({ timeSeries: [{ points: [{ value: { int64Value: String(n) } }] }] })

  it('menjumlah metrik baca/tulis/hapus dari Cloud Monitoring dan menyimpannya di system/usage', async () => {
    const urls: string[] = []
    w.be.externals.set(MON, async (u) => {
      urls.push(u)
      return new Response(JSON.stringify(u.includes('read_count') ? series(41_000) : u.includes('write_count') ? series(1_234) : { timeSeries: [] }), { status: 200 })
    })
    const env = { ...w.env, USE_EMULATOR: undefined }
    const u = await refreshUsage(env, sa(), new Date('2026-11-18T12:00:00Z'))
    expect(u).toMatchObject({ status: 'ok', reads: 41_000, writes: 1_234, deletes: 0, windowStart: '2026-11-18T08:00:00.000Z' })
    expect(u.limits).toEqual({ reads: 50_000, writes: 20_000, deletes: 20_000 })
    expect(w.be.getData('system/usage')).toMatchObject({ status: 'ok', reads: 41_000 })
    expect(urls).toHaveLength(3)
    const q = new URL(urls[0]).searchParams
    expect(q.get('filter')).toContain('firestore.googleapis.com/document/read_count')
    expect(q.get('interval.startTime')).toBe('2026-11-18T08:00:00.000Z')
    expect(q.get('aggregation.perSeriesAligner')).toBe('ALIGN_SUM')
  })

  it('tanpa izin (403) atau API belum aktif (404): "unavailable" dengan petunjuk, bukan galat', async () => {
    const env = { ...w.env, USE_EMULATOR: undefined }
    w.be.externals.set(MON, async () => new Response('{}', { status: 403 }))
    const a = await refreshUsage(env, sa())
    expect(a.status).toBe('unavailable')
    expect(a.reason).toContain('Monitoring Viewer')
    w.be.externals.set(MON, async () => new Response('{}', { status: 404 }))
    expect((await refreshUsage(env, sa())).reason).toContain('Monitoring API')
    w.be.externals.set(MON, async () => {
      throw new Error('jaringan')
    })
    expect((await refreshUsage(env, sa())).status).toBe('unavailable')
    expect(w.be.getData('system/usage')!.status).toBe('unavailable')
  })

  it('di emulator: tidak menghubungi Monitoring', async () => {
    w.be.externals.set(MON, async () => {
      throw new Error('tidak boleh dipanggil')
    })
    const u = await refreshUsage({ ...w.env, USE_EMULATOR: 'true', FIREBASE_PROJECT_ID: 'demo-x' }, sa())
    expect(u.status).toBe('unavailable')
    expect(u.reason).toContain('emulator')
  })

  it('/usage/refresh: izin audit; paling cepat tiap 60 detik', async () => {
    expect((await w.post('/usage/refresh', {}, 'u-pm1')).status).toBe(403)
    const r1 = await w.post('/usage/refresh', {}, 'u-own')
    expect(r1.status).toBe(200)
    const at = (r1.body.usage as { at: string }).at
    const r2 = await w.post('/usage/refresh', {}, 'u-own')
    expect((r2.body.usage as { at: string }).at).toBe(at) // dari cache
  })
})
