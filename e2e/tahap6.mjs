// Uji end-to-end Tahap 6 (Dashboard) terhadap emulator dengan Firestore Rules aktif.
// Tanggal dihitung relatif terhadap hari ini (WITA) agar uji tidak kedaluwarsa. Prasyarat sama seperti tahap5.mjs.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

const wita = new Date(Date.now() + 8 * 3_600_000)
const ymOf = (d) => d.toISOString().slice(0, 7)
const today = wita.toISOString().slice(0, 10)
const curYm = ymOf(wita)
const prev = new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 1, 1))
const prev2 = new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1))
const prevYm = ymOf(prev)
const OPEN = `${ymOf(prev2)}-01`
const D_PREV = `${prevYm}-15`
const D_CUR = `${curYm}-01`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const pg = await ctx.newPage()
const logs = []
pg.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
pg.on('pageerror', (e) => logs.push('PAGEERR ' + e.message))

const PW = 'input[autocomplete=current-password]'
const login = async (u, p) => {
  await pg.fill('#login-username', u)
  await pg.fill(PW, p)
  await pg.click('button[type=submit]')
  await pg.waitForSelector('.me, [role=alert]')
}
const logout = async () => {
  await pg.click('button[aria-label=Keluar]')
  await pg.waitForSelector('#login-username')
}
const go = async (r) => {
  await pg.evaluate((x) => (location.hash = x), r)
  await pg.waitForTimeout(500)
}
async function createUser(username, name, pass, roleLabel, projectNames) {
  await go('users')
  await pg.click('button:has-text("Tambah akun")')
  await pg.fill('#c-un', username)
  await pg.fill('#c-nm', name)
  await pg.fill('input[autocomplete=new-password]', pass)
  await pg.selectOption('#c-rl', { label: roleLabel })
  for (const p of projectNames) await pg.check(`.modal label:has-text("${p}") input`)
  await pg.click('.modal button:has-text("Buat akun")')
  await pg.waitForSelector(`text=${name}`)
}
async function addCatalog(name, unit, min) {
  await go('catalog')
  await pg.click('button:has-text("Tambah barang")')
  await pg.fill('#ci-name', name)
  await pg.fill('#ci-unit', unit)
  await pg.fill('#ci-min', String(min))
  await pg.click('.modal button:has-text("Simpan")')
  await pg.waitForSelector(`td:has-text("${name}")`)
}
async function addItem(href, label, qty) {
  await pg.evaluate((h) => (location.hash = h), href.replace(/^#/, ''))
  await pg.waitForSelector('text=Tambah barang')
  await pg.click('button:has-text("Tambah barang")')
  await pg.selectOption('#ai-item', { label })
  await pg.fill('#ai-qty', String(qty))
  await pg.fill('#ai-date', OPEN)
  await pg.click('.modal button:has-text("Tambah")')
  await pg.waitForSelector(`td:has-text("${label.split(' (')[0]}")`)
}
async function record(item, type, qty, date, note = '') {
  await pg.click('button:has-text("Catat transaksi")')
  const val = await pg.$$eval('#tx-item option', (o, n) => o.find((x) => x.textContent.startsWith(n + ' '))?.value, item)
  await pg.selectOption('#tx-item', val)
  await pg.click(`.modal label:has-text("${type === 'masuk' ? 'Barang masuk' : 'Barang keluar'}") input`)
  await pg.fill('#tx-qty', String(qty))
  await pg.fill('#tx-date', date)
  await pg.fill('#tx-note', note)
  await pg.click('.modal button:has-text("Catat")')
  await pg.waitForSelector('.modal', { state: 'detached' })
}
const rowCells = async (name) =>
  (await pg.locator('main tbody tr', { has: pg.locator(`button.linkbtn:text-is("${name}")`) }).first().locator('td').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim())

/** Menunggu sampai sel tertentu bernilai val (data dashboard dimuat ulang tanpa penanda khusus). */
async function until(name, idx, val) {
  for (let i = 0; i < 40; i++) {
    const c = await rowCells(name).catch(() => [])
    if (c[idx] === val) return
    await pg.waitForTimeout(250)
  }
}

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')

// ---- Developer menyiapkan data
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Uji Dashboard')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Uji Dashboard')
for (const n of ['Jalan Maros', 'Jembatan Walanae']) {
  await pg.click('button:has-text("Tambah proyek")')
  await pg.fill('#pr-name', n)
  await pg.fill('#pr-sd', OPEN)
  await pg.click('.modal button:has-text("Simpan")')
  await pg.waitForSelector(`text=${n}`)
}
const hrefA = await pg.getAttribute('a:has-text("Jalan Maros")', 'href')
const hrefB = await pg.getAttribute('a:has-text("Jembatan Walanae")', 'href')
await addCatalog('Semen Portland', 'Sak', 20)
await addCatalog('Pasir Beton', 'm3', 10)
await addCatalog('Besi Beton', 'Batang', 5)
await addItem(hrefA, 'Semen Portland (Sak)', 100)
await addItem(hrefA, 'Pasir Beton (m3)', 50)
await addItem(hrefA, 'Besi Beton (Batang)', 100)
await addItem(hrefB, 'Semen Portland (Sak)', 40)
await createUser('siti', 'Siti Gudang', 'siti-pass-1', 'Admin Logistik / Gudang (20)', ['Jalan Maros'])
await createUser('budi', 'Budi Manajer', 'budi-pass-1', 'Manajer Proyek (50)', ['Jalan Maros'])
ok('data uji disiapkan lewat UI', true)
await logout()

// ---- Admin Logistik mencatat transaksi proyek A
await login('siti', 'siti-pass-1')
await pg.waitForSelector('.me')
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', prevYm)
await pg.waitForTimeout(700)
await record('Semen Portland', 'keluar', 20, D_PREV, 'bulan lalu')
await pg.fill('#inv-month', curYm)
await pg.waitForTimeout(700)
await record('Semen Portland', 'masuk', 40, D_CUR, 'kiriman')
await record('Semen Portland', 'keluar', 30, D_CUR, 'pondasi')
await record('Pasir Beton', 'keluar', 45, D_CUR, 'cor')
await pg.waitForSelector('main tbody tr:has-text("cor")')
ok('transaksi uji dicatat', true)
await logout()

// ---- Developer: dashboard satu proyek
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('dashboard')
await pg.waitForSelector('#dash-scope')
ok('Developer melihat pilihan Semua proyek (default)', (await pg.inputValue('#dash-scope')) === 'all')
await pg.selectOption('#dash-scope', { label: 'Jalan Maros' })
await until('Semen Portland', 2, '80')
const semen = await rowCells('Semen Portland')
// kolom: nama, satuan, awal, masuk, keluar, sisa, laju, pemakaian, cukup, status
ok('Semen: awal 80, masuk 40, keluar 30, sisa 90 (cocok hitungan manual dari buku)', semen[2] === '80' && semen[3] === '40' && semen[4] === '30' && semen[5] === '90', JSON.stringify(semen))
ok('Semen: pemakaian 30/(80+40) = 25%', semen[7].includes('25%'), semen[7])
const pasir = await rowCells('Pasir Beton')
ok('Pasir: awal 50, keluar 45, sisa 5, Kritis (batas 10)', pasir[2] === '50' && pasir[4] === '45' && pasir[5] === '5' && pasir[9] === 'Kritis', JSON.stringify(pasir))
const besi = await rowCells('Besi Beton')
ok('Besi tanpa transaksi: sisa 100, Tidak bergerak bila sudah >= 14 hari sejak saldo awal', besi[5] === '100' && (besi[9] === 'Tidak bergerak' || besi[9] === 'Aman'), JSON.stringify(besi))
const kp = await pg.textContent('.kpis')
ok('KPI: 3 jenis barang, 3 transaksi, 1 kritis', /Jenis barang aktif3/.test(kp) && /Transaksi.*3/.test(kp) && /Stok kritis1/.test(kp), kp)
ok('perbandingan antar proyek tidak tampil untuk satu proyek', (await pg.$('text=Perbandingan antar proyek')) === null)

// semua proyek: barang sama digabung, perbandingan tampil
await pg.selectOption('#dash-scope', 'all')
await pg.waitForSelector('text=Perbandingan antar proyek')
const semenAll = await rowCells('Semen Portland')
ok('Semua proyek: Semen digabung (awal 120, sisa 130)', semenAll[2] === '120' && semenAll[5] === '130', JSON.stringify(semenAll))
const cmp = await pg.textContent('section:has-text("Perbandingan antar proyek")')
ok('perbandingan memuat kedua proyek', cmp.includes('Jalan Maros') && cmp.includes('Jembatan Walanae'))

// bulan lalu
await pg.fill('#dash-month', prevYm)
await until('Semen Portland', 2, '140')
const prevRow = await rowCells('Semen Portland')
ok('bulan lalu: Semen awal 140 (100+40), keluar 20', prevRow[2] === '140' && prevRow[4] === '20', JSON.stringify(prevRow))
await pg.fill('#dash-month', curYm)
await pg.selectOption('#dash-scope', { label: 'Jalan Maros' })
await until('Semen Portland', 2, '80')

// rincian
await pg.click('button.linkbtn:text-is("Semen Portland")')
await pg.waitForSelector('svg[aria-label*="Sisa stok Semen Portland"]')
await pg.waitForSelector('svg[aria-label*="Masuk dan keluar Semen Portland"]')
ok('rincian barang menampilkan grafik sisa 30 hari dan masuk/keluar 6 bulan', true)
await pg.keyboard.press('Escape')

// pencarian dan urut
await pg.fill('input[aria-label="Cari barang"]', 'pasir')
ok('pencarian menyaring barang', (await pg.$$('main tbody tr')).length === 1)
await pg.fill('input[aria-label="Cari barang"]', '')
await logout()

// ---- Manajer Proyek mengoreksi, dashboard mengikuti
await login('budi', 'budi-pass-1')
await pg.waitForSelector('.me')
await go('dashboard')
await pg.waitForSelector('#dash-scope')
const opts = await pg.$$eval('#dash-scope option', (o) => o.map((x) => x.textContent))
ok('Manajer Proyek hanya melihat proyeknya di dashboard', JSON.stringify(opts) === JSON.stringify(['Jalan Maros']), JSON.stringify(opts))
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', curYm)
await pg.waitForSelector('main tbody tr:has-text("kiriman")')
await pg.locator('tr', { hasText: 'kiriman' }).locator('button:has-text("Koreksi")').click()
await pg.fill('#co-reason', 'Salah input')
await pg.click('.modal button:has-text("Buat koreksi")')
await pg.waitForSelector('main tbody tr:has-text("Sudah dikoreksi")')
await go('dashboard')
await pg.waitForSelector('button.linkbtn:text-is("Semen Portland")')
const after = await rowCells('Semen Portland')
ok('setelah koreksi: masuk 0 (efektif), keluar 30, sisa 50, pemakaian 30/80', after[3] === '0' && after[4] === '30' && after[5] === '50' && after[7].includes('37,5%'), JSON.stringify(after))
await logout()

// ---- Responsif
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('dashboard')
await pg.waitForSelector('button.linkbtn:text-is("Semen Portland")')
for (const w of [360, 390, 768, 1100, 1280]) {
  await pg.setViewportSize({ width: w, height: 860 })
  await pg.waitForTimeout(200)
  ok(`tanpa scroll samping dashboard @${w}`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
}
await pg.setViewportSize({ width: 390, height: 860 })
await pg.click('button.linkbtn:text-is("Semen Portland")')
await pg.waitForSelector('svg[aria-label*="Sisa stok Semen Portland"]')
ok('rincian barang tanpa scroll samping @390', !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
