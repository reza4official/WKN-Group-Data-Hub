// Uji end-to-end impor penyiapan: katalog barang -> saldo awal proyek -> transaksi, semuanya lewat template Excel
// yang diunduh dari aplikasi. Emulator dengan Firestore Rules aktif. Prasyarat sama seperti tahap7.mjs.
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const ExcelJS = createRequire('/home/user/WKN-Group-Data-Hub/app/package.json')('exceljs')
const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

const wita = new Date(Date.now() + 8 * 3_600_000)
const today = wita.toISOString().slice(0, 10)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)}-01`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const pg = await ctx.newPage()
const logs = []
pg.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
pg.on('pageerror', (e) => logs.push('PAGEERR ' + e.message))

const go = async (r) => {
  await pg.evaluate((x) => (location.hash = x), r)
  await pg.waitForTimeout(500)
}
async function download(clickText) {
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click(clickText)])
  return { name: dl.suggestedFilename(), path: await dl.path() }
}
async function open(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb
}
async function upload(wb, file) {
  await wb.xlsx.writeFile(file)
  await pg.setInputFiles('#io-file', file)
}

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await pg.fill('#login-username', 'Reza4Official_')
await pg.fill('input[autocomplete=current-password]', 'rahasia123')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')

// proyek
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Uji Penyiapan')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Uji Penyiapan')
await pg.click('button:has-text("Tambah proyek")')
await pg.fill('#pr-name', 'Jalan Maros')
await pg.fill('#pr-sd', OPEN)
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=Jalan Maros')

// ---- 1. katalog
await go('io')
await pg.waitForSelector('#io-kind')
const kinds = await pg.$$eval('#io-kind option', (o) => o.map((x) => x.textContent))
ok('Developer melihat tiga jenis impor', JSON.stringify(kinds) === JSON.stringify(['Transaksi stok', 'Katalog barang', 'Saldo awal proyek']), JSON.stringify(kinds))
await pg.selectOption('#io-kind', 'catalog')
const t1 = await download('button:has-text("Unduh template Excel")')
const w1 = await open(t1.path)
ok('template katalog: nama berkas dan lembar', t1.name === 'wkn-template-katalog-barang.xlsx' && JSON.stringify(w1.worksheets.map((w) => w.name)) === JSON.stringify(['Katalog', 'Contoh Pengisian', 'Barang di Katalog', 'Petunjuk']), `${t1.name} ${w1.worksheets.map((w) => w.name)}`)
let ex = ''
w1.getWorksheet('Contoh Pengisian').eachRow((r) => (ex += (r.values || []).join('|') + '\n'))
ok('template katalog memuat contoh benar dan salah', ex.includes('BENAR') && ex.includes('SALAH'))
const ks = w1.getWorksheet('Katalog')
;[['Semen Portland', 'Sak', 'Bahan Bangunan', 100], ['Pasir Beton', 'm3', 'Agregat', '20'], ['Solar', 'Liter', null, '5,5'], [' semen  portland', 'Kg'], ['Paku', '']].forEach((r, i) => r.forEach((v, c) => v !== null && (ks.getCell(i + 2, c + 1).value = v)))
await upload(w1, '/tmp/e2e-run/katalog.xlsx')
await pg.waitForSelector('text=/Pratinjau · katalog.xlsx/')
const sub1 = await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')
ok('pratinjau katalog: 3 valid, 2 salah (kembar dan satuan kosong)', /3 baris valid, 2 baris perlu diperbaiki/.test(sub1) && sub1.includes('kembar dengan baris 2') && sub1.includes('Satuan kosong'), sub1.slice(0, 300))
await pg.click('button:has-text("Impor 3 baris valid")')
await pg.waitForSelector('text=Hasil impor')
ok('katalog: 3 barang diimpor', /3\s*barang diimpor/.test(await pg.textContent('section:has(h2:has-text("Hasil impor"))')))
await go('catalog')
await pg.waitForSelector('td:has-text("Solar")')
const cat = await pg.textContent('main tbody')
ok('katalog tampil di halaman Katalog Barang dengan satuan dan batas minimum', cat.includes('Semen Portland') && cat.includes('Pasir Beton') && cat.includes('Liter') && cat.includes('5,5'), cat.slice(0, 300))

// ---- 2. saldo awal
await go('io')
await pg.waitForSelector('#io-kind')
await pg.selectOption('#io-kind', 'opening')
const t2 = await download('button:has-text("Unduh template Excel")')
const w2 = await open(t2.path)
const names = []
w2.getWorksheet('Saldo Awal').eachRow((r, n) => n > 1 && names.push(String(r.getCell(1).value)))
ok('template saldo awal terisi semua barang katalog (urut nama)', t2.name === 'wkn-template-saldo-awal-jalan-maros.xlsx' && JSON.stringify(names) === JSON.stringify(['Pasir Beton', 'Semen Portland', 'Solar']), `${t2.name} ${JSON.stringify(names)}`)
const so = w2.getWorksheet('Saldo Awal')
so.getCell('B2').value = 50
so.getCell('C2').value = new Date(`${OPEN}T00:00:00Z`)
so.getCell('B3').value = 600
so.getCell('C3').value = OPEN
so.getCell('D3').value = 100
// baris Solar dibiarkan kosong
await upload(w2, '/tmp/e2e-run/awal.xlsx')
await pg.waitForSelector('text=/Pratinjau · awal.xlsx/')
const sub2 = await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')
ok('pratinjau saldo awal: 2 valid dan 1 baris kosong dilewati', /2 baris valid, 0 baris perlu diperbaiki/.test(sub2) && sub2.includes('1 baris tanpa isian dilewati'), sub2.slice(0, 300))
await pg.click('button:has-text("Impor 2 baris valid")')
await pg.waitForSelector('text=Hasil impor')
ok('saldo awal: 2 barang diimpor', /2\s*barang diimpor/.test(await pg.textContent('section:has(h2:has-text("Hasil impor"))')))
const href = await pg.getAttribute('a:has-text("Lihat barang proyek")', 'href')
await pg.evaluate((h) => (location.hash = h.replace(/^#/, '')), href)
await pg.waitForSelector('td:has-text("Semen Portland")')
const pt = await pg.textContent('main tbody')
ok('barang proyek tampil dengan saldo awal dan siap menerima transaksi', pt.includes('600') && pt.includes('50') && pt.includes('Siap menerima transaksi') && !pt.includes('Solar'), pt.slice(0, 300))

// impor ulang: barang sudah ada di proyek
await go('io')
await pg.waitForSelector('#io-kind')
await pg.selectOption('#io-kind', 'opening')
await pg.setInputFiles('#io-file', '/tmp/e2e-run/awal.xlsx')
await pg.waitForSelector('text=/Pratinjau · awal.xlsx/')
ok('impor ulang: barang yang sudah di proyek tidak ditimpa (0 valid)', /0 baris valid, 2 baris perlu diperbaiki/.test(await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')))
await pg.click('button:has-text("Batal")')

// ---- 3. transaksi
await pg.selectOption('#io-kind', 'tx')
const t3 = await download('button:has-text("Unduh template Excel")')
const w3 = await open(t3.path)
const names3 = []
w3.getWorksheet('Barang').eachRow((r, n) => n > 1 && names3.push(String(r.getCell(1).value)))
ok('template transaksi hanya memuat barang bersaldo awal', JSON.stringify(names3.sort()) === JSON.stringify(['Pasir Beton', 'Semen Portland']), JSON.stringify(names3))
const ts = w3.getWorksheet('Transaksi')
;[[today, 'Semen Portland', 'Masuk', 40, 'kiriman'], [today, 'Semen Portland', 'Keluar', 30, 'pondasi'], [today, 'Solar', 'Masuk', 5, 'belum ada saldo awal']].forEach((r, i) => r.forEach((v, c) => (ts.getCell(i + 2, c + 1).value = v)))
await upload(w3, '/tmp/e2e-run/trx.xlsx')
await pg.waitForSelector('text=/Pratinjau · trx.xlsx/')
const sub3 = await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')
ok('transaksi: barang tanpa saldo awal ditolak dengan petunjuk', /2 baris valid, 1 baris perlu diperbaiki/.test(sub3) && sub3.includes('Barang ada di katalog tetapi belum ditambahkan ke proyek'), sub3.slice(0, 300))
await pg.click('button:has-text("Impor 2 baris valid")')
await pg.waitForSelector('text=Hasil impor')
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.waitForSelector('main tbody tr:has-text("pondasi")')
const inv = await pg.textContent('main tbody')
ok('transaksi hasil impor: Semen 600 + 40 - 30 = 610', inv.includes('610'), inv.slice(0, 300))

for (const w of [360, 390, 768, 1100, 1440]) {
  await pg.setViewportSize({ width: w, height: 860 })
  await go('io')
  await pg.selectOption('#io-kind', 'opening')
  await pg.setInputFiles('#io-file', '/tmp/e2e-run/awal.xlsx')
  await pg.waitForSelector('text=/Pratinjau · awal.xlsx/')
  ok(`tanpa scroll samping Impor/Ekspor (pratinjau) @${w}`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
}

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
