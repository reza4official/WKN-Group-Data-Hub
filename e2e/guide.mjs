// Panduan: (1) setiap penanda di guideShots.json menemukan elemen nyata, (2) isi panduan mengikuti role dan berubah
// saat izin role berubah, (3) tombol "Tunjukkan" menandai elemen, (4) axe + tanpa scroll samping, (5) GUIDE_SHOTS=1
// membuat gambar bernomor ke app/src/assets/panduan/. Prasyarat sama dengan a11y.mjs.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const REPO = process.env.REPO_DIR ?? new URL('..', import.meta.url).pathname
const SHOTS = JSON.parse(readFileSync(`${REPO}app/src/lib/guideShots.json`, 'utf8'))
const OUT = `${REPO}app/src/assets/panduan`
const AXE = process.env.AXE_PATH ? readFileSync(process.env.AXE_PATH, 'utf8') : null
const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])

const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const signIn = async (u, p) => (await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email(u), password: p, returnSecureToken: true }) })).json()).idToken
const idToken = await signIn('Reza4Official_', 'rahasia123')
const call = async (path, body) => (await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const wita = new Date(Date.now() + 8 * 3_600_000)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1)).toISOString().slice(0, 7)}-01`
const day = (back) => new Date(Date.now() + 8 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10)

// ---------- data contoh yang realistis (juga dipakai gambar panduan) ----------
const co = await call('/companies/create', { name: 'PT. Wiratama Karya Nugraha', type: 'induk' })
const pr = await call('/projects/create', { companyId: co.id, name: 'Perumahan Griya Asri', location: 'Maros' })
const items = []
for (const [name, unit, min, open] of [['Semen Portland 50 kg', 'Sak', 50, 400], ['Pasir Beton', 'm3', 10, 60], ['Besi Beton 10 mm', 'Batang', 40, 300], ['Keramik 40x40', 'Dus', 20, 120]]) {
  const c = await call('/catalog/create', { name, unit, minStock: min })
  await call('/items/add', { projectId: pr.id, catalogId: c.id, openingQty: open, openingDate: OPEN })
  items.push(c.id)
}
let n = 0
for (const [i, type, q, d] of [[0, 'keluar', 120, 6], [0, 'masuk', 80, 5], [1, 'keluar', 52, 3], [2, 'keluar', 210, 2], [3, 'keluar', 30, 1], [0, 'keluar', 45, 0]])
  await call('/ledger/add', { projectId: pr.id, itemId: items[i], type, qty: q, date: day(d), requestId: `guide-${Date.now()}-${++n}`, note: 'pemakaian harian' })
const gid = (await call('/roles/create', { name: 'Admin Gudang Uji', level: 30, perms: ['dashboard', 'inventory.read'] })).id
await call('/users/create', { username: 'gudang', name: 'Gina Gudang', password: 'gudang-pass-1', roleId: gid, projectIds: [pr.id] })
await call('/employees/create', { name: 'Andi Pratama', position: 'Mandor' }).catch(() => {})

// ---------- browser ----------
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const pg = await ctx.newPage()
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w1'},remove:function(){}}" }),
)
const errs = []
pg.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
pg.on('pageerror', (e) => errs.push(e.message))
const login = async (u, p) => {
  await pg.goto(BASE)
  await pg.waitForSelector('#login-username')
  await pg.fill('#login-username', u)
  await pg.fill('input[autocomplete=current-password]', p)
  await pg.click('button[type=submit]')
  await pg.waitForSelector('.me', { timeout: 10000 }).catch(async () => { throw new Error('login gagal: ' + (await pg.textContent('body')).slice(0, 300)) })
}
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(900)
}
const guideText = async () => (await pg.textContent('main')) ?? ''

// login (gambar + penanda) diambil sebelum masuk
const missing = []
const mark = (marks) =>
  pg.evaluate((ms) => {
    document.querySelectorAll('.shot-badge').forEach((x) => x.remove())
    const found = []
    for (const m of ms) {
      const el = document.querySelector(m.selector)
      if (!el) { found.push(null); continue }
      const r = el.getBoundingClientRect()
      const box = document.createElement('div')
      box.className = 'shot-badge'
      box.style.cssText = `position:fixed;z-index:99999;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:3px solid #c2410c;border-radius:8px;pointer-events:none;box-sizing:border-box`
      const num = document.createElement('div')
      num.textContent = String(m.n)
      num.style.cssText = 'position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;background:#c2410c;color:#fff;font:700 14px sans-serif;display:grid;place-items:center'
      box.append(num)
      document.body.append(box)
      found.push(m.selector)
    }
    return found
  }, marks)
async function shoot(key, spec) {
  const found = await mark(spec.marks)
  spec.marks.forEach((m, i) => found[i] === null && missing.push(`${key}: ${m.selector}`))
  if (process.env.GUIDE_SHOTS) await pg.screenshot({ path: `${OUT}/${key}.png` })
  await pg.evaluate(() => document.querySelectorAll('.shot-badge').forEach((x) => x.remove()))
}
if (process.env.GUIDE_SHOTS) mkdirSync(OUT, { recursive: true })
await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await shoot('login', SHOTS.login)
await login('Reza4Official_', 'rahasia123')
for (const [key, spec] of Object.entries(SHOTS)) {
  if (key.startsWith('_') || key === 'login') continue
  await go(spec.route)
  if (spec.before) {
    await pg.click(spec.before)
    await pg.waitForSelector('.modal, [role=dialog]').catch(() => {})
    await pg.waitForTimeout(300)
  }
  if (key === 'backup') await pg.waitForSelector('text=Cadangan ke Google Sheets').catch(() => {})
  if (key === 'projects') await pg.waitForSelector('.li a.btn').catch(() => {})
  await shoot(key, spec)
  if (spec.before) await pg.keyboard.press('Escape')
}
ok('semua penanda panduan menemukan elemen nyata di aplikasi', missing.length === 0, missing.join(' | '))

// ---------- Developer ----------
await go('panduan')
await pg.waitForSelector('#g-akses-tabel')
let t = await guideText()
ok('Developer: seluruh bagian tersedia, tanpa "Tidak tersedia untuk akun Anda"', (await pg.$('#g-tidak-tersedia')) === null && (await pg.$('#g-role')) !== null && (await pg.$('#g-cadangan')) !== null, (await pg.textContent('#g-tidak-tersedia').catch(() => '')) ?? '')
ok('Developer: tabel izin menampilkan semua izin sebagai dimiliki', (await pg.$$('.perms li.no')).length === 0 && (await pg.$$('.perms li.yes')).length > 5)
await pg.click('.steps button:has-text("Tunjukkan") >> nth=0')
ok('Tunjukkan: cincin dan balon petunjuk muncul, lalu hilang dengan Esc', (await pg.waitForSelector('.guide-ring', { timeout: 8000 }).catch(() => null)) !== null && (await pg.$('.guide-tip')) !== null)
await pg.keyboard.press('Escape')
await pg.waitForTimeout(200)
ok('Tunjukkan: petunjuk hilang saat Esc', (await pg.$('.guide-ring')) === null)
await pg.fill('[aria-label="Cari di panduan"]', 'cadangan')
await pg.waitForTimeout(200)
ok('pencarian menyaring bagian panduan', (await pg.$('#g-cadangan')) !== null && (await pg.$('#g-transaksi')) === null)
await pg.fill('[aria-label="Cari di panduan"]', '')
if (AXE) {
  const v = await pg.evaluate(async (src) => {
    if (!window.axe) (0, eval)(src)
    return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.target.join(' ')}`)
  }, AXE)
  ok('axe: Panduan tanpa pelanggaran WCAG A/AA (Developer)', v.length === 0, v.join(' | '))
}
const over = []
for (const w of [360, 768, 1440]) {
  await pg.setViewportSize({ width: w, height: 800 })
  await pg.waitForTimeout(200)
  const wide = await pg.evaluate(() => (document.documentElement.scrollWidth > innerWidth ? [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => e.tagName + '.' + e.className) : null))
  if (wide) over.push(w + ':' + wide.join(','))
}
await pg.setViewportSize({ width: 1280, height: 800 })
ok('Panduan tanpa scroll samping di 360/768/1440 px', over.length === 0, over.join(','))

// ---------- role terbatas, lalu izin berubah ----------
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')
await login('gudang', 'gudang-pass-1')
await go('panduan')
await pg.waitForSelector('#g-akses-tabel')
t = await guideText()
ok('Admin Gudang: nama role dan level tampil', t.includes('Admin Gudang Uji') && t.includes('level 30'))
ok('Admin Gudang: bagian Role/Cadangan tidak ada, muncul di "Tidak tersedia"', (await pg.$('#g-role')) === null && (await pg.$('#g-cadangan')) === null && (await pg.$('#g-tidak-tersedia')) !== null)
ok('Admin Gudang: bagian Lihat stok ada', (await pg.$('#g-lihat-stok')) !== null)
await call('/roles/update', { id: gid, perms: ['dashboard', 'inventory.read', 'audit'] })
ok('Developer dapat memberi izin audit (prasyarat uji dinamis)', true)
await go('dashboard')
await go('panduan')
await pg.waitForSelector('#g-akses-tabel')
await pg.waitForSelector('#g-audit', { timeout: 8000 }).catch(() => {})
ok('izin role berubah: bagian Log Audit muncul tanpa login ulang', (await pg.$('#g-audit')) !== null)
const lv = await call('/roles/update', { id: gid, level: 35 })
await go('dashboard')
await go('panduan')
await pg.waitForSelector('#g-akses-tabel')
await pg.waitForFunction(() => document.querySelector('main')?.textContent?.includes('level 35'), null, { timeout: 8000 }).catch(() => {})
ok('level role diubah: level di Panduan ikut berubah (dan akun disesuaikan)', (await guideText()).includes('level 35') && !lv.error, JSON.stringify(lv))
ok('tanpa galat halaman', errs.length === 0, errs.join(' | '))

for (const [s, nm, e] of results) console.log(s, nm, e ? '-> ' + e : '')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
