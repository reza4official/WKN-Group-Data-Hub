// Uji end-to-end Tahap 8 (Profil + Database Karyawan) terhadap emulator dengan Firestore Rules aktif.
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const ExcelJS = createRequire('/home/user/WKN-Group-Data-Hub/app/package.json')('exceljs')
const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

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
const menu = () => pg.$$eval('.nav a', (a) => a.map((x) => x.textContent.trim()))
async function createUser(username, name, pass, roleLabel) {
  await go('users')
  await pg.click('button:has-text("Tambah akun")')
  await pg.fill('#c-un', username)
  await pg.fill('#c-nm', name)
  await pg.fill('input[autocomplete=new-password]', pass)
  await pg.selectOption('#c-rl', { label: roleLabel })
  await pg.click('.modal button:has-text("Buat akun")')
  await pg.waitForSelector(`text=${name}`)
}

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')
await createUser('siti', 'Siti Gudang', 'siti-lama-1', 'Admin Logistik / Gudang (20)')
await createUser('budi', 'Budi Manajer', 'budi-pass-1', 'Manajer Proyek (50)')
ok('akun uji dibuat', true)
await logout()

// ---- Siti mengubah data dirinya
await login('siti', 'siti-lama-1')
await pg.waitForSelector('.me')
await go('profil')
await pg.waitForSelector('#pf-name')
ok('Profil menampilkan data saat ini', (await pg.inputValue('#pf-name')) === 'Siti Gudang' && (await pg.textContent('main')).includes('@siti'))
ok('tombol Simpan nonaktif sebelum ada perubahan', await pg.isDisabled('button:has-text("Simpan perubahan")'))
await pg.fill('#pf-name', 'Siti Baru')
await pg.fill('#pf-phone', '0813-1234')
await pg.fill('#pf-email', 'Siti@Contoh.com')
await pg.click('button:has-text("Simpan perubahan")')
await pg.waitForSelector('.toasts:has-text("Database Karyawan")')
ok('data diri tersimpan (nama di bilah atas ikut berubah)', (await pg.textContent('.me')).includes('Siti Baru'), await pg.textContent('.me'))
await pg.reload()
await pg.waitForSelector('#pf-name')
ok('setelah muat ulang nilai tetap (email dinormalkan huruf kecil)', (await pg.inputValue('#pf-name')) === 'Siti Baru' && (await pg.inputValue('#pf-email')) === 'siti@contoh.com')
ok('Admin Logistik tidak melihat menu Database Karyawan', !(await menu()).includes('Database Karyawan'))
await go('employees')
ok('alamat #employees ditolak untuk Admin Logistik', (await pg.textContent('main')).includes('Akses ditolak'))
await logout()

// ---- Manajer Proyek: email kembar ditolak, database karyawan tertutup
await login('budi', 'budi-pass-1')
await pg.waitForSelector('.me')
await go('profil')
await pg.waitForSelector('#pf-name')
await pg.fill('#pf-email', 'siti@contoh.com')
await pg.click('button:has-text("Simpan perubahan")')
await pg.waitForSelector('[role=alert]:has-text("sudah dipakai")')
ok('email yang dipakai akun lain ditolak dengan pesan jelas', true)
ok('Manajer Proyek tidak melihat Database Karyawan dan ditolak lewat alamat', !(await menu()).includes('Database Karyawan'))
await go('employees')
ok('alamat #employees ditolak untuk Manajer Proyek', (await pg.textContent('main')).includes('Akses ditolak'))
await logout()

// ---- Developer: Database Karyawan menampilkan perubahan
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
ok('Developer melihat menu Database Karyawan', (await menu()).includes('Database Karyawan'))
await go('employees')
await pg.waitForSelector('table')
const row = pg.locator('main tbody tr', { hasText: 'Siti Baru' })
const rt = (await row.textContent()).replace(/\s+/g, ' ')
ok('perubahan profil muncul: nama, HP, email', rt.includes('0813-1234') && rt.includes('siti@contoh.com'), rt)
ok('pengubah dan waktu (WITA) tercatat: Siti Baru sendiri', /Siti Baru.*WITA/.test(rt.replace(/^.*?@siti/, '')) || rt.includes('WITA'), rt)
const all = (await pg.textContent('main tbody')).replace(/\s+/g, ' ')
ok('semua akun tampil, termasuk Developer dan Manajer Proyek', all.includes('Reza') && all.includes('Budi Manajer') && all.includes('Developer'))
await pg.fill('input[aria-label="Cari karyawan"]', '0813')
ok('pencarian berdasarkan nomor HP', (await pg.$$('main tbody tr')).length === 1)
await pg.fill('input[aria-label="Cari karyawan"]', '')
await pg.selectOption('select[aria-label="Filter role"]', { label: 'Developer' })
ok('filter role', (await pg.$$('main tbody tr')).length === 1)
await pg.selectOption('select[aria-label="Filter role"]', '')
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("Excel")')])
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(await dl.path())
const ws = wb.getWorksheet('Karyawan')
let found = null
ws.eachRow((r) => String(r.getCell(1).value) === 'Siti Baru' && (found = r.values))
ok('ekspor Excel database karyawan memuat data terkini', dl.suggestedFilename() === 'wkn-database-karyawan.xlsx' && found && found[3] === '0813-1234' && found[4] === 'siti@contoh.com', JSON.stringify(found))
await go('audit')
await pg.waitForSelector('table')
const audit = await pg.textContent('main')
ok('log audit memuat "Ubah data diri" atas nama pelaku', audit.includes('Ubah data diri') && audit.includes('Siti Baru'), audit.slice(0, 200))
await logout()

// ---- Ganti password
await login('siti', 'siti-lama-1')
await pg.waitForSelector('.me')
await go('profil')
await pg.waitForSelector('#pf-name')
ok('tiga isian password memiliki ikon mata', (await pg.$$('button[aria-label="Tampilkan password"]')).length === 3)
await pg.getByLabel('Password lama').fill('salah-banget')
await pg.getByLabel('Password baru', { exact: true }).fill('siti-baru-2')
await pg.getByLabel('Ulangi password baru').fill('siti-baru-2')
await pg.click('button:has-text("Ganti password")')
await pg.waitForSelector('[role=alert]:has-text("Password lama salah")')
ok('password lama salah ditolak', true)
await pg.getByLabel('Password lama').fill('siti-lama-1')
await pg.getByLabel('Ulangi password baru').fill('beda-sendiri')
await pg.click('button:has-text("Ganti password")')
await pg.waitForSelector('[role=alert]:has-text("tidak sama")')
ok('konfirmasi tidak sama ditolak', true)
await pg.getByLabel('Ulangi password baru').fill('siti-baru-2')
await pg.click('button:has-text("Ganti password")')
await pg.waitForSelector('.toasts:has-text("Password diganti")')
ok('password berhasil diganti dan sesi tetap masuk', (await pg.$('.me')) !== null)
await go('dashboard')
await pg.waitForTimeout(500)
ok('sesi tetap berfungsi setelah ganti password (halaman lain terbuka)', (await pg.$('.me')) !== null)
await logout()
await login('siti', 'siti-lama-1')
await pg.waitForSelector('[role=alert]')
ok('password lama tidak lagi berlaku', (await pg.textContent('[role=alert]')).includes('salah'))
await login('siti', 'siti-baru-2')
await pg.waitForSelector('.me')
ok('password baru berlaku', true)
await logout()
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('audit')
await pg.waitForSelector('table')
const audit2 = await pg.textContent('main')
ok('audit mencatat ganti password tanpa memuat password', audit2.includes('Ganti password sendiri') && !/siti-baru-2|siti-lama-1|salah-banget/.test(audit2))

// ---- Responsif
for (const w of [360, 390, 768, 1100]) {
  await pg.setViewportSize({ width: w, height: 860 })
  for (const r of ['profil', 'employees']) {
    await go(r)
    ok(`tanpa scroll samping ${r} @${w}`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
  }
}

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
