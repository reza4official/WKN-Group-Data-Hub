// Uji end-to-end Tahap 3 terhadap emulator: akun, role, permintaan reset, audit, hirarki.
// Prasyarat: emulator Auth+Firestore (proyek demo-wkn), `npm run worker`, build aplikasi mode emulator
// disajikan di http://127.0.0.1:4173, dan akun Developer dari scripts/bootstrap-developer.mjs
// (username Reza4Official_, password rahasia123).
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
// Turnstile palsu: lolos otomatis dengan token khusus emulator
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({
    contentType: 'application/javascript',
    body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w1'},remove:function(){}}",
  }),
)

const PW = 'input[autocomplete=current-password]'
async function login(u, p) {
  await pg.fill('#login-username', u)
  await pg.fill(PW, p)
  await pg.click('button[type=submit]')
}
async function logout() {
  await pg.click('button[aria-label=Keluar]')
  await pg.waitForSelector('#login-username')
}
const go = async (route) => {
  await pg.evaluate((r) => (location.hash = r), route)
  await pg.waitForTimeout(250)
}
const menu = () => pg.$$eval('.nav a', (a) => a.map((x) => x.textContent.trim()))
const toastText = () => pg.textContent('.toasts')

await pg.goto(BASE)
await pg.waitForSelector('#login-username')

// ---- Developer menyiapkan perusahaan dan proyek (Tahap 4: akun berlingkup proyek)
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Uji')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Uji')
await pg.click('button:has-text("Tambah proyek")')
await pg.fill('#pr-name', 'Proyek Uji')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=Proyek Uji')
await go('users')
await pg.click('button:has-text("Tambah akun")')
await pg.fill('#c-un', 'Budi PM')
await pg.fill('#c-nm', 'Budi Manajer')
await pg.fill('input[autocomplete=new-password]', 'budi pass 1')
await pg.selectOption('#c-rl', { label: 'Manajer Proyek (50)' })
await pg.fill('#c-em', 'Budi@Contoh.com')
await pg.check('.modal label:has-text("Proyek Uji") input')
await pg.click('button:has-text("Buat akun")')
await pg.waitForSelector('text=Budi Manajer')
ok('Developer membuat Manajer Proyek lewat UI', true)

await pg.click('button:has-text("Tambah akun")')
await pg.fill('#c-un', 'siti')
await pg.fill('#c-nm', 'Siti Gudang')
await pg.fill('input[autocomplete=new-password]', 'siti-lama-1')
await pg.selectOption('#c-rl', { label: 'Admin Logistik / Gudang (20)' })
await pg.check('.modal label:has-text("Proyek Uji") input')
await pg.click('button:has-text("Buat akun")')
await pg.waitForSelector('text=Siti Gudang')
ok('Developer membuat Admin Logistik', true)

// username kembar ditolak dengan pesan
await pg.click('button:has-text("Tambah akun")')
await pg.fill('#c-un', '  BUDI pm ')
await pg.fill('#c-nm', 'Duplikat')
await pg.fill('input[autocomplete=new-password]', 'abcdef')
await pg.click('button:has-text("Buat akun")')
await pg.waitForSelector('[role=alert]:has-text("sudah dipakai")')
ok('username kembar (beda huruf/spasi) ditolak', true)
await pg.keyboard.press('Escape')

// ---- Manajer Proyek: hirarki
await logout()
await login('budi pm', 'budi pass 1')
await pg.waitForSelector('.me')
const m = await menu()
ok('Manajer Proyek tidak melihat Role & Akses dan Log Audit', !m.includes('Role & Akses') && !m.includes('Log Audit') && m.includes('Akun Pengguna') && m.includes('Permintaan Reset'), JSON.stringify(m))
await go('users')
await pg.waitForSelector('text=Siti Gudang')
ok('Manajer Proyek hanya melihat akun di bawahnya (tidak ada Developer, tidak ada diri sendiri)', !(await pg.textContent('main')).includes('Reza') && !(await pg.textContent('main')).includes('Budi Manajer'))
await pg.click('button:has-text("Tambah akun")')
const opts = await pg.$$eval('#c-rl option', (o) => o.map((x) => x.textContent))
ok('role yang ditawarkan hanya yang di bawah level pelaku', JSON.stringify(opts) === JSON.stringify(['Admin Logistik / Gudang (20)']), JSON.stringify(opts))
await pg.keyboard.press('Escape')
await go('roles')
ok('alamat #roles -> Akses ditolak untuk Manajer Proyek', (await pg.textContent('main')).includes('Akses ditolak'))
await go('audit')
ok('alamat #audit -> Akses ditolak untuk Manajer Proyek', (await pg.textContent('main')).includes('Akses ditolak'))

// ---- Siti minta reset dari halaman login
await logout()
await pg.click('button:has-text("Lupa password")')
await pg.fill('#rr-un', 'SITI')
await pg.waitForSelector('[data-ts="1"]')
await pg.waitForTimeout(150)
await pg.click('button:has-text("Kirim permintaan")')
await pg.waitForSelector('[role=status]:has-text("Jika akun itu ada")')
ok('permintaan reset dikirim dari halaman login', true)
// akun tidak ada: jawaban sama persis
await pg.keyboard.press('Escape')
await pg.click('button:has-text("Lupa password")')
await pg.fill('#rr-un', 'tidak-ada-orang-ini')
await pg.waitForTimeout(250)
await pg.click('button:has-text("Kirim permintaan")')
const same = await pg.waitForSelector('[role=status]:has-text("Jika akun itu ada")')
ok('akun tidak ada menghasilkan jawaban yang sama (tanpa enumerasi)', !!same)
await pg.keyboard.press('Escape')

// ---- Budi mengeksekusi permintaan
await login('budi pm', 'budi pass 1')
await pg.waitForSelector('.me')
await go('resets')
await pg.waitForSelector('text=Siti Gudang')
ok('permintaan reset tampil untuk atasan, dengan waktu WITA', (await pg.textContent('main')).includes('WITA'))
await pg.click('button:has-text("Eksekusi reset")')
await pg.fill('input[autocomplete=new-password]', 'siti-baru-2')
await pg.click('button:has-text("Simpan password baru")')
await pg.waitForSelector('text=Dieksekusi oleh')
const handled = await pg.textContent('main')
ok('eksekusi mencatat pelaku dan waktu', handled.includes('Budi Manajer') && handled.includes('WITA'), handled.slice(0, 200))

// ---- Siti: password lama gagal, baru berhasil
await logout()
await login('siti', 'siti-lama-1')
await pg.waitForSelector('[role=alert]')
ok('password lama tidak berlaku setelah reset', (await pg.textContent('[role=alert]')).includes('salah'))
await login('siti', 'siti-baru-2')
await pg.waitForSelector('.me')
ok('password baru berlaku', true)
const sm = await menu()
ok('Admin Logistik tidak melihat menu administrasi', !sm.includes('Akun Pengguna'), JSON.stringify(sm))
await logout()

// ---- Developer: role dan audit
await login('Reza4Official_', 'rahasia123')
await pg.waitForSelector('.me')
await go('roles')
await pg.click('.rolerow:has-text("Manajer Proyek")')
await pg.check('label:has-text("Lihat log audit") input')
await pg.click('button:has-text("Simpan perubahan")')
await pg.waitForSelector('.toasts:has-text("Role diperbarui")')
ok('Developer mengubah izin role Manajer Proyek', true)
await pg.click('.rolerow:has-text("Developer")')
ok('role Developer terkunci (hanya bisa dilihat)', (await pg.$('button:has-text("Simpan perubahan")')) === null)
await pg.click('button:has-text("Role baru")')
await pg.fill('#nr-name', 'Pengawas Lapangan')
await pg.fill('#nr-level', '30')
await pg.click('.modal button:has-text("Buat role")')
await pg.waitForSelector('.rolerow:has-text("Pengawas Lapangan")')
ok('role baru dibuat dan tampil di hirarki', true)
await pg.click('button:has-text("Role baru")')
await pg.fill('#nr-name', 'Level Kembar')
await pg.fill('#nr-level', '30')
await pg.click('.modal button:has-text("Buat role")')
await pg.waitForSelector('[role=alert]:has-text("sudah dipakai")')
ok('level kembar ditolak', true)
await pg.keyboard.press('Escape')

await go('audit')
await pg.waitForSelector('table')
const audit = await pg.textContent('main')
ok('log audit memuat tambah akun, reset password, ubah role, minta reset', ['Tambah akun', 'Reset password', 'Ubah role', 'Minta reset password', 'Tambah role'].every((x) => audit.includes(x)), audit.slice(0, 300))
ok('log audit menampilkan pelaku dan WITA, tanpa password', audit.includes('Budi Manajer') && audit.includes('WITA') && !/siti-baru-2|budi pass|siti-lama/.test(audit))

// ---- Menonaktifkan dan menghapus oleh Budi (kini punya izin audit)
await logout()
await login('budi pm', 'budi pass 1')
await pg.waitForSelector('.me')
await go('users')
await pg.waitForSelector('text=Siti Gudang')
const siti = pg.locator('tr', { hasText: 'Siti Gudang' })
await siti.locator('button:has-text("Nonaktifkan")').click()
await pg.waitForSelector('tr:has-text("Siti Gudang"):has-text("Nonaktif")')
ok('atasan menonaktifkan bawahan', true)
await logout()
await login('siti', 'siti-baru-2')
await pg.waitForSelector('[role=alert]')
ok('akun nonaktif tidak bisa masuk', (await pg.textContent('[role=alert]')).includes('dinonaktifkan'))
await login('budi pm', 'budi pass 1')
await pg.waitForSelector('.me')
await go('users')
await pg.locator('tr', { hasText: 'Siti Gudang' }).locator('button[aria-label^="Hapus"]').click()
await pg.click('button:has-text("Hapus akun")')
await pg.waitForSelector('text=Siti Gudang', { state: 'detached' })
ok('atasan menghapus bawahan', true)

// ---- Responsif halaman baru
for (const w of [360, 390, 768, 1100]) {
  await pg.setViewportSize({ width: w, height: 860 })
  for (const r of ['users', 'resets', 'audit', 'roles']) {
    await go(r)
    const over = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (over) ok(`tanpa scroll samping ${r} @${w}`, false)
  }
}
ok('halaman baru tanpa scroll samping di 360-1100 px', !results.some((r) => r[0] === 'GAGAL' && r[1].startsWith('tanpa scroll')))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
