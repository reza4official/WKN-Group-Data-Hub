// Sapuan aksesibilitas dan responsif: axe-core (WCAG 2.0/2.1 A dan AA) pada semua halaman dan keadaan (modal, laci,
// pratinjau impor), tema terang dan gelap, lebar 360 dan 1440 px; tanpa scroll samping di 360-1440; fokus keyboard terlihat.
// Prasyarat: emulator Auth+Firestore, Worker dev :8787, build emulator disajikan di :4173, akun Developer.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const AXE = readFileSync(process.env.AXE_PATH ?? createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const BASE = 'http://127.0.0.1:4173/'
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])

// ---------- data uji ----------
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const r0 = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })
const { idToken } = await r0.json()
const call = async (path, body) => (await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const wita = new Date(Date.now() + 8 * 3_600_000)
const OPEN = `${new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - 2, 1)).toISOString().slice(0, 7)}-01`
const day = (back) => new Date(Date.now() + 8 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10)
const co = await call('/companies/create', { name: 'PT. Uji Aksesibilitas', type: 'induk' })
const pr = await call('/projects/create', { companyId: co.id, name: 'Proyek Aksesibilitas', location: 'Maros' })
const items = []
for (const [name, unit, min] of [['Semen Portland', 'Sak', 50], ['Pasir Beton', 'm3', 10], ['Besi Beton', 'Batang', 5]]) {
  const c = await call('/catalog/create', { name, unit, minStock: min })
  await call('/items/add', { projectId: pr.id, catalogId: c.id, openingQty: 100, openingDate: OPEN })
  items.push(c.id)
}
let n = 0
for (const [i, type, q, d] of [[0, 'keluar', 60, 3], [0, 'masuk', 20, 2], [1, 'keluar', 95, 1], [0, 'keluar', 5, 0]]) {
  await call('/ledger/add', { projectId: pr.id, itemId: items[i], type, qty: q, date: day(d), requestId: `a11y-${Date.now()}-${++n}`, note: 'uji aksesibilitas' })
}
const role = (await (await fetch('http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents/roles', { headers: { Authorization: 'Bearer owner' } })).json()).documents ?? []
const roleId = (nm) => role.find((x) => x.fields.name.stringValue.startsWith(nm))?.name.split('/').pop()
await call('/users/create', { username: 'budi', name: 'Budi Manajer', password: 'budi-pass-1', roleId: roleId('Manajer'), projectIds: [pr.id], phone: '0812', emailContact: 'budi@contoh.com' })

// ---------- penjelajahan ----------
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const pg = await ctx.newPage()
await pg.route('https://challenges.cloudflare.com/**', (r) =>
  r.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:function(el,o){el.setAttribute('data-ts','1');setTimeout(function(){o.callback('XXXX.DUMMY.TOKEN')},40);return 'w1'},remove:function(){}}" }),
)
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(700)
}
const setTheme = (t) => pg.evaluate((x) => document.documentElement.setAttribute('data-theme', x), t)

async function axeRun(label) {
  const res = await pg.evaluate(async (src) => {
    if (!window.axe) (0, eval)(src)
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((x) => `${x.target.join(' ')} :: ${(x.any[0]?.message ?? x.failureSummary ?? '').split('\n')[0].slice(0, 140)}`) }))
  }, AXE)
  return res.map((v) => ({ ...v, label }))
}

const all = []
// halaman keluar (login)
await pg.goto(BASE)
await pg.waitForSelector('#login-username')
// Transisi warna saat ganti tema membuat axe membaca warna antara; matikan agar pengukuran stabil.
await pg.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important }' })
for (const theme of ['light', 'dark'])
  for (const w of [360, 1440]) {
    await pg.setViewportSize({ width: w, height: 900 })
    await setTheme(theme)
    all.push(...(await axeRun(`login ${theme} ${w}`)))
  }
await pg.click('button:has-text("Lupa password")')
await pg.waitForSelector('[data-ts="1"]')
for (const theme of ['light', 'dark']) {
  await setTheme(theme)
  all.push(...(await axeRun(`login-lupa ${theme} 1440`)))
}
await pg.keyboard.press('Escape')
await setTheme('light')

await pg.fill('#login-username', 'Reza4Official_')
await pg.fill('input[autocomplete=current-password]', 'rahasia123')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')

const states = [
  ['dashboard', async () => go('dashboard')],
  ['dashboard-rincian', async () => { await go('dashboard'); await pg.click('button.linkbtn:text-is("Semen Portland")'); await pg.waitForSelector('svg[aria-label*="Sisa stok"]') }],
  ['inventory', async () => go('inventory')],
  ['inventory-catat', async () => { await go('inventory'); await pg.click('button:has-text("Catat transaksi")'); await pg.waitForSelector('.modal') }],
  ['io', async () => go('io')],
  ['io-pratinjau', async () => { await go('io'); await pg.selectOption('#io-kind', 'catalog'); const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("Unduh template Excel")')]); await d.saveAs('/tmp/e2e-run/a11y-cat.xlsx'); await pg.setInputFiles('#io-file', '/tmp/e2e-run/a11y-cat.xlsx'); await pg.waitForTimeout(800) }],
  ['catalog', async () => go('catalog')],
  ['projects', async () => go('projects')],
  ['project-detail', async () => go(`projects/${pr.id}`)],
  ['users', async () => go('users')],
  ['users-tambah', async () => { await go('users'); await pg.click('button:has-text("Tambah akun")'); await pg.waitForSelector('.modal') }],
  ['roles', async () => go('roles')],
  ['resets', async () => go('resets')],
  ['employees', async () => go('employees')],
  ['audit', async () => go('audit')],
  ['profil', async () => go('profil')],
]
const overflow = []
for (const [name, setup] of states) {
  for (const w of [360, 1440]) {
    await pg.setViewportSize({ width: w, height: 900 })
    await setup()
    for (const theme of ['light', 'dark']) {
      await setTheme(theme)
      all.push(...(await axeRun(`${name} ${theme} ${w}`)))
    }
    await setTheme('light')
    await pg.keyboard.press('Escape')
    await pg.waitForTimeout(150)
  }
}
// tanpa scroll samping untuk setiap halaman di lima lebar
for (const [name, setup] of states.filter(([n]) => !/tambah|catat|rincian|pratinjau/.test(n))) {
  for (const w of [360, 390, 768, 1100, 1440]) {
    await pg.setViewportSize({ width: w, height: 900 })
    await setup()
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) overflow.push(`${name}@${w}`)
  }
}
ok('tanpa scroll samping di 360, 390, 768, 1100, 1440 px pada semua halaman', overflow.length === 0, overflow.join(', '))

// fokus keyboard terlihat
const noRing = []
await pg.setViewportSize({ width: 1440, height: 900 })
for (const page of ['dashboard', 'io', 'users', 'profil', 'inventory']) {
  await go(page)
  await pg.evaluate(() => document.activeElement?.blur())
  for (let i = 0; i < 40; i++) {
    await pg.keyboard.press('Tab')
    const info = await pg.evaluate(() => {
      const e = document.activeElement
      if (!e || e === document.body) return null
      const cs = getComputedStyle(e)
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
      const r = e.getBoundingClientRect()
      return { ring, vis: r.width > 0 && r.height > 0, tag: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : ''} "${(e.textContent || '').trim().slice(0, 24)}"` }
    })
    if (info && info.vis && !info.ring) noRing.push(`${page}: ${info.tag}`)
  }
}
ok('setiap elemen yang menerima fokus keyboard menampilkan indikator fokus', noRing.length === 0, [...new Set(noRing)].join(' | '))

// ringkasan axe
const groups = new Map()
for (const v of all) {
  const g = groups.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, nodes: 0, where: new Set(), sample: v.sample[0] }
  g.nodes += v.nodes
  g.where.add(v.label)
  groups.set(v.id, g)
}
for (const g of groups.values()) console.log(`AXE ${g.impact?.toUpperCase()} ${g.id}: ${g.help} — ${g.nodes} simpul di ${g.where.size} keadaan; mis. ${[...g.where].slice(0, 3).join(', ')}\n    ${g.sample}`)
ok(`axe-core: tanpa pelanggaran WCAG A/AA pada ${states.length + 2} keadaan x 2 tema x 2 lebar`, groups.size === 0, `${groups.size} jenis pelanggaran`)

for (const [s, nm, e] of results) console.log(s, nm, e ? '-> ' + e : '')
await b.close()
process.exit(results.some((x) => x[0] === 'GAGAL') ? 1 : 0)
