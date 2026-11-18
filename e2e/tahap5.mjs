// Uji end-to-end Tahap 5 terhadap emulator dengan Firestore Rules aktif: transaksi stok masuk/keluar,
// validasi stok, koreksi, lingkup proyek, audit, dan responsif. Prasyarat sama seperti tahap4.mjs.
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

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
  await pg.waitForTimeout(400)
}
const main = () => pg.textContent('main')
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
async function record(type, qty, date, note = '') {
  await pg.click('button:has-text("Catat transaksi")')
  await pg.click(`.modal label:has-text("${type === 'masuk' ? 'Barang masuk' : 'Barang keluar'}") input`)
  await pg.fill('#tx-qty', String(qty))
  await pg.fill('#tx-date', date)
  await pg.fill('#tx-note', note)
  await pg.click('.modal button:has-text("Catat")')
}
const rowsText = async () => await pg.$$eval('main tbody tr', (r) => r.map((x) => x.textContent.replace(/\s+/g, ' ').trim()))

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')

// ---- Developer menyiapkan data
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Uji Stok')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Uji Stok')
for (const n of ['Jalan Maros', 'Jembatan Walanae']) {
  await pg.click('button:has-text("Tambah proyek")')
  await pg.fill('#pr-name', n)
  await pg.fill('#pr-sd', '2026-09-01')
  await pg.click('.modal button:has-text("Simpan")')
  await pg.waitForSelector(`text=${n}`)
}
const hrefA = await pg.getAttribute('a:has-text("Jalan Maros")', 'href')
await go('catalog')
await pg.click('button:has-text("Tambah barang")')
await pg.fill('#ci-name', 'Semen Portland')
await pg.fill('#ci-unit', 'Sak')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('td:has-text("Semen Portland")')
await pg.evaluate((h) => (location.hash = h), hrefA.replace(/^#/, ''))
await pg.waitForSelector('text=Belum ada barang di proyek ini')
await pg.click('button:has-text("Tambah barang")')
await pg.fill('#ai-qty', '100')
await pg.fill('#ai-date', '2026-09-01')
await pg.click('.modal button:has-text("Tambah")')
await pg.waitForSelector('td:has-text("Semen Portland")')
await createUser('siti', 'Siti Gudang', 'siti-pass-1', 'Admin Logistik / Gudang (20)', ['Jalan Maros'])
await createUser('rudi', 'Rudi Gudang', 'rudi-pass-1', 'Admin Logistik / Gudang (20)', ['Jembatan Walanae'])
await createUser('budi', 'Budi Manajer', 'budi-pass-1', 'Manajer Proyek (50)', ['Jalan Maros'])
ok('data uji disiapkan lewat UI', true)
await logout()

// ---- Admin Logistik mencatat transaksi
await login('siti', 'siti-pass-1')
await pg.waitForSelector('.me')
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', '2026-09')
await pg.waitForSelector('main tbody tr:has-text("Saldo awal")')
const r0 = await rowsText()
ok('baris saldo awal tampil dengan Tersisa 100', r0.length === 1 && r0[0].includes('Saldo awal') && r0[0].includes('100'), JSON.stringify(r0))
ok('tidak ada tombol Koreksi untuk Admin Logistik', (await pg.$('button:has-text("Koreksi")')) === null)

await record('masuk', 40, '2026-09-10', 'Kiriman supplier')
await pg.waitForSelector('main tbody tr:has-text("Kiriman supplier")')
await record('keluar', 30, '2026-09-12', 'Dipakai pondasi')
await pg.waitForSelector('main tbody tr:has-text("Dipakai pondasi")')
const r1 = await rowsText()
ok('urutan dan Tersisa berjalan 100 -> 140 -> 110', r1.length === 3 && r1[1].includes('140') && r1[2].includes('110'), JSON.stringify(r1))
ok('hari dan tanggal tampil (Kamis, 10 Sep 2026)', r1[1].includes('Kamis, 10 Sep 2026'), r1[1])
ok('pencatat dan waktu WITA tampil pada baris', r1[1].includes('Siti Gudang') && r1[1].includes('WITA'), r1[1])
const foot = await pg.textContent('main tfoot')
ok('total bulan tampil', foot.includes('40') && foot.includes('30'), foot)

// keluar bertanggal mundur yang membuat saldo 12 Sep negatif ditolak; stok kurang ditolak
await record('keluar', 130, '2026-09-11')
await pg.waitForSelector('.modal [role=alert]:has-text("Stok tidak cukup")')
ok('keluar bertanggal mundur yang membuat saldo negatif ditolak', true)
await pg.keyboard.press('Escape')
await record('keluar', 5000, '2026-09-20')
await pg.waitForSelector('.modal [role=alert]:has-text("Stok tidak cukup")')
ok('keluar melebihi stok ditolak dengan pesan jelas', true)
await pg.keyboard.press('Escape')
ok('transaksi yang ditolak tidak tercatat', (await rowsText()).length === 3)

await pg.click('button:has-text("Catat transaksi")')
const minAttr = await pg.getAttribute('#tx-date', 'min')
ok('tanggal formulir dibatasi mulai saldo awal', minAttr === '2026-09-01', String(minAttr))
await pg.keyboard.press('Escape')
await logout()

// ---- Manajer Proyek mengoreksi
await login('budi', 'budi-pass-1')
await pg.waitForSelector('.me')
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', '2026-09')
await pg.waitForSelector('main tbody tr:has-text("Kiriman supplier")')
ok('Manajer Proyek melihat transaksi proyeknya beserta tombol Koreksi', (await pg.$$('button:has-text("Koreksi")')).length === 2)
await pg.locator('tr', { hasText: 'Kiriman supplier' }).locator('button:has-text("Koreksi")').click()
await pg.click('.modal button:has-text("Buat koreksi")')
await pg.waitForSelector('.modal [role=alert]')
ok('koreksi tanpa alasan ditolak', true)
await pg.fill('#co-reason', 'Jumlah salah ketik')
await pg.click('.modal button:has-text("Buat koreksi")')
await pg.waitForSelector('main tbody tr:has-text("Sudah dikoreksi")')
const r2 = await rowsText()
ok(
  'koreksi tercatat sebagai baris baru; asli tetap tampil dan bertanda',
  r2.length === 4 && r2.some((x) => x.includes('Koreksi') && x.includes('Jumlah salah ketik') && x.includes('Budi Manajer')),
  JSON.stringify(r2),
)
ok('Tersisa akhir 70 setelah koreksi', r2.at(-1).includes('70'), r2.at(-1))
ok('transaksi yang sudah dikoreksi tidak bisa dikoreksi lagi (tersisa 1 tombol)', (await pg.$$('button:has-text("Koreksi")')).length === 1)
await pg.fill('#inv-month', '2026-10')
await pg.waitForSelector('text=Belum ada transaksi di bulan ini')
ok('bulan tanpa transaksi punya pesan kosong', true)
await logout()

// ---- Lingkup proyek (Firestore Rules aktif)
await login('rudi', 'rudi-pass-1')
await pg.waitForSelector('.me')
await go('inventory')
await pg.waitForSelector('#inv-project')
const opts = await pg.$$eval('#inv-project option', (o) => o.map((x) => x.textContent))
ok('Admin Logistik hanya melihat proyek yang ditugaskan padanya', JSON.stringify(opts) === JSON.stringify(['Jembatan Walanae']), JSON.stringify(opts))
ok('proyek tanpa barang menampilkan pesan, bukan data proyek lain', (await main()).includes('Belum ada barang di proyek ini') && !(await main()).includes('Kiriman supplier'))
await logout()

// ---- Audit oleh Developer
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('audit')
await pg.waitForSelector('table')
const audit = await main()
ok('log audit memuat barang masuk, keluar, dan koreksi dengan pelaku', ['Barang masuk', 'Barang keluar', 'Koreksi transaksi', 'Siti Gudang', 'Budi Manajer'].every((x) => audit.includes(x)), audit.slice(0, 300))
ok('alasan koreksi ikut tercatat di audit', audit.includes('Jumlah salah ketik'))

// ---- Responsif
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', '2026-09')
await pg.waitForSelector('main tbody tr')
for (const w of [360, 390, 768, 1100]) {
  await pg.setViewportSize({ width: w, height: 860 })
  await pg.waitForTimeout(150)
  const over = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  ok(`tanpa scroll samping halaman Transaksi Stok @${w}`, !over)
}

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
