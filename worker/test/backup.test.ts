import { describe, expect, it, vi } from 'vitest'
import { runBackup } from '../src/handlers/backup'
import { runScheduled } from '../src/handlers/scheduled'
import { parseServiceAccount } from '../src/lib/serviceAccount'
import { loadAppsScript } from './sheetsFake'
import { useWorld } from './world'

const w = useWorld()
const URL_ = 'https://script.google.com/macros/s/TEST-DEPLOY/exec'
const SECRET = 'rahasia-cadangan-0123456789'
const sheetEnv = () => ({ ...w.env, BACKUP_WEBHOOK_URL: URL_, BACKUP_SECRET: SECRET })
const sa = () => parseServiceAccount(w.env.FIREBASE_SERVICE_ACCOUNT)
const state = () => w.be.getData('system/backup')!

/** Memasang Apps Script palsu (Code.gs asli) sebagai layanan luar; mengembalikan handel untuk memeriksa Sheet. */
function sheets(over: Record<string, string> = {}) {
  const gs = loadAppsScript({ SECRET, SHEET_ID: 'SHEET1', ...over })
  const hits: { tables: number }[] = []
  w.be.externals.set(URL_, async (_u, init) => {
    hits.push({ tables: JSON.parse(String(init?.body)).tables.length })
    return new Response(JSON.stringify(gs.post(String(init?.body))), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  return { gs, hits }
}
const seedLedger = (n: number, startMs: number, pid = 'p1') => {
  for (let i = 0; i < n; i++) w.be.seedDoc(`projects/${pid}/ledger/e${String(i).padStart(4, '0')}`, { itemId: 'i1', date: '2026-09-10', ym: '2026-09', type: 'masuk', in: 1, out: 0, seq: i + 1, note: `n${i}`, createdBy: 'u-log', createdByName: 'Siti', createdByRole: 'Admin', createdAt: new Date(startMs + i * 1000).toISOString() })
}

describe('cadangan ke Google Sheets', () => {
  it('belum dikonfigurasi: status "unconfigured", tanpa galat dan tanpa menghubungi apa pun', async () => {
    const s = await runBackup(w.env, sa(), 'cron')
    expect(s.lastStatus).toBe('unconfigured')
    expect(s.lastError).toBe('')
    expect(state().lastStatus).toBe('unconfigured')
    expect(w.be.calls.some((c) => c.includes('script.google.com'))).toBe(false)
  })

  it('putaran pertama menyalin semua tabel; kolom cukup untuk pemulihan; tanpa rahasia akun', async () => {
    const { gs } = sheets()
    w.be.seedDoc('projects/p1/items/i1', { openingQty: 100, openingDate: '2026-09-01', currentStock: 90, txCount: 1, minStock: 10, active: true, lastTxDate: '2026-09-10' })
    w.be.seedDoc('catalog/i1', { name: '=Semen', unit: 'Sak', active: true, minStock: 10, projectCount: 1, nameKey: 'RAHASIA-HASH' })
    seedLedger(2, Date.parse('2026-09-10T02:00:00Z'))
    w.be.seedDoc('webauthnCredentials/abc', { uid: 'u-pm1', publicKey: 'PUB' })
    const s = await runBackup(sheetEnv(), sa(), 'cron')
    expect(s.lastStatus).toBe('ok')
    expect(s.lastOkAt).not.toBe('')
    const users = gs.ss.data('Pengguna')
    expect(users[0]).toContain('Username')
    expect(users.length).toBeGreaterThan(5) // judul + akun uji
    expect(JSON.stringify([...gs.ss.sheets.values()].map((x) => x.rows))).not.toMatch(/RAHASIA-HASH|PUB|pw-awal/) // hash nama, kunci passkey, password
    expect(gs.ss.sheets.has('webauthnCredentials')).toBe(false)
    expect(gs.ss.data('Katalog')[1][1]).toBe("'=Semen") // rumus dinetralkan
    expect(gs.ss.data('Barang Proyek')[1]).toEqual(['p1/i1', 'p1', 'i1', 100, '2026-09-01', 90, 1, 10, true, '2026-09-10', ''])
    const led = gs.ss.data('Transaksi')
    expect(led[0]).toContain('Entri asal (koreksi)')
    expect(led).toHaveLength(3)
    expect(led[1].slice(0, 6)).toEqual(['p1/e0000', 'p1', 'e0000', 'i1', '2026-09-10', 'masuk'])
    expect(gs.ss.data('Role').length).toBeGreaterThan(3)
  })

  it('kursor: putaran berikutnya hanya mengirim transaksi baru; baris lama tidak ganda', async () => {
    const { gs } = sheets()
    seedLedger(3, Date.parse('2026-09-10T02:00:00Z'))
    await runBackup(sheetEnv(), sa(), 'cron')
    expect(gs.ss.data('Transaksi')).toHaveLength(4)
    expect(state().cursors['ledger:p1']).toBe('2026-09-10T02:00:02.000Z')
    const hitsBefore = w.be.calls.length
    seedLedger(2, Date.parse('2026-09-11T02:00:00Z')) // id e0000/e0001 sama dengan yang lama -> menimpa; ganti id
    w.be.docs.delete('projects/p1/ledger/e0000')
    w.be.docs.delete('projects/p1/ledger/e0001')
    w.be.seedDoc('projects/p1/ledger/baru1', { itemId: 'i1', date: '2026-09-11', type: 'keluar', in: 0, out: 1, seq: 9, createdAt: '2026-09-11T02:00:00.000Z' })
    await runBackup(sheetEnv(), sa(), 'cron')
    const led = gs.ss.data('Transaksi')
    expect(led.map((r) => r[0]).sort()).toEqual(['Kunci', 'p1/baru1', 'p1/e0000', 'p1/e0001', 'p1/e0002'].sort())
    expect(w.be.calls.length).toBeGreaterThan(hitsBefore)
  })

  it('transaksi dengan waktu server identik di batas halaman tidak hilang (>=, bukan >) dan tidak ganda', async () => {
    const { gs } = sheets()
    // 150 transaksi satu impor: createdAt sama persis
    for (let i = 0; i < 150; i++) w.be.seedDoc(`projects/p1/ledger/imp-${String(i).padStart(3, '0')}`, { itemId: 'i1', date: '2026-09-10', type: 'masuk', in: 1, out: 0, seq: i, createdAt: '2026-09-10T02:00:00.000Z' })
    await runBackup(sheetEnv(), sa(), 'cron')
    expect(gs.ss.data('Transaksi')).toHaveLength(151)
    w.be.seedDoc('projects/p1/ledger/imp-zzz', { itemId: 'i1', date: '2026-09-10', type: 'masuk', in: 1, out: 0, seq: 151, createdAt: '2026-09-10T02:00:00.000Z' }) // satu lagi pada detik yang sama
    await runBackup(sheetEnv(), sa(), 'cron')
    expect(gs.ss.data('Transaksi')).toHaveLength(152)
    expect(new Set(gs.ss.data('Transaksi').map((r) => r[0])).size).toBe(152)
  })

  it('halaman penuh (500): status "partial" dan putaran berikutnya melanjutkan sampai tuntas', async () => {
    const { gs } = sheets()
    seedLedger(620, Date.parse('2026-09-10T00:00:00Z'))
    expect((await runBackup(sheetEnv(), sa(), 'cron')).lastStatus).toBe('partial')
    expect(gs.ss.data('Transaksi').length).toBe(501)
    expect((await runBackup(sheetEnv(), sa(), 'cron')).lastStatus).toBe('ok')
    expect(gs.ss.data('Transaksi').length).toBe(621)
  })

  it('gagal di Apps Script (ditolak, jaringan, format salah): kursor tidak maju, galat tanpa URL/rahasia, lalu pulih', async () => {
    const { gs } = sheets()
    seedLedger(2, Date.parse('2026-09-10T02:00:00Z'))
    w.be.externals.set(URL_, async () => new Response(JSON.stringify({ ok: false, error: `gagal ${URL_} ${SECRET}` }), { status: 200 }))
    const bad = await runBackup(sheetEnv(), sa(), 'cron')
    expect(bad.lastStatus).toBe('error')
    expect(bad.lastError).not.toContain(SECRET)
    expect(bad.lastError).not.toContain('TEST-DEPLOY')
    expect(state().cursors).toEqual({})
    w.be.externals.set(URL_, async () => new Response('<html>Halaman masuk Google</html>', { status: 200 }))
    expect((await runBackup(sheetEnv(), sa(), 'cron')).lastError).toMatch(/format tak dikenal/)
    w.be.externals.set(URL_, async () => {
      throw new Error(`koneksi putus ke ${URL_}`)
    })
    expect((await runBackup(sheetEnv(), sa(), 'cron')).lastError).not.toContain('TEST-DEPLOY')
    sheets() // pulih
    expect((await runBackup(sheetEnv(), sa(), 'cron')).lastStatus).toBe('ok')
    expect(state().lastError).toBe('')
    void gs
  })

  it('rahasia salah di Apps Script: ditolak dengan pesan jelas; data tidak tertulis', async () => {
    const { gs } = sheets({ SECRET: 'rahasia-lain-0123456789ab' })
    const s = await runBackup(sheetEnv(), sa(), 'cron')
    expect(s.lastStatus).toBe('error')
    expect(s.lastError).toContain('unauthorized')
    expect(gs.ss.sheets.size).toBe(0)
  })

  it('satu putaran memakai di bawah 40 sub-permintaan walau banyak proyek; sisa proyek dilanjutkan putaran berikutnya', async () => {
    const { gs } = sheets()
    for (let i = 1; i <= 25; i++) {
      w.be.seedDoc(`projects/q${String(i).padStart(2, '0')}`, { companyId: 'c1', name: `Proyek ${i}`, active: true })
      w.be.seedDoc(`projects/q${String(i).padStart(2, '0')}/ledger/e1`, { itemId: 'i1', date: '2026-09-10', type: 'masuk', in: 1, out: 0, seq: 1, createdAt: `2026-09-10T02:00:${String(i).padStart(2, '0')}.000Z` })
    }
    const c0 = w.be.calls.length
    const s1 = await runBackup(sheetEnv(), sa(), 'cron')
    expect(w.be.calls.length - c0).toBeLessThan(40)
    expect(s1.lastStatus).toBe('partial')
    for (let k = 0; k < 4 && state().lastStatus === 'partial'; k++) await runBackup(sheetEnv(), sa(), 'cron')
    expect(state().lastStatus).toBe('ok')
    expect(gs.ss.data('Transaksi').filter((r) => String(r[0]).startsWith('q')).length).toBe(25)
  })

  it('pemutaran ulang putaran yang sama idempoten (baris upsert tidak ganda)', async () => {
    const { gs } = sheets()
    seedLedger(2, Date.parse('2026-09-10T02:00:00Z'))
    await runBackup(sheetEnv(), sa(), 'cron')
    const snap = JSON.stringify([...gs.ss.sheets.entries()].map(([k, v]) => [k, v.rows]))
    w.be.docs.delete('system/backup') // seolah-olah status hilang: semuanya dikirim ulang
    await runBackup(sheetEnv(), sa(), 'cron')
    expect(JSON.stringify([...gs.ss.sheets.entries()].map(([k, v]) => [k, v.rows]))).toBe(snap)
    expect(gs.ss.data('Transaksi')).toHaveLength(3)
    expect(gs.ss.data('Proyek')).toHaveLength(new Set(gs.ss.data('Proyek').map((r) => r[0])).size)
  })
})

describe('/backup/run (manual)', () => {
  it('butuh izin audit; belum dikonfigurasi -> 409; jeda 5 menit -> 429; tercatat di audit', async () => {
    expect((await w.post('/backup/run', {}, 'u-pm1')).status).toBe(403)
    expect((await w.post('/backup/run', {}, 'u-own')).body.error).toBe('not_configured')
    sheets()
    const env = sheetEnv()
    const r1 = await w.post('/backup/run', {}, 'u-own', env)
    expect(r1.status).toBe(200)
    expect((r1.body.backup as { lastStatus: string }).lastStatus).toBe('ok')
    expect(w.lastAudit('backup.run')).toMatchObject({ actorUid: 'u-own' })
    const r2 = await w.post('/backup/run', {}, 'u-own', env)
    expect(r2.status).toBe(429)
    expect(r2.body.error).toBe('cooldown')
    expect((await w.post('/backup/run', {})).status).toBe(401)
  })

  it('permintaan manual tetap di bawah 50 sub-permintaan Workers (termasuk muat pelaku dan audit)', async () => {
    sheets()
    for (let i = 1; i <= 25; i++) w.be.seedDoc(`projects/q${i}`, { companyId: 'c1', name: `P${i}`, active: true })
    const c0 = w.be.calls.length
    const r = await w.post('/backup/run', {}, 'u-own', sheetEnv())
    expect(r.status).toBe(200)
    expect(w.be.calls.length - c0).toBeLessThan(50)
  })
})

describe('cron terjadwal', () => {
  it('jam cadangan menjalankan cadangan dan menyegarkan kuota; jam lain hanya kuota', async () => {
    const { hits } = sheets()
    const env = sheetEnv()
    await runScheduled(env, new Date('2026-11-18T05:00:00Z'))
    expect(hits).toHaveLength(0)
    expect(w.be.getData('system/usage')).toBeTruthy()
    await runScheduled(env, new Date('2026-11-18T19:00:00Z'))
    expect(hits.length).toBe(2)
    expect(state().lastTrigger).toBe('cron')
  })

  it('kegagalan kuota tidak menggagalkan cadangan, dan satu jam penuh tetap < 50 sub-permintaan', async () => {
    sheets()
    const c0 = w.be.calls.length
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await runScheduled(sheetEnv(), new Date('2026-11-18T19:00:00Z'))
    expect(w.be.calls.length - c0).toBeLessThan(50)
    expect(state().lastStatus).toBe('ok')
  })
})
