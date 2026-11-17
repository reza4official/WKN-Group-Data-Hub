import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
const pg = await ctx.newPage()
const logs = []
pg.on('pageerror', (e) => logs.push('PAGEERR ' + e.message))
await pg.goto('http://127.0.0.1:4173/')
await pg.waitForSelector('#login-username')

async function googleAs(email) {
  const [popup] = await Promise.all([pg.waitForEvent('popup', { timeout: 15000 }), pg.click('button:has-text("Masuk dengan Google")')])
  await popup.waitForLoadState('domcontentloaded')
  await popup.waitForTimeout(800)
  // Halaman IdP palsu milik Auth emulator: tambah akun baru lalu pilih
  await popup.click('#add-account-button')
  await popup.fill('#email-input', email)
  await popup.click('#sign-in')
}

// 1) email terdaftar
await googleAs('reza4official@gmail.com')
await pg.waitForSelector('.me', { timeout: 15000 })
console.log('OK   Google email terdaftar -> masuk sebagai:', (await pg.textContent('.me')).replace(/\s+/g, ' '))
await pg.reload()
await pg.waitForSelector('.me', { timeout: 8000 })
console.log('OK   sesi hasil login Google bertahan setelah reload')
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')

// 2) email tidak terdaftar
await googleAs('orang.asing@gmail.com')
await pg.waitForSelector('[role=alert]', { timeout: 15000 })
const msg = await pg.textContent('[role=alert]')
console.log(msg.includes('belum terdaftar') ? 'OK  ' : 'GAGAL', 'Google email asing ditolak:', msg)
console.log('masih di halaman login:', await pg.isVisible('#login-username'))
console.log('error halaman:', logs.join(' | ') || 'tidak ada')
await b.close()
