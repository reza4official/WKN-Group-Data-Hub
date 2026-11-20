// Membuat gambar Manual Book dari aplikasi SUNGGUHAN (emulator) beserta penanda bernomor.
// Spesifikasi penanda ada di docs/manual/shots.json (legenda di buku dibuat dari berkas yang sama).
// Prasyarat sama dengan guide.mjs. Hasil: docs/manual/img/*.png dan docs/manual/contoh/*.xlsx.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const REPO = process.env.REPO_DIR ?? new URL('..', import.meta.url).pathname
const IMG = `${REPO}docs/manual/img`
const EX = `${REPO}docs/manual/contoh`
const TMP = process.env.TMP_DIR ?? '/tmp/manual-tmp'
mkdirSync(IMG, { recursive: true })
mkdirSync(EX, { recursive: true })
mkdirSync(TMP, { recursive: true })
const SPEC = JSON.parse(readFileSync(`${REPO}docs/manual/shots.json`, 'utf8'))
const ExcelJS = createRequire(`${REPO}app/package.json`)('exceljs')
const BASE = 'http://127.0.0.1:4173/'
const API = 'http://127.0.0.1:8787'
const problems = []
const done = []

// ---------- data contoh ----------
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const idToken = (await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })).json()).idToken
const call = async (path, body) => (await fetch(API + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const wita = new Date(Date.now() + 8 * 3_600_000)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1)).toISOString().slice(0, 7)}-01`
const day = (back) => new Date(Date.now() + 8 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10)

const holding = await call('/companies/create', { name: 'PT. Wiratama Karya Nugraha', type: 'induk' })
const anak = await call('/companies/create', { name: 'PT. Nugraha Konstruksi', type: 'anak', parentId: holding.id })
const pr = await call('/projects/create', { companyId: holding.id, name: 'Perumahan Griya Asri', location: 'Maros', startDate: OPEN })
const pr2 = await call('/projects/create', { companyId: anak.id ?? holding.id, name: 'Gedung Serbaguna', location: 'Makassar', startDate: OPEN })
const cat = {}
for (const [name, unit, min, kat] of [['Semen Portland 50 kg', 'Sak', 50, 'Bahan Bangunan'], ['Pasir Beton', 'm3', 15, 'Agregat'], ['Besi Beton 10 mm', 'Batang', 40, 'Besi'], ['Keramik 40x40', 'Dus', 20, 'Finishing'], ['Batu Split 2/3', 'm3', 10, 'Agregat'], ['Triplek 12 mm', 'Lembar', 15, 'Kayu']]) {
  cat[name] = (await call('/catalog/create', { name, unit, minStock: min, category: kat })).id
}
const inProject = ['Semen Portland 50 kg', 'Pasir Beton', 'Besi Beton 10 mm', 'Keramik 40x40']
const openQty = { 'Semen Portland 50 kg': 400, 'Pasir Beton': 60, 'Besi Beton 10 mm': 300, 'Keramik 40x40': 120 }
for (const n of inProject) await call('/items/add', { projectId: pr.id, catalogId: cat[n], openingQty: openQty[n], openingDate: OPEN })
await call('/items/add', { projectId: pr2.id, catalogId: cat['Semen Portland 50 kg'], openingQty: 80, openingDate: OPEN })
let nreq = 0
const trx = [['Semen Portland 50 kg', 'keluar', 120, 9, 'Pengecoran pondasi blok A'], ['Semen Portland 50 kg', 'masuk', 80, 8, 'Kiriman supplier PT. Tonasa'], ['Pasir Beton', 'keluar', 48, 6, 'Pengecoran pondasi blok A'], ['Besi Beton 10 mm', 'keluar', 210, 5, 'Pembesian kolom blok B'], ['Keramik 40x40', 'keluar', 30, 3, 'Lantai tipe 36'], ['Semen Portland 50 kg', 'keluar', 45, 2, 'Plesteran dinding'], ['Pasir Beton', 'keluar', 6, 1, 'Plesteran dinding']]
for (const [n, type, q, d, note] of trx) await call('/ledger/add', { projectId: pr.id, itemId: cat[n], type, qty: q, date: day(d), requestId: `man-${Date.now()}-${++nreq}`, note })
const roleList = (await (await fetch('http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents/roles', { headers: { Authorization: 'Bearer owner' } })).json()).documents ?? []
const roleId = (nm) => roleList.find((x) => x.fields.name.stringValue.startsWith(nm))?.name.split('/').pop()
await call('/users/create', { username: 'budi', name: 'Budi Santoso', password: 'budi-pass-1', roleId: roleId('Manajer'), projectIds: [pr.id], phone: '081234567890', emailContact: 'budi@contoh.co.id' })
await call('/users/create', { username: 'siti', name: 'Siti Rahmawati', password: 'siti-pass-1', roleId: roleId('Admin Logistik'), projectIds: [pr.id], phone: '085299887766', emailContact: 'siti@contoh.co.id' })
await fetch(`${API}/auth/reset-request`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' }, body: JSON.stringify({ username: 'siti', turnstileToken: 'XXXX.DUMMY.TOKEN' }) }).catch(() => {})

// ---------- browser ----------
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5, acceptDownloads: true, locale: 'id-ID', timezoneId: 'Asia/Makassar' })
const pg = await ctx.newPage()
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w1'},remove:function(){}}" }),
)
// Autentikator virtual agar tombol biometrik tampil di Chromium tanpa perangkat keras.
{
  const cdp = await ctx.newCDPSession(pg)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
}
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(900)
}
const login = async (u, p) => {
  await pg.goto(BASE)
  await pg.waitForSelector('#login-username')
  await pg.fill('#login-username', u)
  await pg.fill('input[autocomplete=current-password]', p)
  await pg.click('button[type=submit]')
  await pg.waitForSelector('.me', { timeout: 10000 })
  await pg.waitForTimeout(900)
  if (await pg.locator('.modal button:has-text("Lewati")').count()) await pg.click('.modal button:has-text("Lewati")')
  await pg.waitForTimeout(300)
  await pg.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important } .toast{display:none!important}' })
}

/** Pasang penanda bernomor pada elemen (koordinat dihitung Playwright), lalu ambil gambar. */
async function shoot(page, key, { clip, pad = 24, full = false, until } = {}) {
  const spec = SPEC[key]
  await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollLeft) e.scrollLeft = 0 }))
  const boxes = []
  for (const m of spec.marks) {
    const loc = page.locator(m.selector).first()
    let bb = null
    try { bb = (await loc.count()) ? await loc.boundingBox() : null } catch { /* */ }
    if (!bb) { problems.push(`${key}: penanda ${m.n} tidak ditemukan (${m.selector})`); continue }
    boxes.push({ n: m.n, ...bb })
  }
  await page.evaluate((bx) => {
    document.querySelectorAll('.mk-box').forEach((x) => x.remove())
    for (const r of bx) {
      const d = document.createElement('div')
      d.className = 'mk-box'
      d.style.cssText = `position:fixed;z-index:2147483000;left:${r.x - 3}px;top:${r.y - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:3px solid #c2410c;border-radius:8px;pointer-events:none;box-sizing:border-box`
      const n = document.createElement('div')
      n.textContent = String(r.n)
      n.style.cssText = 'position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:#c2410c;color:#fff;font:700 15px sans-serif;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.4)'
      d.append(n)
      document.body.append(d)
    }
  }, boxes)
  let opts = { path: `${IMG}/${key}.png` }
  // Halaman biasa dipotong tanpa menu samping agar tulisan lebih besar di buku (menu samping diperlihatkan di 'mulai').
  const KEEP_SIDE = ['login', 'mulai', 'mobile', 'panduan']
  let x0 = 0
  if (!clip && !KEEP_SIDE.includes(key)) {
    const sb = await page.locator('.side').first().boundingBox().catch(() => null)
    if (sb) x0 = Math.ceil(sb.x + sb.width + 6)
  }
  if (clip) {
    const r = await page.locator(clip).first().boundingBox()
    if (r) {
      const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad)
      opts = { ...opts, clip: { x, y, width: Math.min(page.viewportSize().width - x, r.width + pad * 2), height: Math.min(page.viewportSize().height - y, r.height + pad * 2) } }
    }
  } else if (until) {
    const r = await page.locator(until).first().boundingBox()
    opts = { ...opts, clip: { x: x0, y: 0, width: page.viewportSize().width - x0, height: Math.min(page.viewportSize().height, Math.ceil(r.y + r.height + 30)) } }
  } else if (x0) {
    const mb = await page.locator('main').first().boundingBox().catch(() => null)
    const h = mb ? Math.min(page.viewportSize().height, Math.ceil(mb.y + mb.height + 24)) : page.viewportSize().height
    opts = { ...opts, clip: { x: x0, y: 0, width: page.viewportSize().width - x0, height: h } }
  }
  else if (full) opts.fullPage = true
  await page.screenshot(opts)
  await page.evaluate(() => document.querySelectorAll('.mk-box').forEach((x) => x.remove()))
  done.push(key)
}
const modal = (key, pad) => shoot(pg, key, { clip: '.modal', pad })
const pickProject = async (sel) => { await pg.waitForSelector(sel); await pg.selectOption(sel, { label: 'Perumahan Griya Asri' }).catch(() => {}); await pg.waitForTimeout(700) }
const closeModal = async () => { await pg.keyboard.press('Escape'); await pg.waitForTimeout(250) }

// ---------- lembar Excel -> HTML -> gambar ----------
const pg2 = await ctx.newPage()
await pg2.setViewportSize({ width: 2400, height: 800 })
const colL = (i) => String.fromCharCode(64 + i)
async function sheetImage(key, file, sheetName, { maxRows = 14 } = {}) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.getWorksheet(sheetName)
  if (!ws) { problems.push(`${key}: lembar ${sheetName} tidak ada`); return }
  const ncol = Math.min(ws.columnCount, 11)
  const widths = Array.from({ length: ncol }, (_, i) => Math.max(60, Math.min(330, Math.round((ws.getColumn(i + 1).width || 12) * 7.2))))
  let html = '<table><tr><th class="rn"></th>' + widths.map((w, i) => `<th style="width:${w}px">${colL(i + 1)}</th>`).join('') + '</tr>'
  let shown = 0
  const lastRn = ws.actualRowCount ? [...Array(ws.rowCount + 1).keys()].reverse().find((n) => n > 0 && ws.getRow(n).hasValues) : 0
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (shown >= maxRows - 1 && rn !== lastRn) return
    shown++
    const first = row.getCell(1)
    const white = row.getCell(1).font?.color?.argb === 'FFFFFFFF'
    const last = String(row.getCell(ncol).text || '')
    const kind = white ? 'header' : /^BENAR|^DILEWATI/.test(last) ? 'benar' : /^SALAH|^DITOLAK/.test(last) ? 'salah' : String(first.text).startsWith('Total') ? 'total' : 'plain'
    html += `<tr data-row="${kind}"><th class="rn">${rn}</th>`
    for (let c = 1; c <= ncol; c++) {
      const cell = row.getCell(c)
      const fill = cell.fill?.fgColor?.argb
      const bg = fill ? `#${fill.slice(2)}` : kind === 'benar' ? '#ecf8ef' : kind === 'salah' ? '#fdeeee' : '#fff'
      const col = white && fill ? '#fff' : cell.font?.color?.argb && c === ncol && /^F[0-9A-F]{7}$/.test(cell.font.color.argb) ? `#${cell.font.color.argb.slice(2)}` : '#111'
      const txt = String(cell.text ?? '').replace(/</g, '&lt;')
      html += `<td data-ref="${colL(c)}${rn}" style="background:${bg};color:${col};font-weight:${cell.font?.bold ? 700 : 400};font-style:${cell.font?.italic ? 'italic' : 'normal'}">${txt}</td>`
    }
    html += '</tr>'
  })
  html += '</table>'
  await pg2.setContent(`<html><body style="margin:0;padding:28px;background:#fff;font:14px Calibri,Carlito,Arial,sans-serif"><style>table{border-collapse:collapse}td,th{border:1px solid #c8ccd2;padding:5px 8px;white-space:nowrap;text-align:left}th{background:#eef0f3;color:#555;font-weight:600;text-align:center}.rn{width:34px}</style><div style="font:600 13px sans-serif;color:#555;margin-bottom:8px">${sheetName} — ${file.split('/').pop()}</div>${html}</body></html>`)
  const spec = SPEC[key]
  if (spec) {
    const bx = []
    for (const m of spec.marks) {
      const bb = await pg2.locator(m.selector).first().boundingBox().catch(() => null)
      if (!bb) { problems.push(`${key}: penanda ${m.n} tidak ditemukan (${m.selector})`); continue }
      bx.push({ n: m.n, ...bb })
    }
    await pg2.evaluate((bxs) => {
      for (const r of bxs) {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;left:${r.x - 2}px;top:${r.y - 2}px;width:${r.width + 4}px;height:${r.height + 4}px;border:3px solid #c2410c;border-radius:6px;pointer-events:none;box-sizing:border-box`
        const n = document.createElement('div')
        n.textContent = String(r.n)
        n.style.cssText = 'position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:#c2410c;color:#fff;font:700 15px sans-serif;display:grid;place-items:center'
        d.append(n)
        document.body.append(d)
      }
    }, bx)
  }
  const tb = await pg2.locator('table').boundingBox()
  const ph = Math.ceil(tb.y + tb.height + 28)
  await pg2.setViewportSize({ width: 2400, height: Math.max(200, ph) })
  await pg2.screenshot({ path: `${IMG}/${key}.png`, clip: { x: 0, y: 0, width: Math.min(2400, Math.ceil(tb.x + tb.width + 36)), height: Math.max(200, ph) } })
  done.push(key)
}

// ================= sebelum masuk =================
await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await pg.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important }' })
await shoot(pg, 'login')
await pg.click('button:has-text("Lupa password")')
await pg.waitForSelector('.modal')
await pg.waitForTimeout(500)
await modal('login-lupa')
await closeModal()

// ================= Developer =================
await login('Reza4Official_', 'rahasia123')
await go('dashboard')
await shoot(pg, 'mulai')
await pg.setViewportSize({ width: 390, height: 844 })
await go('dashboard')
await shoot(pg, 'mobile')
await pg.setViewportSize({ width: 1600, height: 900 })

await go('profil')
await shoot(pg, 'profil')
if (await pg.locator('[data-guide=pf-bio]').count()) {
  await pg.click('[data-guide=pf-bio]')
  await pg.waitForSelector('.modal', { timeout: 5000 }).catch(() => {})
  await pg.waitForTimeout(500)
  if (await pg.locator('.modal').count()) await modal('profil-bio')
  await closeModal()
} else problems.push('profil-bio: tombol biometrik tidak tampil di peramban ini')

// stok
await go('inventory')
await pickProject('#inv-project')
await shoot(pg, 'inventory')
await pg.click('[data-guide=inv-catat]')
await pg.waitForSelector('.modal')
await pg.waitForTimeout(800)
const optInfo = await pg.evaluate(() => [...document.querySelectorAll('#tx-item option')].map((o) => `${o.value}|${o.textContent}`))
await pg.selectOption('#tx-item', { index: Math.min(1, optInfo.length - 1) })
await pg.locator('.modal input[type=radio]').nth(1).check({ force: true })
await pg.fill('#tx-qty', '25')
await pg.fill('#tx-note', 'Pemasangan dinding blok C')
await pg.waitForTimeout(300)
await modal('inventory-catat')
await closeModal()
await pg.locator('[data-guide=inv-koreksi]').first().click()
await pg.waitForSelector('.modal')
await pg.locator('.modal textarea, .modal input[type=text]').first().fill('Salah input jumlah, seharusnya sudah termasuk kiriman kemarin')
await pg.waitForTimeout(300)
await modal('inventory-koreksi')
await pg.click('.modal button:has-text("Buat koreksi")')
await pg.waitForTimeout(1500)
await shoot(pg, 'inventory-koreksi-hasil')

await go('dashboard')
await pickProject('#dash-scope')
await pg.waitForSelector('[aria-label="Ringkasan per barang"]')
await shoot(pg, 'dashboard')
await pg.locator('button.linkbtn').first().click()
await pg.waitForSelector('svg[aria-label*="Sisa stok"]', { timeout: 8000 }).catch(() => {})
await pg.waitForTimeout(500)
await shoot(pg, 'dashboard-rincian')

// ekspor
await go('io')
await pickProject('#io-project')
await shoot(pg, 'io')
await pg.selectOption('#io-month', { index: 0 }).catch(() => {})
{
  const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-guide=io-xlsx]')])
  await d.saveAs(`${EX}/contoh-ekspor-transaksi.xlsx`)
  await sheetImage('ekspor-transaksi', `${EX}/contoh-ekspor-transaksi.xlsx`, 'Transaksi', { maxRows: 12 })
  await sheetImage('ekspor-ringkasan', `${EX}/contoh-ekspor-transaksi.xlsx`, 'Ringkasan', { maxRows: 12 })
  const [d2] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-guide=io-pdf]')])
  await d2.saveAs(`${TMP}/ekspor.pdf`)
  execFileSync('pdftoppm', ['-png', '-r', '130', '-f', '1', '-l', '1', '-singlefile', `${TMP}/ekspor.pdf`, `${IMG}/ekspor-pdf`])
  done.push('ekspor-pdf')
}

// impor: urutan katalog -> saldo awal -> transaksi
const kindOpt = async (txt) => {
  const v = await pg.evaluate((t) => [...document.querySelectorAll('#io-kind option')].find((o) => o.textContent.includes(t))?.value, txt)
  await pg.selectOption('#io-kind', v)
  await pg.waitForTimeout(400)
}
const tpl = async (name) => {
  const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-guide=io-template]')])
  await d.saveAs(name)
}
const fillSheet = async (src, dst, sheet, startRow, rows) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(src)
  const ws = wb.getWorksheet(sheet)
  rows.forEach((r, i) => r.forEach((v, c) => { if (v !== '' && v != null) ws.getCell(startRow + i, c + 1).value = v }))
  await wb.xlsx.writeFile(dst)
}
const upload = async (file) => {
  await pg.setInputFiles('#io-file', file)
  await pg.waitForSelector('section.card:has-text("Pratinjau ·")', { timeout: 10000 })
  await pg.waitForTimeout(600)
}

// -- katalog
await go('io')
await pickProject('#io-project')
await kindOpt('Katalog')
await tpl(`${EX}/template-katalog.xlsx`)
await sheetImage('tpl-kat-contoh', `${EX}/template-katalog.xlsx`, 'Contoh Pengisian', { maxRows: 10 })
await fillSheet(`${EX}/template-katalog.xlsx`, `${EX}/contoh-katalog-terisi.xlsx`, 'Katalog', 2, [
  ['Seng Gelombang BJLS 0,30', 'Lembar', 'Atap', 25], ['Kawat Bendrat', 'Kg', 'Besi', 10], ['Paku 5 cm', 'Kg', 'Bahan Bangunan', 5], ['Cat Tembok Putih 25 kg', 'Pail', 'Finishing', ''],
  ['Pasir Beton', 'm3', 'Agregat', 20], ['Cat Genteng', '', 'Finishing', 3],
])
await sheetImage('tpl-kat-isi', `${EX}/contoh-katalog-terisi.xlsx`, 'Katalog', { maxRows: 8 })
await upload(`${EX}/contoh-katalog-terisi.xlsx`)
await pg.setViewportSize({ width: 1600, height: 1500 })
await pg.evaluate(() => window.scrollTo(0, 0))
await shoot(pg, 'preview-katalog', { until: 'section.card:has-text("Pratinjau ·")' })
await pg.setViewportSize({ width: 1600, height: 900 })
await pg.click('button:has-text("baris valid")')
await pg.waitForSelector('section.card:has-text("Hasil impor")', { timeout: 15000 })
await pg.waitForTimeout(500)
await shoot(pg, 'impor-selesai')

// -- saldo awal
await go('io')
await pickProject('#io-project')
await kindOpt('Saldo awal')
await tpl(`${EX}/template-saldo-awal.xlsx`)
await sheetImage('tpl-saldo-contoh', `${EX}/template-saldo-awal.xlsx`, 'Contoh Pengisian', { maxRows: 10 })
{
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(`${EX}/template-saldo-awal.xlsx`)
  const ws = wb.getWorksheet('Saldo Awal')
  const names = []
  ws.eachRow((r, n) => n > 1 && names.push([n, String(r.getCell(1).text)]))
  const want = { 'Batu Split 2/3': [35, OPEN, 8], 'Triplek 12 mm': [60, OPEN, ''], 'Seng Gelombang BJLS 0,30': [-5, OPEN, ''], 'Kawat Bendrat': [40, OPEN, ''] }
  for (const [n, nm] of names) if (want[nm]) { const [q, t, m] = want[nm]; ws.getCell(n, 2).value = q; ws.getCell(n, 3).value = t; if (m !== '') ws.getCell(n, 4).value = m }
  await wb.xlsx.writeFile(`${EX}/contoh-saldo-awal-terisi.xlsx`)
}
await sheetImage('tpl-saldo-isi', `${EX}/contoh-saldo-awal-terisi.xlsx`, 'Saldo Awal', { maxRows: 9 })
await upload(`${EX}/contoh-saldo-awal-terisi.xlsx`)
await pg.setViewportSize({ width: 1600, height: 1500 })
await pg.evaluate(() => window.scrollTo(0, 0))
await shoot(pg, 'preview-saldo', { until: 'section.card:has-text("Pratinjau ·")' })
await pg.setViewportSize({ width: 1600, height: 900 })
await pg.click('button:has-text("baris valid")')
await pg.waitForSelector('section.card:has-text("Hasil impor")', { timeout: 15000 })

// -- transaksi
await go('io')
await pickProject('#io-project')
await kindOpt('Transaksi')
await tpl(`${EX}/template-transaksi.xlsx`)
await sheetImage('tpl-trx-contoh', `${EX}/template-transaksi.xlsx`, 'Contoh Pengisian', { maxRows: 12 })
await sheetImage('tpl-trx-barang', `${EX}/template-transaksi.xlsx`, 'Barang', { maxRows: 8 })
await fillSheet(`${EX}/template-transaksi.xlsx`, `${EX}/contoh-transaksi-terisi.xlsx`, 'Transaksi', 2, [
  [day(4), 'Batu Split 2/3', 'Masuk', 12, 'Kiriman quarry Maros'], [day(3), 'Batu Split 2/3', 'Keluar', 4.5, 'Cor lantai kerja'], [day(2), 'Triplek 12 mm', 'Keluar', 20, 'Bekisting kolom'],
  [day(2), 'Semen Portland 50 kg', 'Masuk', 100, 'Pembelian lokal'], ['31-02-2026', 'Pasir Beton', 'Masuk', 5, ''], [day(1), 'Paku 5 cm', 'Keluar', 2, 'Belum ada di proyek'], [day(1), 'Pasir Beton', 'Pinjam', 3, ''],
])
await sheetImage('tpl-trx-isi', `${EX}/contoh-transaksi-terisi.xlsx`, 'Transaksi', { maxRows: 9 })
await upload(`${EX}/contoh-transaksi-terisi.xlsx`)
await pg.setViewportSize({ width: 1600, height: 1500 })
await pg.evaluate(() => window.scrollTo(0, 0))
await shoot(pg, 'preview-trx', { until: 'section.card:has-text("Pratinjau ·")' })
await pg.setViewportSize({ width: 1600, height: 900 })
await pg.click('button:has-text("baris valid")')
await pg.waitForSelector('section.card:has-text("Hasil impor")', { timeout: 15000 })

// katalog
await go('catalog')
await shoot(pg, 'catalog')
await pg.click('[data-guide=catalog-add]')
await pg.waitForSelector('.modal')
await pg.fill('#ci-name', 'Genteng Beton')
await pg.fill('#ci-unit', 'Buah')
await pg.fill('#ci-cat', 'Atap')
await pg.fill('#ci-min', '200')
await modal('catalog-add')
await closeModal()

// proyek
await go('projects')
await shoot(pg, 'projects')
await pg.click('[data-guide=projects-add-company]')
await pg.waitForSelector('.modal')
await pg.fill('#co-name', 'PT. Wiratama Prima Konstruksi')
await pg.selectOption('#co-type', { index: 1 })
await modal('projects-add-company')
await closeModal()
await pg.click('[data-guide=projects-add-project]')
await pg.waitForSelector('#pr-name')
await pg.fill('#pr-name', 'Ruko Panakkukang')
await pg.fill('#pr-loc', 'Makassar')
await pg.fill('#pr-sd', day(0))
await modal('projects-add-project')
await closeModal()
await go(`projects/${pr.id}`)
await shoot(pg, 'project-detail')
await pg.click('button:has-text("Tambah barang")')
await pg.waitForSelector('.modal')
await pg.waitForTimeout(600)
await modal('project-add-item')
await closeModal()
await call('/projects/create', { companyId: holding.id, name: 'Proyek Uji Coba', location: 'Uji' })
await go('projects')
await pg.locator('.li:has-text("Proyek Uji Coba") [data-guide=projects-delete]').first().click()
await pg.waitForSelector('.modal')
await pg.locator('.modal input').first().fill('Proyek Uji Coba')
await pg.waitForTimeout(500)
await modal('projects-hapus')
await closeModal()

// administrasi
await go('users')
await shoot(pg, 'users')
await pg.click('[data-guide=users-add]')
await pg.waitForSelector('.modal')
await pg.fill('#c-un', 'andi')
await pg.fill('#c-nm', 'Andi Saputra')
await pg.fill('.modal input[type=password]', 'andi-pass-1')
{
  const v = await pg.evaluate(() => [...document.querySelectorAll('#c-rl option')].find((o) => o.textContent.includes('Admin Logistik'))?.value)
  if (v) await pg.selectOption('#c-rl', v)
}
await pg.locator('.modal label:has-text("Perumahan Griya Asri") input').check({ force: true })
await modal('users-add')
await closeModal()
await pg.locator('button:has-text("Reset password")').first().click()
await pg.waitForSelector('.modal')
await pg.fill('.modal input[type=password]', 'sandi-baru-1')
await modal('users-reset')
await closeModal()
await go('resets')
await shoot(pg, 'resets')
if (await pg.locator('button:has-text("Eksekusi reset")').count()) {
  await pg.locator('button:has-text("Eksekusi reset")').first().click()
  await pg.waitForSelector('.modal')
  await pg.fill('.modal input[type=password]', 'sandi-baru-2')
  await modal('resets-eksekusi')
  await closeModal()
} else problems.push('resets-eksekusi: tidak ada permintaan reset menunggu')

await pg.setViewportSize({ width: 1600, height: 1250 })
await go('roles')
await pg.locator('.rolerow').nth(3).click()
await pg.waitForTimeout(500)
await shoot(pg, 'roles', { until: '.matrix' })
await pg.click('[data-guide=roles-new]')
await pg.waitForSelector('.modal')
await pg.fill('#nr-name', 'Pengawas Lapangan')
await pg.fill('#nr-level', '40')
await modal('roles-new')
await closeModal()
await pg.setViewportSize({ width: 1600, height: 900 })
for (const k of ['employees', 'audit', 'backup']) {
  await go(k)
  if (k === 'backup') await pg.waitForSelector('text=Cadangan ke Google Sheets').catch(() => {})
  await shoot(pg, k)
}
await go('panduan')
await pg.waitForSelector('#g-akses-tabel')
await shoot(pg, 'panduan')

console.log('GAMBAR', done.length, done.join(' '))
const missingImg = Object.keys(SPEC).filter((k) => !done.includes(k))
console.log('BELUM', missingImg.join(' ') || '-')
console.log('MASALAH', problems.length ? '\n  ' + problems.join('\n  ') : '-')
await b.close()
process.exit(problems.length || missingImg.length ? 1 : 0)
