// Uji CSP: menyajikan build aplikasi dengan header PERSIS seperti firebase.json (hanya connect-src dilonggarkan untuk
// emulator dan Worker lokal), lalu menjelajahi semua halaman dan fitur berat (rincian, ekspor Excel/PDF, impor, biometrik
// tidak dipakai) sambil mengumpulkan pelanggaran Content-Security-Policy. Prasyarat: emulator Auth+Firestore, Worker dev
// di :8787, build emulator di /tmp/e2e-dist, akun Developer (Reza4Official_ / rahasia123).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const DIST = '/tmp/e2e-dist'
const PORT = 4173
const cfg = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).hosting
const LOCAL = 'http://127.0.0.1:8787 http://127.0.0.1:9099 http://127.0.0.1:8080 http://localhost:8787'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' }

const matches = (src, path) => (src.endsWith('/**') ? path.startsWith(src.slice(0, -2)) : src === path)
function headersFor(path) {
  const h = {}
  for (const rule of cfg.headers) {
    if (!matches(rule.source, path)) continue
    for (const { key, value } of rule.headers) h[key] = key === 'Content-Security-Policy' ? value.replace("connect-src 'self'", `connect-src 'self' ${LOCAL}`) : value
  }
  return h
}
createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = normalize(join(DIST, path))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    path = '/index.html'
    file = join(DIST, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', ...headersFor(path === '/index.html' ? '/' : path) })
  res.end(readFileSync(file))
}).listen(PORT, '127.0.0.1')

// ---------- data uji lewat API ----------
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })
const { idToken } = await r.json()
const call = async (path, body) => (await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const wita = new Date(Date.now() + 8 * 3_600_000)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1)).toISOString().slice(0, 7)}-01`
const day = (back) => new Date(Date.now() + 8 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10)
const co = await call('/companies/create', { name: 'PT. Uji CSP', type: 'induk' })
const pr = await call('/projects/create', { companyId: co.id, name: 'Proyek CSP' })
const cat = await call('/catalog/create', { name: 'Semen CSP', unit: 'Sak', minStock: 20 })
await call('/items/add', { projectId: pr.id, catalogId: cat.id, openingQty: 100, openingDate: OPEN })
await call('/ledger/add', { projectId: pr.id, itemId: cat.id, type: 'keluar', qty: 30, date: day(3), requestId: `csp-${Date.now()}-a` })
await call('/ledger/add', { projectId: pr.id, itemId: cat.id, type: 'masuk', qty: 10, date: day(2), requestId: `csp-${Date.now()}-b` })

// ---------- penjelajahan ----------
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => {
  window.__csp = []
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'} @ ${e.sourceFile || location.hash}:${e.lineNumber}`))
})
const pg = await ctx.newPage()
const errs = []
pg.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && errs.push(m.text().slice(0, 240)))
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w1'},remove:function(){}}" }),
)
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(500)
}

await pg.goto(`http://127.0.0.1:${PORT}/`)
await pg.waitForSelector('#login-username')
const hdr = await (await fetch(`http://127.0.0.1:${PORT}/`)).headers
ok('header produksi terpasang (CSP, HSTS, nosniff, frame DENY)', !!hdr.get('content-security-policy') && !!hdr.get('strict-transport-security') && hdr.get('x-content-type-options') === 'nosniff' && hdr.get('x-frame-options') === 'DENY')
await pg.click('button:has-text("Lupa password")')
await pg.waitForSelector('[data-ts="1"]')
await pg.keyboard.press('Escape')
await pg.fill('#login-username', 'Reza4Official_')
await pg.fill('input[autocomplete=current-password]', 'rahasia123')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')
ok('login lolos di bawah CSP (Turnstile, Firebase Auth, Worker)', true)

for (const r of ['dashboard', 'inventory', 'io', 'catalog', 'projects', 'users', 'roles', 'resets', 'employees', 'audit', 'profil']) {
  await go(r)
  await pg.waitForTimeout(400)
}
await go('dashboard')
await pg.click('button.linkbtn:text-is("Semen CSP")')
await pg.waitForSelector('svg[aria-label*="Sisa stok"]')
ok('rincian dashboard (grafik SVG, gaya CSSOM) tampil', true)
await pg.keyboard.press('Escape')
await go(`projects/${pr.id}`)
await pg.waitForSelector('text=Semen CSP')
await go('io')
await pg.waitForSelector('#io-kind')
const [d1] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("Excel (.xlsx)")')])
ok('ekspor Excel (ExcelJS lazy) tidak diblokir CSP', d1.suggestedFilename().endsWith('.xlsx'))
const [d2] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("PDF")')])
ok('ekspor PDF (jsPDF lazy, logo data URL) tidak diblokir CSP', d2.suggestedFilename().endsWith('.pdf'))
const [d3] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("Unduh template Excel")')])
await d3.saveAs('/tmp/e2e-run/csp-template.xlsx')
await pg.setInputFiles('#io-file', '/tmp/e2e-run/csp-template.xlsx')
await pg.waitForTimeout(800)
await go('profil')
await pg.waitForSelector('#pf-name')
await go('employees')
await pg.waitForSelector('table')

// Uji-diri: pelanggaran sengaja (skrip inline) HARUS tertangkap, agar hasil "bersih" berarti sesuatu.
await pg.evaluate(() => {
  window.__csp = []
  const sc = document.createElement('script')
  sc.textContent = 'window.__x = 1'
  document.head.append(sc)
})
await pg.waitForTimeout(200)
ok('uji-diri: skrip inline sengaja diblokir dan terdeteksi', (await pg.evaluate(() => window.__csp)).some((v) => v.startsWith('script-src')) && (await pg.evaluate(() => window.__x)) === undefined)
await pg.evaluate(() => (window.__csp = []))
errs.length = 0
const viol = await pg.evaluate(() => window.__csp)
ok('tidak ada pelanggaran securitypolicyviolation', viol.length === 0, viol.join(' | '))
ok('tidak ada galat CSP di konsol', errs.length === 0, errs.join(' | '))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
await b.close()
process.exit(results.some((x) => x[0] === 'GAGAL') ? 1 : 0)
