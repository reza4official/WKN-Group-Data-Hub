// Uji end-to-end Tahap 7 (impor/ekspor Excel dan PDF) terhadap emulator dengan Firestore Rules aktif.
// Berkas Excel dibuat dan dibaca dengan ExcelJS dari node_modules aplikasi. Tanggal relatif terhadap hari ini (WITA).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ExcelJS = createRequire('/home/user/WKN-Group-Data-Hub/app/package.json')('exceljs')
const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

const wita = new Date(Date.now() + 8 * 3_600_000)
const ymOf = (d) => d.toISOString().slice(0, 7)
const curYm = ymOf(wita)
const prevYm = ymOf(new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 1, 1)))
const OPEN = `${ymOf(new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1)))}-01`
const D_PREV = `${prevYm}-15`
const D_CUR = `${curYm}-01`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
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
async function saveDownload(click) {
  const [dl] = await Promise.all([pg.waitForEvent('download'), click()])
  const path = await dl.path()
  return { name: dl.suggestedFilename(), path }
}
async function xlsx(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb
}

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')

// ---- Developer menyiapkan data
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Uji Impor')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Uji Impor')
await pg.click('button:has-text("Tambah proyek")')
await pg.fill('#pr-name', 'Jalan Maros')
await pg.fill('#pr-sd', OPEN)
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=Jalan Maros')
const hrefA = await pg.getAttribute('a:has-text("Jalan Maros")', 'href')
await addCatalog('Semen Portland', 'Sak', 20)
await addCatalog('Pasir Beton', 'm3', 10)
await addItem(hrefA, 'Semen Portland (Sak)', 100)
await addItem(hrefA, 'Pasir Beton (m3)', 50)
await createUser('budi', 'Budi Manajer', 'budi-pass-1', 'Manajer Proyek (50)', ['Jalan Maros'])
await createUser('siti', 'Siti Gudang', 'siti-pass-1', 'Admin Logistik / Gudang (20)', ['Jalan Maros'])
ok('data uji disiapkan lewat UI', true)
await logout()

// ---- Manajer Proyek: template dan impor
await login('budi', 'budi-pass-1')
await pg.waitForSelector('.me')
await go('io')
await pg.waitForSelector('#io-project')
const tpl = await saveDownload(() => pg.click('button:has-text("Unduh template Excel")'))
const tplWb = await xlsx(tpl.path)
ok('template Excel diunduh dengan nama yang rapi', tpl.name === 'wkn-template-impor-jalan-maros.xlsx', tpl.name)
ok('template memuat lembar Transaksi, Barang, Petunjuk', JSON.stringify(tplWb.worksheets.map((w) => w.name)) === JSON.stringify(['Transaksi', 'Barang', 'Petunjuk']))
const names = []
tplWb.getWorksheet('Barang').eachRow((r, n) => n > 1 && names.push(String(r.getCell(1).value)))
ok('daftar Barang memuat barang proyek', names.includes('Semen Portland') && names.includes('Pasir Beton'), JSON.stringify(names))

// isi template (pakai Date sungguhan dan angka berkoma teks)
const ws = tplWb.getWorksheet('Transaksi')
const rows = [
  [new Date(`${D_PREV}T00:00:00Z`), 'Semen Portland', 'Masuk', 40, 'kiriman'],
  [D_CUR, ' semen  portland ', 'keluar', 30, 'pondasi'],
  [D_CUR, 'Pasir Beton', 'Keluar', 999, 'melebihi stok'],
  [D_CUR, 'Tidak Ada', 'Masuk', 1, ''],
  ['2000-01-01', 'Semen Portland', 'Masuk', 1, 'terlalu lama'],
  [D_CUR, 'Pasir Beton', 'Masuk', '2,5', '=1+1'],
]
rows.forEach((r, i) => r.forEach((v, c) => (ws.getCell(i + 2, c + 1).value = v)))
await tplWb.xlsx.writeFile('/tmp/e2e-run/isi.xlsx')
await pg.setInputFiles('#io-file', '/tmp/e2e-run/isi.xlsx')
await pg.waitForSelector('text=/Pratinjau · isi.xlsx/')
const sub = await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')
ok('pratinjau: 4 baris valid dan 2 baris salah', /4 baris valid, 2 baris perlu diperbaiki/.test(sub), sub.slice(0, 200))
const prev = await pg.textContent('section:has(h2:has-text("Pratinjau ·")) tbody')
ok('pratinjau menjelaskan baris yang salah', prev.includes('Barang tidak ada di proyek ini') && prev.includes('Tanggal sebelum saldo awal'))
ok('perkiraan penulisan tampil', (await pg.textContent('section:has(h2:has-text("Pratinjau ·"))')).includes('penulisan'))
await pg.click('button:has-text("Impor 4 baris valid")')
await pg.waitForSelector('text=Hasil impor')
const res = await pg.textContent('section:has-text("Hasil impor")')
ok('hasil: 3 diimpor, 1 ditolak server (stok tidak cukup)', /3\s*transaksi diimpor/.test(res) && res.includes('1 ditolak server') && res.includes('Stok tidak cukup'), res.slice(0, 300))
ok('baris ditolak memuat nomor baris Excel (4)', (await pg.textContent('[aria-label="Baris ditolak server"] tbody td')) === '4')

// ---- hasil di Transaksi Stok
await go('inventory')
await pg.waitForSelector('#inv-project')
await pg.fill('#inv-month', curYm)
await pg.waitForSelector('main tbody tr:has-text("pondasi")')
const tx = await pg.textContent('main tbody')
ok('Semen: keluar 30 tercatat dengan Tersisa 110 (100 + 40 - 30)', /pondasi/.test(tx) && tx.includes('110'), tx.slice(0, 300))
ok('Pasir: masuk 2,5 dari koma desimal, Tersisa 52,5', tx.includes('52,5'))
ok('pencatat tercatat atas nama pengimpor', tx.includes('Budi Manajer'))
await pg.fill('#inv-month', prevYm)
await pg.waitForSelector('main tbody tr:has-text("kiriman")')
ok('transaksi bulan lalu ikut masuk', true)

// ---- ekspor
await go('io')
await pg.waitForSelector('#io-project')
await pg.fill('#io-month', curYm)
const ex = await saveDownload(() => pg.click('button:has-text("Excel (.xlsx)")'))
const exWb = await xlsx(ex.path)
ok('ekspor Excel: nama berkas dan lembar Transaksi + Ringkasan', ex.name === `wkn-laporan-jalan-maros-${curYm}.xlsx` && JSON.stringify(exWb.worksheets.map((w) => w.name)) === JSON.stringify(['Transaksi', 'Ringkasan']), ex.name)
const exWs = exWb.getWorksheet('Transaksi')
ok('ekspor memuat kop: pembuat dan waktu cetak', String(exWs.getCell('A4').value).includes('Budi Manajer') && String(exWs.getCell('A5').value).includes('WITA'))
let found = null
exWs.eachRow((r) => String(r.getCell(8).value).includes('pondasi') && (found = r.values))
ok('baris transaksi diekspor dengan angka sebagai angka dan pencatat', found && found[6] === 30 && found[7] === 110 && String(found[9]).includes('Budi'), JSON.stringify(found))
const sumWs = exWb.getWorksheet('Ringkasan')
let semen = null
sumWs.eachRow((r) => String(r.getCell(1).value) === 'Semen Portland' && (semen = r.values))
ok('ringkasan diekspor: Semen awal 140, keluar 30, sisa 110', semen && semen[3] === 140 && semen[5] === 30 && semen[6] === 110, JSON.stringify(semen))
const pdf = await saveDownload(() => pg.click('button:has-text("PDF")'))
const head = readFileSync(pdf.path).subarray(0, 5).toString()
ok('ekspor PDF: berkas PDF sah', head === '%PDF-' && pdf.name.endsWith('.pdf') && readFileSync(pdf.path).length > 3000, `${head} ${pdf.name}`)
await logout()

// ---- Admin Logistik: ekspor boleh, impor tidak
await login('siti', 'siti-pass-1')
await pg.waitForSelector('.me')
await go('io')
await pg.waitForSelector('#io-project')
ok('Admin Logistik: ada tombol ekspor, tanpa unggah impor', (await pg.$('button:has-text("Excel (.xlsx)")')) !== null && (await pg.$('#io-file')) === null && (await pg.textContent('main')).includes('belum diberi izin impor'))
await logout()

// ---- Responsif
await login('budi', 'budi-pass-1')
await pg.waitForSelector('.me')
await go('io')
await pg.waitForSelector('#io-project')
await pg.setInputFiles('#io-file', '/tmp/e2e-run/isi.xlsx')
await pg.waitForSelector('text=/Pratinjau · isi.xlsx/')
for (const w of [360, 390, 768, 1100, 1280]) {
  await pg.setViewportSize({ width: w, height: 860 })
  await pg.waitForTimeout(200)
  ok(`tanpa scroll samping Impor/Ekspor @${w}`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
}

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
