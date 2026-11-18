// Uji end-to-end login biometrik dengan autentikator virtual Chromium (CDP WebAuthn): pendaftaran,
// login, ikon sesuai perangkat, ajakan yang dapat dilewati, pencabutan saat reset password, akun nonaktif.
// Memakai http://localhost:4173 (rpId WebAuthn tidak boleh berupa alamat IP).
import { chromium, devices } from 'playwright'

const BASE = 'http://localhost:4173/'
const results = []
const ok = (name, cond, extra = '') => results.push([cond ? 'OK   ' : 'GAGAL', name, cond ? '' : extra])

const b = await chromium.launch()
const logs = []

async function newPage(opts = {}, virtual = true) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ...opts })
  const pg = await ctx.newPage()
  pg.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
  pg.on('pageerror', (e) => logs.push('PAGEERR ' + e.message))
  let cdp = null
  if (virtual) {
    cdp = await ctx.newCDPSession(pg)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })
  }
  return { ctx, pg, cdp }
}

const PW = 'input[autocomplete=current-password]'
const login = async (pg, u, p) => {
  await pg.fill('#login-username', u)
  await pg.fill(PW, p)
  await pg.click('button[type=submit]')
  await pg.waitForSelector('.me, [role=alert], .notice')
}
const logout = async (pg) => {
  await pg.click('button[aria-label=Keluar]')
  await pg.waitForSelector('#login-username')
}
const go = async (pg, r) => {
  await pg.evaluate((x) => (location.hash = x), r)
  await pg.waitForTimeout(300)
}
const bioBtn = (pg) => pg.locator('button.bio-btn')

const { pg } = await newPage()
await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await bioBtn(pg).waitFor({ timeout: 8000 })
ok('perangkat yang mendukung: tombol biometrik tampil di samping Masuk', (await bioBtn(pg).count()) === 1)
const rows = await pg.evaluate(() => {
  const s = document.querySelector('form button[type=submit]').getBoundingClientRect()
  const bio = document.querySelector('button.bio-btn').getBoundingClientRect()
  return { sameRow: Math.abs(s.top - bio.top) < 6 || Math.abs(s.bottom - bio.bottom) < 6, right: bio.left >= s.right - 1 }
})
ok('tombol biometrik sebaris dan di sisi kanan tombol Masuk', rows.sameRow && rows.right, JSON.stringify(rows))
ok('desktop Linux: ikon sidik jari', (await bioBtn(pg).getAttribute('data-kind')) === 'fingerprint')
ok('belum diaktifkan: gaya tombol putus-putus (data-enabled=0)', (await bioBtn(pg).getAttribute('data-enabled')) === '0')
await bioBtn(pg).click()
ok('belum aktif: ketukan menjelaskan cara mengaktifkan', (await pg.textContent('form')).includes('belum diaktifkan'))

// ---- Developer login awal: ajakan muncul, dapat dilewati
await login(pg, 'Reza4Official_', 'rahasia123')
await pg.waitForSelector('.modal:has-text("Aktifkan login biometrik?")')
ok('login awal: pop-up ajakan aktifkan biometrik muncul', true)
await pg.click('.modal button:has-text("Lewati")')
await pg.waitForSelector('.modal', { state: 'detached' })
ok('ajakan dapat dilewati', true)
await pg.reload()
await pg.waitForSelector('.me')
await pg.waitForTimeout(600)
ok('muat ulang halaman tidak memunculkan ajakan lagi', (await pg.$('.modal')) === null)

// ---- Semi wajib: muncul lagi di login berikutnya, lalu diaktifkan
await logout(pg)
await login(pg, 'Reza4Official_', 'rahasia123')
await pg.waitForSelector('.modal:has-text("Aktifkan login biometrik?")')
ok('ajakan muncul lagi di login berikutnya selama belum aktif', true)
const enableBtn = pg.locator('.modal button:has-text("Aktifkan sekarang")')
await pg.waitForFunction(() => !document.querySelector('.modal button.pri')?.disabled)
await enableBtn.click()
await pg.waitForSelector('.toasts:has-text("diaktifkan")')
ok('biometrik berhasil diaktifkan (pendaftaran WebAuthn diverifikasi Worker)', true)
await pg.waitForSelector('.modal', { state: 'detached' })

// ---- Login biometrik
await logout(pg)
ok('setelah aktif: tombol berstatus aktif (data-enabled=1)', (await bioBtn(pg).getAttribute('data-enabled')) === '1')
await pg.waitForTimeout(500) // beri waktu pengambilan tantangan di muka
await bioBtn(pg).click()
await pg.waitForSelector('.me', { timeout: 15000 })
ok('login biometrik tanpa mengetik password berhasil', (await pg.textContent('.me')).includes('Developer'))
await pg.waitForTimeout(500)
ok('setelah login biometrik tidak ada ajakan', (await pg.$('.modal')) === null)
await pg.reload()
await pg.waitForSelector('.me')
ok('sesi dari login biometrik bertahan setelah reload', true)

// ---- Profil: daftar perangkat
await go(pg, 'profil')
await pg.waitForSelector('text=Chrome di Linux')
let prof = await pg.textContent('main')
ok('Profil memuat perangkat, penanda "Perangkat ini", dan terakhir dipakai', prof.includes('Perangkat ini') && prof.includes('WITA') && !prof.includes('belum pernah'), prof.slice(0, 300))
await pg.click('button:has-text("Hapus")')
await pg.waitForSelector('.toasts:has-text("Perangkat dihapus")')
await pg.waitForSelector('text=Belum ada perangkat yang terdaftar')
ok('perangkat dapat dihapus dari Profil', true)
await logout(pg)
ok('setelah dihapus: tombol kembali belum aktif', (await bioBtn(pg).getAttribute('data-enabled')) === '0')

// ---- Aktifkan ulang lewat Profil
await login(pg, 'Reza4Official_', 'rahasia123')
await pg.click('.modal button:has-text("Lewati")')
await go(pg, 'profil')
await pg.waitForSelector('button:has-text("Aktifkan di perangkat ini")')
await pg.click('button:has-text("Aktifkan di perangkat ini")')
await pg.waitForFunction(() => !document.querySelector('.modal button.pri')?.disabled)
await pg.click('.modal button:has-text("Aktifkan sekarang")')
await pg.waitForSelector('.toasts:has-text("diaktifkan")')
await pg.waitForSelector('text=Aktif di perangkat ini')
ok('pengaktifan ulang dari Profil Saya', true)
// Hapus passkey Developer agar uji akun lain tidak ambigu (satu autentikator virtual dipakai bersama)
await pg.click('button:has-text("Hapus")')
await pg.waitForSelector('.toasts:has-text("Perangkat dihapus")')

// ---- Akun lain: pencabutan saat reset password dan akun nonaktif
await go(pg, 'users')
await pg.click('button:has-text("Tambah akun")')
await pg.fill('#c-un', 'Budi Bio')
await pg.fill('#c-nm', 'Budi Biometrik')
await pg.fill('input[autocomplete=new-password]', 'budi-lama-1')
await pg.selectOption('#c-rl', { label: 'Manajer Proyek (50)' })
await pg.click('.modal button:has-text("Buat akun")')
await pg.waitForSelector('text=Budi Biometrik')
await logout(pg)
await login(pg, 'budi bio', 'budi-lama-1')
await pg.waitForSelector('.modal:has-text("Aktifkan login biometrik?")')
await pg.waitForFunction(() => !document.querySelector('.modal button.pri')?.disabled)
await pg.click('.modal button:has-text("Aktifkan sekarang")')
await pg.waitForSelector('.toasts:has-text("diaktifkan")')
await logout(pg)
await pg.waitForTimeout(500)
await bioBtn(pg).click()
await pg.waitForSelector('.me', { timeout: 15000 })
ok('akun kedua: login biometrik berhasil (passkey bukan milik Developer)', (await pg.textContent('.me')).includes('Manajer Proyek'))
await logout(pg)

// Developer mereset password Budi -> passkey Budi dicabut
await login(pg, 'Reza4Official_', 'rahasia123')
await pg.click('.modal button:has-text("Lewati")').catch(() => {})
await go(pg, 'users')
await pg.locator('tr', { hasText: 'Budi Biometrik' }).locator('button:has-text("Reset password")').click()
await pg.fill('input[autocomplete=new-password]', 'budi-baru-2')
await pg.click('.modal button:has-text("Simpan password baru")')
await pg.waitForSelector('.toasts:has-text("diganti")')
await logout(pg)
await pg.waitForTimeout(500)
await bioBtn(pg).click()
await pg.waitForSelector('[role=alert]', { timeout: 15000 })
const failMsg = await pg.textContent('[role=alert]')
ok('setelah reset password, login biometrik lama ditolak dengan petunjuk', failMsg.includes('tidak berlaku lagi'), failMsg)
ok('data biometrik lokal dibersihkan: tombol kembali belum aktif', (await bioBtn(pg).getAttribute('data-enabled')) === '0')
await login(pg, 'budi bio', 'budi-baru-2')
await pg.waitForSelector('.modal:has-text("Aktifkan login biometrik?")')
ok('masuk dengan password baru berhasil dan ajakan biometrik muncul lagi', true)
await pg.waitForFunction(() => !document.querySelector('.modal button.pri')?.disabled)
await pg.click('.modal button:has-text("Aktifkan sekarang")')
await pg.waitForSelector('.toasts:has-text("diaktifkan")')
await logout(pg)

// Developer menonaktifkan Budi -> login biometrik ditolak
await login(pg, 'Reza4Official_', 'rahasia123')
await pg.click('.modal button:has-text("Lewati")').catch(() => {})
await go(pg, 'users')
await pg.locator('tr', { hasText: 'Budi Biometrik' }).locator('button:has-text("Nonaktifkan")').click()
await pg.waitForSelector('tr:has-text("Budi Biometrik"):has-text("Nonaktif")')
await logout(pg)
await pg.waitForTimeout(500)
await bioBtn(pg).click()
await pg.waitForSelector('[role=alert]', { timeout: 15000 })
const offMsg = await pg.textContent('[role=alert]')
ok('akun nonaktif: login biometrik ditolak dengan pesan jelas, tanpa sesi', offMsg.includes('dinonaktifkan') && (await pg.$('.me')) === null, offMsg)

// ---- Ikon Face ID pada iPhone
const iph = await newPage({ ...devices['iPhone 13'] })
await iph.pg.goto(BASE)
await iph.pg.waitForSelector('#login-username')
await bioBtn(iph.pg).waitFor({ timeout: 8000 })
ok('iPhone 13: ikon Face ID dan label wajah', (await bioBtn(iph.pg).getAttribute('data-kind')) === 'face' && (await bioBtn(iph.pg).getAttribute('aria-label')).includes('Face ID'))
const sw = await iph.pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)
ok('iPhone 13: login tanpa scroll samping', !sw)
const iphRow = await iph.pg.evaluate(() => {
  const s = document.querySelector('form button[type=submit]').getBoundingClientRect()
  const bio = document.querySelector('button.bio-btn').getBoundingClientRect()
  return { sameRow: Math.abs(s.top - bio.top) < 6 || Math.abs(s.bottom - bio.bottom) < 6, w: Math.round(bio.width) }
})
ok('iPhone 13: tombol biometrik sebaris dengan Masuk', iphRow.sameRow, JSON.stringify(iphRow))
await iph.pg.screenshot({ path: '/tmp/bio-iphone.png' })
await iph.ctx.close()

// ---- iPhone dengan tombol Home -> sidik jari (layar 375x667)
const se = await newPage({ ...devices['iPhone SE'] })
await se.pg.goto(BASE)
await bioBtn(se.pg).waitFor({ timeout: 8000 })
ok('iPhone SE (Touch ID): ikon sidik jari', (await bioBtn(se.pg).getAttribute('data-kind')) === 'fingerprint')
await se.ctx.close()

// ---- Perangkat tanpa autentikator platform: tidak ada tombol dan tidak ada ajakan
const none = await newPage({}, false)
await none.pg.goto(BASE)
await none.pg.waitForSelector('#login-username')
await none.pg.waitForTimeout(800)
ok('perangkat tanpa autentikator: tombol biometrik tidak tampil', (await none.pg.locator('button.bio-btn').count()) === 0)
await login(none.pg, 'Reza4Official_', 'rahasia123')
await none.pg.waitForTimeout(800)
ok('perangkat tanpa autentikator: tidak ada ajakan', (await none.pg.$('.modal')) === null)
await none.ctx.close()

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|40[0-9]/i.test(l)).join(' | ') || 'tidak ada')
await b.close()
