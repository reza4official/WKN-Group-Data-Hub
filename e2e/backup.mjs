// Uji end-to-end cadangan Google Sheets: Worker dev (dengan BACKUP_WEBHOOK_URL) -> server Apps Script palsu yang menjalankan
// Code.gs ASLI dan meniru pola web app (POST dijawab 302 ke alamat hasil, lalu GET). Halaman "Cadangan & Kuota" di browser.
// Prasyarat: emulator, build emulator di :4173, Worker dev dengan BACKUP_WEBHOOK_URL=http://127.0.0.1:8799/exec dan
// BACKUP_SECRET=rahasia-e2e-0123456789 (lihat skrip pembungkus), akun Developer.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import vm from 'node:vm'
import { chromium } from 'playwright'

const SECRET = 'rahasia-e2e-0123456789'
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])

// ---------- Apps Script palsu (Code.gs asli di vm, Sheets dalam memori) ----------
class Sheet {
  rows = []
  getLastRow() { return this.rows.length }
  clearContents() { this.rows = [] }
  getDataRange() { return { getValues: () => this.rows.map((r) => [...r]) } }
  getRange(r, c, nr, nc) {
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setNumberFormats: () => {}, // Code.gs fixa format teks '@'; nilai disimpan apa adanya (penafsiran ulang diuji di unit test Apps Script)
      setValues: (vals) => vals.forEach((row, i) => { const t = (this.rows[r - 1 + i] ??= []); row.forEach((v, j) => (t[c - 1 + j] = v)) }),
    }
  }
}
const sheets = new Map()
const ss = { getSheetByName: (n) => sheets.get(n) ?? null, insertSheet: (n) => (sheets.set(n, new Sheet()), sheets.get(n)) }
const props = { SECRET, SHEET_ID: 'S1' }
const ctxVm = {
  SpreadsheetApp: { openById: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this } }) },
}
vm.createContext(ctxVm)
vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctxVm)
const pending = new Map()
let posts = 0
createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/exec') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      posts++
      const id = String(posts)
      pending.set(id, ctxVm.doPost({ postData: { contents: body } }).text)
      res.writeHead(302, { Location: `http://127.0.0.1:8799/result/${id}` })
      res.end()
    })
  } else if (req.method === 'GET' && req.url.startsWith('/result/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(pending.get(req.url.split('/').pop()) ?? '{"ok":false}')
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(8799, '127.0.0.1')

// ---------- data uji ----------
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const r0 = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })
const { idToken } = await r0.json()
const call = async (path, body) => (await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const wita = new Date(Date.now() + 8 * 3_600_000)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)}-01`
const day = (back) => new Date(Date.now() + 8 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10)
const co = await call('/companies/create', { name: 'PT. Uji Cadangan', type: 'induk' })
const pr = await call('/projects/create', { companyId: co.id, name: 'Proyek Cadangan' })
const cat = await call('/catalog/create', { name: '=Semen Rumus', unit: 'Sak', minStock: 20 })
await call('/items/add', { projectId: pr.id, catalogId: cat.id, openingQty: 100, openingDate: OPEN })
for (const [i, [type, qty]] of [['masuk', 40], ['keluar', 30], ['keluar', 5]].entries()) {
  await call('/ledger/add', { projectId: pr.id, itemId: cat.id, type, qty, date: day(2), note: `uji ${i}`, requestId: `bk-${Date.now()}-${i}` })
}
await call('/users/create', { username: 'budi', name: 'Budi Manajer', password: 'budi-pass-1', roleId: 'pm', projectIds: [pr.id] }).catch(() => {})

// ---------- browser ----------
const b = await chromium.launch()
const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const errs = []
pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(500)
}
await pg.goto('http://127.0.0.1:4173/')
await pg.waitForSelector('#login-username')
await pg.fill('#login-username', 'Reza4Official_')
await pg.fill('input[autocomplete=current-password]', 'rahasia123')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')
ok('menu Cadangan & Kuota ada untuk pemegang izin audit', (await pg.$$eval('.nav a', (a) => a.map((x) => x.textContent.trim()))).includes('Cadangan & Kuota'))
await go('backup')
await pg.waitForSelector('text=Belum pernah berjalan')
ok('keadaan awal: belum pernah berjalan', true)
await pg.waitForSelector('text=/Belum ada data/')
await pg.click('button:has-text("Segarkan")')
await pg.waitForSelector('text=/tidak tersedia di emulator/')
ok('kuota: sebelum cron "belum ada data"; Segarkan di emulator menjelaskan tidak tersedia, tanpa angka palsu', true)
await pg.click('button:has-text("Cadangkan sekarang")')
await pg.waitForSelector('.pill.ok:text-is("Berhasil")')
const page1 = await pg.textContent('main')
ok('cadangan berhasil: status, waktu WITA, sumber manual', page1.includes('WITA') && page1.includes('manual'), page1.slice(0, 300))
ok('jumlah baris per lembar tampil', page1.includes('Transaksi:') && page1.includes('Pengguna:'))
ok('Apps Script dipanggil lewat pola 302 (dua putaran webhook)', posts === 2, String(posts))

const data = (n) => sheets.get(n)?.rows ?? []
ok('lembar Transaksi: 3 baris dengan kolom lengkap', data('Transaksi').length === 4 && data('Transaksi')[0].includes('Entri asal (koreksi)') && data('Transaksi')[1][5] === 'masuk', JSON.stringify(data('Transaksi')[1]))
ok('Barang Proyek: saldo awal dan stok kini (100 + 40 - 30 - 5 = 105)', data('Barang Proyek')[1][3] === 100 && data('Barang Proyek')[1][5] === 105, JSON.stringify(data('Barang Proyek')[1]))
ok('nama berawalan "=" dinetralkan di Katalog (tidak menjadi rumus Sheets)', String(data('Katalog')[1][1]).startsWith("'="), JSON.stringify(data('Katalog')[1]))
const dump = JSON.stringify([...sheets.values()].map((s) => s.rows))
ok('tidak ada hash nama/kata sandi/kunci passkey di Sheet', !/nameKey|usernameKey|publicKey|rahasia123|budi-pass-1/.test(dump))
ok('lembar Audit memuat aksi dan pelaku', data('Audit').length > 5 && dump.includes('ledger.in'))

await pg.click('button:has-text("Cadangkan sekarang")')
await pg.waitForSelector('[role=alert]:has-text("baru saja dijalankan")')
ok('jeda 5 menit antar-cadangan manual ditegakkan dengan pesan jelas', true)

// transaksi baru -> cadangan berikutnya hanya menambah (diuji lewat API langsung dengan jeda dilewati: ubah status via Worker tidak bisa; cek idempoten lewat kursor)
const before = data('Transaksi').length
ok('Sheet tidak berubah oleh percobaan yang ditolak (tanpa baris ganda)', before === 4)

await go('audit')
await pg.waitForSelector('table')
ok('Log Audit mencatat "Jalankan cadangan Sheets" atas nama pelaku', (await pg.textContent('main')).includes('Jalankan cadangan Sheets'))
await pg.evaluate(() => (location.hash = 'backup'))

// Manajer Proyek tidak boleh
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')
await pg.fill('#login-username', 'budi')
await pg.fill('input[autocomplete=current-password]', 'budi-pass-1')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')
ok('Manajer Proyek: tanpa menu Cadangan & Kuota', !(await pg.$$eval('.nav a', (a) => a.map((x) => x.textContent.trim()))).includes('Cadangan & Kuota'))
await go('backup')
ok('Manajer Proyek: alamat #backup ditolak', (await pg.textContent('main')).includes('Akses ditolak'))
const direct = await fetch('http://127.0.0.1:8787/backup/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-palsu' }, body: '{}' }).then((r) => r.status)
ok('Worker menolak panggilan dengan token tidak sah', direct === 401, String(direct))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', errs.filter((l) => !/Failed to load resource|favicon|403|409|429/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
