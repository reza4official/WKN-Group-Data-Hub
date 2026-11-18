// Uji end-to-end Tahap 4 terhadap emulator dengan Firestore Rules aktif: perusahaan, proyek, katalog,
// barang + saldo awal, dan lingkup proyek. Prasyarat sama seperti admin.mjs.
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
  await pg.waitForTimeout(350)
}
const menu = () => pg.$$eval('.nav a', (a) => a.map((x) => x.textContent.trim()))
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

await pg.goto(BASE)
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')

// ---- Developer menyiapkan data
await go('projects')
await pg.waitForSelector('text=Belum ada perusahaan')
ok('keadaan awal: belum ada perusahaan', true)
await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', 'PT. Wiratama Karya Nugraha')
await pg.selectOption('#co-type', 'induk')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('text=PT. Wiratama Karya Nugraha')
ok('perusahaan induk dibuat', true)

await pg.click('button:has-text("Tambah perusahaan")')
await pg.fill('#co-name', ' pt. wiratama karya nugraha ')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('.modal [role=alert]:has-text("sudah ada")')
ok('nama perusahaan kembar ditolak', true)
await pg.keyboard.press('Escape')

for (const [n, loc] of [['Jalan Maros-Pangkep', 'Maros'], ['Jembatan Walanae', 'Soppeng']]) {
  await pg.click('button:has-text("Tambah proyek")')
  await pg.fill('#pr-name', n)
  await pg.fill('#pr-loc', loc)
  await pg.fill('#pr-sd', '2026-09-01')
  await pg.click('.modal button:has-text("Simpan")')
  await pg.waitForSelector(`text=${n}`)
}
ok('dua proyek dibuat', true)
const hrefA = await pg.getAttribute('a:has-text("Jalan Maros-Pangkep")', 'href')
const hrefB = await pg.getAttribute('a:has-text("Jembatan Walanae")', 'href')

// ---- Katalog
await go('catalog')
await pg.waitForSelector('text=Katalog masih kosong')
for (const [n, u, m] of [['Semen Portland', 'Sak 50 kg', '100'], ['Pasir Beton', 'm³', '60']]) {
  await pg.click('button:has-text("Tambah barang")')
  await pg.fill('#ci-name', n)
  await pg.fill('#ci-unit', u)
  await pg.fill('#ci-min', m)
  await pg.click('.modal button:has-text("Simpan")')
  await pg.waitForSelector(`td:has-text("${n}")`)
}
await pg.click('button:has-text("Tambah barang")')
await pg.fill('#ci-name', '  SEMEN portland ')
await pg.fill('#ci-unit', 'Kg')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('.modal [role=alert]:has-text("sudah ada")')
ok('katalog: nama barang kembar (beda huruf/spasi) ditolak', true)
await pg.keyboard.press('Escape')

// ---- Barang proyek + saldo awal (Developer)
await pg.evaluate((h) => (location.hash = h), hrefA.replace(/^#/, ''))
await pg.waitForSelector('text=Belum ada barang di proyek ini')
await pg.click('button:has-text("Tambah barang")')
await pg.selectOption('#ai-item', { label: 'Semen Portland (Sak 50 kg)' })
await pg.fill('#ai-qty', '600')
await pg.fill('#ai-date', '2026-09-01')
await pg.click('.modal button:has-text("Tambah")')
await pg.waitForSelector('td:has-text("Semen Portland")')
await pg.click('button:has-text("Tambah barang")')
await pg.selectOption('#ai-item', { label: 'Pasir Beton (m³)' })
await pg.click('.modal button:has-text("Tambah")')
await pg.waitForSelector('text=Belum ada saldo awal')
ok('barang tanpa saldo awal ditandai', true)
const semenRow = await pg.locator('tr', { hasText: 'Semen Portland' }).textContent()
ok('saldo awal tampil (600 per 1 Sep 2026)', semenRow.includes('600') && semenRow.includes('1 Sep 2026') && semenRow.includes('Siap menerima transaksi'), semenRow)
await pg.click('button:has-text("Tambah barang")')
ok('barang yang sudah ada tidak ditawarkan lagi', (await pg.$$eval('#ai-item option', (o) => o.length)) === 0 || !(await pg.textContent('.modal')).includes('Semen Portland'))
await pg.keyboard.press('Escape')
// saldo awal masa depan ditolak
await pg.locator('tr', { hasText: 'Pasir Beton' }).locator('button:has-text("Atur saldo awal")').click()
await pg.evaluate(() => {
  const d = document.querySelector('#op-date')
  d.removeAttribute('max')
})
await pg.fill('#op-qty', '-5')
await pg.fill('#op-date', '2026-09-01')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('.modal [role=alert]:has-text("negatif")')
ok('saldo awal negatif ditolak', true)
await pg.fill('#op-qty', '90')
await pg.click('.modal button:has-text("Simpan")')
await pg.waitForSelector('tr:has-text("Pasir Beton"):has-text("Siap menerima transaksi")')
ok('saldo awal diatur kemudian', true)

// ---- Akun berlingkup proyek
await createUser('Budi PM', 'Budi Manajer', 'budi-pass-1', 'Manajer Proyek (50)', ['Jalan Maros-Pangkep'])
await createUser('Siti', 'Siti Gudang', 'siti-pass-1', 'Admin Logistik / Gudang (20)', ['Jalan Maros-Pangkep'])
await createUser('Ani', 'Ani Jembatan', 'ani-pass-1', 'Admin Logistik / Gudang (20)', ['Jembatan Walanae'])
ok('akun dibuat dengan penugasan proyek', true)
const usersTxt = await main()
ok('kolom Proyek menampilkan penugasan', usersTxt.includes('Jalan Maros-Pangkep') && usersTxt.includes('Jembatan Walanae'))

// ---- Ani meminta reset (proyek B) agar bisa diuji lingkup
await logout()
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w'},remove:function(){}}" }),
)
await pg.reload()
await pg.waitForSelector('#login-username')
await pg.click('button:has-text("Lupa password")')
await pg.fill('#rr-un', 'ani')
await pg.waitForSelector('[data-ts="1"]')
await pg.waitForTimeout(200)
await pg.click('button:has-text("Kirim permintaan")')
await pg.waitForSelector('[role=status]:has-text("Jika akun itu ada")')
await pg.keyboard.press('Escape')

// ---- Budi (Manajer Proyek, proyek A saja)
await login('budi pm', 'budi-pass-1')
const bm = await menu()
ok('Manajer Proyek melihat menu Proyek & Perusahaan', bm.includes('Proyek & Perusahaan'), JSON.stringify(bm))
await go('projects')
await pg.waitForSelector('text=Jalan Maros-Pangkep')
const pt = await main()
ok('Manajer Proyek hanya melihat proyek yang ditugaskan', !pt.includes('Jembatan Walanae'), pt.slice(0, 200))
ok('Manajer Proyek tidak punya tombol tambah proyek/perusahaan', (await pg.$('button:has-text("Tambah proyek")')) === null && (await pg.$('button:has-text("Tambah perusahaan")')) === null)
await pg.evaluate((h) => (location.hash = h), hrefB.replace(/^#/, ''))
await pg.waitForSelector('text=Proyek tidak dapat dibuka')
ok('membuka proyek lain lewat alamat ditolak oleh Rules', true)
await pg.evaluate((h) => (location.hash = h), hrefA.replace(/^#/, ''))
await pg.waitForSelector('td:has-text("Semen Portland")')
ok('Manajer Proyek dapat melihat barang proyeknya', true)

await go('users')
await pg.waitForSelector('text=Siti Gudang')
const ut = await main()
ok('daftar akun Manajer Proyek hanya yang berbagi proyek (Siti ya, Ani tidak)', ut.includes('Siti Gudang') && !ut.includes('Ani Jembatan'), ut.slice(0, 300))
await pg.click('button:has-text("Tambah akun")')
const pickable = await pg.$$eval('.modal fieldset label', (l) => l.map((x) => x.textContent.trim()))
ok('pilihan proyek saat membuat akun hanya milik pelaku', JSON.stringify(pickable) === JSON.stringify(['Jalan Maros-Pangkep']), JSON.stringify(pickable))
await pg.fill('#c-un', 'Rudi')
await pg.fill('#c-nm', 'Rudi Baru')
await pg.fill('input[autocomplete=new-password]', 'rudi-pass-1')
await pg.selectOption('#c-rl', { label: 'Admin Logistik / Gudang (20)' })
await pg.click('.modal button:has-text("Buat akun")')
await pg.waitForSelector('[role=alert]:has-text("minimal satu proyek")')
ok('Manajer Proyek wajib menugaskan minimal satu proyek', true)
await pg.check('.modal fieldset label input')
await pg.click('.modal button:has-text("Buat akun")')
await pg.waitForSelector('text=Rudi Baru')
ok('akun dibuat dengan proyek Manajer Proyek', true)

await go('resets')
await pg.waitForSelector('text=Permintaan reset password')
await pg.waitForTimeout(500)
ok('permintaan reset dari proyek lain (Ani) tidak terlihat oleh Manajer Proyek', !(await main()).includes('Ani Jembatan'))
await logout()

// ---- Siti (Admin Logistik, proyek A) mengatur saldo awal? barang Pasir sudah ada; tambah ke proyek A tidak (tak ada katalog baru)
await login('siti', 'siti-pass-1')
const sm = await menu()
ok('Admin Logistik melihat Proyek & Perusahaan tetapi bukan Katalog/Akun', sm.includes('Proyek & Perusahaan') && !sm.includes('Katalog Barang') && !sm.includes('Akun Pengguna'), JSON.stringify(sm))
await pg.evaluate((h) => (location.hash = h), hrefA.replace(/^#/, ''))
await pg.waitForSelector('td:has-text("Semen Portland")')
ok('Admin Logistik yang ditugaskan dapat menyiapkan barang proyek', (await pg.$('button:has-text("Tambah barang")')) !== null)
await pg.evaluate((h) => (location.hash = h), hrefB.replace(/^#/, ''))
await pg.waitForSelector('text=Proyek tidak dapat dibuka')
ok('Admin Logistik tidak dapat membuka proyek lain', true)
await logout()

// ---- Ani: proyek B hanya
await login('ani', 'ani-pass-1')
await go('projects')
await pg.waitForSelector('text=Jembatan Walanae')
ok('Admin Logistik proyek B hanya melihat proyek B', !(await main()).includes('Jalan Maros-Pangkep'))
await logout()

// ---- Developer: audit memuat jejak
await login('Reza4Official_', 'rahasia123')
await go('audit')
await pg.waitForSelector('table')
const au = await main()
ok('audit memuat perusahaan, proyek, katalog, barang, saldo awal', ['Tambah perusahaan', 'Tambah proyek', 'Tambah barang katalog', 'Tambah barang ke proyek', 'Atur saldo awal'].every((x) => au.includes(x)), au.slice(0, 400))
await go('resets')
await pg.waitForSelector('text=Ani Jembatan')
ok('Developer melihat permintaan reset proyek mana pun', true)

// ---- Responsif
for (const w of [360, 390, 768, 1100]) {
  await pg.setViewportSize({ width: w, height: 860 })
  for (const r of ['projects', hrefA.replace(/^#/, ''), 'catalog', 'users']) {
    await go(r)
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) ok(`tanpa scroll samping ${r} @${w}`, false)
  }
}
ok('halaman Tahap 4 tanpa scroll samping di 360-1100 px', !results.some((r) => r[0] === 'GAGAL' && r[1].startsWith('tanpa scroll')))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
console.log('konsol error:', logs.filter((l) => !/Failed to load resource|favicon|403|409|400|permission|insufficient/i.test(l)).join(' | ') || 'tidak ada')
await b.close()
