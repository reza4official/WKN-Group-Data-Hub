import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-wkn'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents'
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const dig = (u) => createHash('sha256').update(u.trim().normalize('NFC').toLowerCase().normalize('NFC')).digest('hex')

async function mk(username, pw, { role = 'log', disabledDoc = false, authDisabled = false, noDoc = false } = {}) {
  const r = await fetch(`${AUTH}/accounts`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email: `${dig(username)}@users.wkngroup.invalid`, password: pw, disabled: authDisabled }),
  }).then((x) => x.json())
  if (!noDoc) {
    await fetch(`${FS}/users/${r.localId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({
        fields: {
          username: { stringValue: username },
          name: { stringValue: 'Uji ' + username },
          roleId: { stringValue: role },
          level: { integerValue: '20' },
          disabled: { booleanValue: disabledDoc },
          emailContact: { stringValue: username + '@x.com' },
        },
      }),
    })
  }
}
await mk('Siti Gudang', 'abcdef', { role: 'log' })
await mk('nonaktif-doc', 'abcdef', { disabledDoc: true })
await mk('nonaktif-auth', 'abcdef', { authDisabled: true })
await mk('tanpa-profil', 'abcdef', { noDoc: true })
await mk('a/b..c__x__', 'spasi 123', { role: 'pm' })

const b = await chromium.launch()
const results = []
const ok = (n, c, extra = '') => results.push([c ? 'OK   ' : 'GAGAL', n, extra])
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
const pg = await ctx.newPage()
const logs = []
pg.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
pg.on('pageerror', (e) => logs.push('PAGEERR ' + e.message))
const PW = 'input[autocomplete=current-password]'
const login = async (u, p) => {
  await pg.fill('#login-username', u)
  await pg.fill(PW, p)
  await pg.click('button[type=submit]')
}

await pg.goto('http://127.0.0.1:4173/')
await pg.waitForSelector('#login-username')
ok('form login tampil + footer berversi', (await pg.textContent('footer')).match(/v\d+\.\d+\.\d+$/) !== null)

await login('reza4official_', 'salahsalah')
await pg.waitForSelector('[role=alert]')
const m1 = await pg.textContent('[role=alert]')
await pg.fill('#login-username', 'tidak-ada-sama-sekali')
await pg.click('button[type=submit]')
await pg.waitForTimeout(700)
const m2 = await pg.textContent('[role=alert]')
ok('salah password = salah username (pesan sama)', m1 === m2 && m1.includes('salah'), m1 + ' / ' + m2)

await pg.fill('#login-username', 'x')
await pg.fill(PW, 'abc')
await pg.click('button[type=submit]')
await pg.waitForTimeout(250)
ok('password < 6 ditolak dengan pesan jelas', (await pg.textContent('[role=alert]')).includes('minimal 6'))

await pg.fill(PW, 'rahasia123')
await pg.click('button[aria-label="Tampilkan password"]')
ok('ikon mata membuka karakter password', (await pg.getAttribute(PW, 'type')) === 'text')

await pg.fill('#login-username', '  REZA4OFFICIAL_ ')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')
const me = await pg.textContent('.me')
ok('login username (huruf besar/spasi tepi bebas) -> Developer', me.includes('Developer'), me)
const n = (await pg.$$('.nav a')).length
ok('Developer melihat semua 11 menu', n === 11, String(n))

await pg.reload()
await pg.waitForSelector('.me', { timeout: 8000 })
ok('sesi bertahan setelah reload (tanpa auto logout)', true)
await ctx.clearCookies()
await pg.reload()
await pg.waitForSelector('.me', { timeout: 8000 })
ok('sesi bertahan walau cookie dihapus (tersimpan di penyimpanan lokal)', true)

await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')
ok('logout kembali ke form login', true)
await pg.reload()
await pg.waitForSelector('#login-username')
ok('setelah logout, reload tetap di login', true)

await login('siti gudang', 'abcdef')
await pg.waitForSelector('.me')
const links = await pg.$$eval('.nav a', (a) => a.map((x) => x.textContent))
ok('Admin Logistik hanya melihat menu miliknya', JSON.stringify(links) === JSON.stringify(['Dashboard', 'Transaksi Stok', 'Impor / Ekspor', 'Profil Saya']), JSON.stringify(links))
await pg.evaluate(() => (location.hash = 'users'))
await pg.waitForTimeout(250)
ok('alamat #users -> Akses ditolak', (await pg.textContent('main')).includes('Akses ditolak'))
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')

await login('nonaktif-doc', 'abcdef')
await pg.waitForSelector('.notice:has-text("dinonaktifkan")')
ok('profil dinonaktifkan -> ditolak + pesan', (await pg.textContent('.notice')).includes('dinonaktifkan'))

await login('nonaktif-auth', 'abcdef')
await pg.waitForSelector('[role=alert]')
ok('akun Auth dinonaktifkan -> pesan', (await pg.textContent('[role=alert]')).includes('dinonaktifkan'))

await login('tanpa-profil', 'abcdef')
await pg.waitForSelector('.notice:has-text("belum terdaftar")')
ok('akun tanpa profil -> belum terdaftar', (await pg.textContent('.notice')).includes('belum terdaftar'))

await login('A/B..C__x__', 'spasi 123')
await pg.waitForSelector('.me')
ok('username berisi / .. __ dan password berspasi berhasil', (await pg.textContent('.me')).includes('Manajer Proyek'), await pg.textContent('.me'))
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')

for (const w of [360, 390, 768, 1100]) {
  await pg.setViewportSize({ width: w, height: 800 })
  await pg.waitForTimeout(120)
  ok(`login tanpa scroll samping @${w}`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
}
await pg.setViewportSize({ width: 390, height: 844 })
await pg.screenshot({ path: '/tmp/login-m.png' })
await pg.setViewportSize({ width: 1280, height: 800 })
await pg.screenshot({ path: '/tmp/login-d.png' })

for (const [s, name, e] of results) console.log(s, name, s === 'GAGAL' ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon/.test(l)).join(' | ') || 'tidak ada')
await b.close()
