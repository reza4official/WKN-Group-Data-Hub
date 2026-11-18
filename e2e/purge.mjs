// Uji end-to-end hapus proyek, perusahaan, dan barang katalog (Firestore Rules aktif): pratinjau, konfirmasi nama,
// penghapusan bertahap untuk proyek besar, bersih-bersih akun/katalog, data lain utuh, wewenang, dan Log Audit.
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const EMU = 'http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents'
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
async function token(u, p) {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email(u), password: p, returnSecureToken: true }) })
  return (await r.json()).idToken
}
const tok = await token('Reza4Official_', 'rahasia123')
const call = async (path, body, t = tok) => {
  const res = await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, ...(await res.json().catch(() => ({}))) }
}
const exists = async (path) => (await fetch(`${EMU}/${path}`, { headers: { Authorization: 'Bearer owner' } })).status === 200
const list = async (path, col) => {
  const r = await fetch(`${EMU}/${path}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], limit: 20000 } }) })
  return (await r.json()).filter((x) => x.document).map((x) => x.document)
}
const enc = (v) => (typeof v === 'string' ? { stringValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
const OPEN = `${new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7)}-01`
const day = (b) => new Date(Date.now() + 8 * 3_600_000 - b * 86_400_000).toISOString().slice(0, 10)
let n = 0

// ---------- data uji ----------
const coA = (await call('/companies/create', { name: 'PT. Hapus A', type: 'induk' })).id
const coB = (await call('/companies/create', { name: 'PT. Tetap B', type: 'anak' })).id
async function project(co, name, items) {
  const pid = (await call('/projects/create', { companyId: co, name })).id
  const cats = []
  for (const it of items) {
    const c = (await call('/catalog/create', { name: `${it} ${name}`, unit: 'Sak' })).id
    await call('/items/add', { projectId: pid, catalogId: c, openingQty: 100, openingDate: OPEN })
    await call('/ledger/add', { projectId: pid, itemId: c, type: 'masuk', qty: 20, date: day(2), requestId: `pg-${Date.now()}-${++n}` })
    await call('/ledger/add', { projectId: pid, itemId: c, type: 'keluar', qty: 5, date: day(1), requestId: `pg-${Date.now()}-${++n}` })
    cats.push(c)
  }
  return { pid, cats }
}
const a1 = await project(coA, 'Proyek A1', ['Semen', 'Pasir'])
const a2 = await project(coA, 'Proyek A2', ['Besi'])
const b1 = await project(coB, 'Proyek B1', ['Cat'])
const big = await project(coA, 'Proyek Besar', ['Batu'])
await call('/users/create', { username: 'budi', name: 'Budi Manajer', password: 'budi-pass-1', roleId: 'pm', projectIds: [a1.pid, b1.pid] })
await call('/users/create', { username: 'dina', name: 'Dina Direktur', password: 'dina-pass-1', roleId: 'dir' })
// proyek besar: 8.000 transaksi tambahan (butuh lebih dari satu putaran penghapusan)
let writes = []
const flush = async () => {
  if (writes.length) await fetch(`${EMU}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
  writes = []
}
for (let i = 0; i < 8000; i++) {
  writes.push({ update: { name: `projects/demo-wkn/databases/(default)/documents/projects/${big.pid}/ledger/seed${i}`, fields: { itemId: enc(big.cats[0]), date: enc(day(3)), ym: enc(day(3).slice(0, 7)), type: enc('masuk'), in: enc(1), out: enc(0), seq: enc(100 + i) } } })
  if (writes.length >= 400) await flush()
}
await flush()

const b = await chromium.launch()
const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const errs = []
pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
  await pg.waitForTimeout(500)
}
const login = async (u, p) => {
  await pg.fill('#login-username', u)
  await pg.fill('input[autocomplete=current-password]', p)
  await pg.click('button[type=submit]')
  await pg.waitForSelector('.me')
}
await pg.goto('http://127.0.0.1:4173/')
await pg.waitForSelector('#login-username')
await login('Reza4Official_', 'rahasia123')
await go('projects')
await pg.waitForSelector('text=Proyek A1')

// ---- hapus satu proyek
ok('katalog: penghitung pemakaian Semen = 1 sebelum hapus', (await call('/catalog/delete', { id: a1.cats[0] })).error === 'in_use')
await pg.locator('.li', { hasText: 'Proyek A1' }).locator('button:has-text("Hapus")').click()
await pg.waitForSelector('text=/transaksi \\(beserta total/')
const dlg = await pg.textContent('.modal')
ok('pratinjau: 2 barang, 4 transaksi, 1 akun', /2 barang proyek dan 4 transaksi/.test(dlg) && /1 akun akan kehilangan penugasan/.test(dlg), dlg.slice(0, 400))
const go1 = pg.locator('.modal button:has-text("Hapus permanen")')
ok('tombol nonaktif sebelum nama diketik', await go1.isDisabled())
await pg.fill('#purge-name', 'proyek a1')
ok('nama beda huruf besar/kecil tidak cukup', await go1.isDisabled())
await pg.fill('#purge-name', 'Proyek A1')
await go1.click()
await pg.waitForSelector('text=/dihapus permanen/')
await pg.waitForSelector('.li:has-text("Proyek A1")', { state: 'detached' })
ok('proyek A1 terhapus dari daftar', true)
ok('dokumen proyek dan semua isinya terhapus (tanpa yatim)', !(await exists(`projects/${a1.pid}`)) && (await list(`projects/${a1.pid}`, 'ledger')).length === 0 && (await list(`projects/${a1.pid}`, 'items')).length === 0)
ok('proyek lain utuh (A2 dan B1 beserta transaksinya)', (await exists(`projects/${a2.pid}`)) && (await list(`projects/${a2.pid}`, 'ledger')).length === 2 && (await list(`projects/${b1.pid}`, 'ledger')).length === 2)
const cat1 = await (await fetch(`${EMU}/catalog/${a1.cats[0]}`, { headers: { Authorization: 'Bearer owner' } })).json()
ok('katalog tidak ikut terhapus; penghitung pemakaian kembali 0', cat1.fields.projectCount.integerValue === '0', JSON.stringify(cat1.fields.projectCount))
const budi = await (await fetch(`${EMU}/users`, { headers: { Authorization: 'Bearer owner' } })).json()
const bu = budi.documents.find((d) => d.fields.username?.stringValue === 'budi')
const pids = (bu.fields.projectIds.arrayValue.values ?? []).map((v) => v.stringValue)
ok('akun Budi kehilangan A1 tetapi tetap punya B1', !pids.includes(a1.pid) && pids.includes(b1.pid), JSON.stringify(pids))

// ---- hapus barang katalog yang tidak terpakai
await go('catalog')
await pg.waitForSelector('td:has-text("Semen Proyek A1")')
await pg.click('button[aria-label="Hapus Semen Proyek A1"]')
await pg.click('.modal button:has-text("Hapus permanen")')
await pg.waitForSelector('td:has-text("Semen Proyek A1")', { state: 'detached' })
ok('barang katalog tak terpakai dapat dihapus', true)
ok('barang yang dipakai proyek tidak punya tombol hapus', (await pg.$('button[aria-label="Hapus Besi Proyek A2"]')) === null)
const re = await call('/catalog/create', { name: 'Semen Proyek A1', unit: 'Kg' })
ok('nama barang yang dihapus dapat dipakai lagi', re.status === 200, JSON.stringify(re))

// ---- proyek besar: bertahap
await go('projects')
await pg.waitForSelector('text=Proyek Besar')
await pg.locator('.li', { hasText: 'Proyek Besar' }).locator('button:has-text("Hapus")').click()
await pg.waitForSelector('text=/8.00\\d transaksi/')
await pg.fill('#purge-name', 'Proyek Besar')
await pg.click('.modal button:has-text("Hapus permanen")')
await pg.waitForSelector('text=/dihapus permanen/', { timeout: 240000 })
ok('proyek besar (8.000+ transaksi) terhapus bertahap sampai tuntas', !(await exists(`projects/${big.pid}`)) && (await list(`projects/${big.pid}`, 'ledger')).length === 0)

// ---- hapus perusahaan (bertingkat)
await pg.waitForSelector('text=PT. Hapus A')
await pg.locator('section:has(h2:text-is("PT. Hapus A")) .hd button:has-text("Hapus")').click()
await pg.waitForSelector('text=/proyek akan dihapus/')
ok('pratinjau perusahaan menyebut beserta SEMUA proyeknya', (await pg.textContent('.modal')).includes('beserta SEMUA proyeknya'))
await pg.fill('#purge-name', 'PT. Hapus A')
await pg.click('.modal button:has-text("Hapus permanen")')
await pg.waitForSelector('section:has(h2:text-is("PT. Hapus A"))', { state: 'detached', timeout: 120000 })
ok('perusahaan terhapus dengan proyek sisanya (A2)', !(await exists(`companies/${coA}`)) && !(await exists(`projects/${a2.pid}`)) && (await list(`projects/${a2.pid}`, 'ledger')).length === 0)
ok('perusahaan lain utuh (B beserta proyek dan transaksinya)', (await exists(`companies/${coB}`)) && (await exists(`projects/${b1.pid}`)) && (await list(`projects/${b1.pid}`, 'ledger')).length === 2)

// ---- dashboard dan audit
await go('dashboard')
await pg.waitForSelector('text=/Cat Proyek B1/')
const dash = await pg.textContent('main')
ok('dashboard hanya memuat data yang tersisa', dash.includes('Cat Proyek B1') && !dash.includes('Semen Proyek A1') && !dash.includes('Besi Proyek A2'))
await go('audit')
await pg.waitForSelector('table')
const aud = await pg.textContent('main')
ok('Log Audit mencatat penghapusan permanen proyek dan perusahaan', aud.includes('Hapus proyek (permanen)') && aud.includes('Hapus perusahaan (permanen)') && aud.includes('Hapus barang katalog'))

// ---- wewenang
await pg.click('button[aria-label=Keluar]')
await pg.waitForSelector('#login-username')
await login('dina', 'dina-pass-1')
await go('projects')
await pg.waitForSelector('text=Proyek B1')
ok('Direktur (level 80) tidak melihat tombol Hapus', (await pg.$('button:has-text("Hapus")')) === null)
const dt = await token('dina', 'dina-pass-1')
const denied = await call('/projects/delete', { id: b1.pid, confirmName: 'Proyek B1' }, dt)
ok('Direktur menembak API langsung: ditolak 403 dan data utuh', denied.status === 403 && (await exists(`projects/${b1.pid}`)))
const bt = await token('budi', 'budi-pass-1')
ok('Manajer Proyek menembak API: ditolak 403', (await call('/companies/delete', { id: coB, confirmName: 'PT. Tetap B' }, bt)).status === 403)
ok('tanpa konfirmasi nama: ditolak 400 oleh server', (await call('/projects/delete', { id: b1.pid }, tok)).status === 400 && (await exists(`projects/${b1.pid}`)))

for (const [s, nm, e] of results) console.log(s, nm, e ? '-> ' + e : '')
console.log('konsol error:', errs.filter((l) => !/Failed to load resource|favicon|403|400|409/.test(l)).join(' | ') || 'tidak ada')
await b.close()
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
