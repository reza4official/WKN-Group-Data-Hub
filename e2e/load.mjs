// Uji beban pada skala yang DIASUMSIKAN (belum pernah disepakati dengan pemilik; lihat docs/TAHAP-9-PENERAPAN.md):
//   5 proyek x 30 barang x 12 bulan x 15 transaksi/bulan/barang = 27.000 transaksi (+ total harian dan bulanan).
// Mengukur: dokumen dibaca dan waktu muat per halaman (penghitung window.__wknReads, hanya mode emulator), dan invarian
// buku stok di bawah ratusan permintaan bersamaan. Prasyarat: emulator, build emulator di :4173, Worker dev :8787, akun Developer.
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const P = 5, N = 30, MONTHS = 12, TX = 15
const EMU = 'http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents'
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])
const info = []

const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const r0 = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })
const { idToken } = await r0.json()
const call = async (path, body) => {
  const t0 = performance.now()
  const res = await fetch('http://127.0.0.1:8787' + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => ({})), ms: performance.now() - t0 }
}
const enc = (v) => (v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && v.__ts ? { timestampValue: v.__ts } : enc(v)]))
const name = (path) => `projects/demo-wkn/databases/(default)/documents/${path}`
async function commit(writes) {
  const res = await fetch(`${EMU}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
  if (!res.ok) throw new Error('commit seed gagal ' + res.status + ' ' + (await res.text()).slice(0, 200))
}

// ---------- seeding ----------
const t0 = performance.now()
const wita = new Date(Date.now() + 8 * 3_600_000)
const todayStr = wita.toISOString().slice(0, 10)
const curYm = todayStr.slice(0, 7)
const monthsList = Array.from({ length: MONTHS + 1 }, (_, k) => new Date(Date.UTC(wita.getUTCFullYear(), wita.getUTCMonth() - MONTHS + k, 1)).toISOString().slice(0, 7))
const OPEN = `${monthsList[0]}-01`
const co = await call('/companies/create', { name: 'PT. Uji Beban', type: 'induk' })
const projects = []
for (let i = 1; i <= P; i++) projects.push((await call('/projects/create', { companyId: co.body.id, name: `Proyek Beban ${i}` })).body.id)
const cats = []
for (let i = 1; i <= N; i++) cats.push((await call('/catalog/create', { name: `Barang Beban ${String(i).padStart(2, '0')}`, unit: 'Sak', minStock: 200 })).body.id)
for (const p of projects) await Promise.all(cats.map((c) => call('/items/add', { projectId: p, catalogId: c, openingQty: 5000, openingDate: OPEN })))
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
let writes = []
let docs = 0
const flush = async () => {
  if (writes.length) await commit(writes)
  writes = []
}
const push = async (w) => {
  writes.push(w)
  docs++
  if (writes.length >= 400) await flush()
}
let ledgerCount = 0
for (const p of projects) {
  for (const c of cats) {
    let stock = 5000
    let seq = 0
    let last = ''
    const days = new Map()
    const months = new Map()
    for (const ym of monthsList) {
      const maxDay = ym === curYm ? Math.max(1, Number(todayStr.slice(8, 10))) : 28
      for (let k = 0; k < TX; k++) {
        const date = `${ym}-${String(1 + Math.floor(rnd() * maxDay)).padStart(2, '0')}`
        const masuk = k % 3 === 0
        const q = masuk ? 20 + Math.floor(rnd() * 40) : 1 + Math.floor(rnd() * 25)
        seq++
        stock += masuk ? q : -q
        if (date > last) last = date
        const d = days.get(date) ?? { date, in: 0, out: 0 }
        d[masuk ? 'in' : 'out'] += q
        days.set(date, d)
        const m = months.get(ym) ?? { ym, in: 0, out: 0, corrIn: 0, corrOut: 0, count: 0, corrCount: 0 }
        m[masuk ? 'in' : 'out'] += q
        m.count++
        months.set(ym, m)
        await push({ update: { name: name(`projects/${p}/ledger/s-${c}-${seq}`), fields: fields({ itemId: c, date, ym, type: masuk ? 'masuk' : 'keluar', in: masuk ? q : 0, out: masuk ? 0 : q, seq, note: 'data uji beban', createdBy: 'seed', createdByName: 'Seed', createdByRole: 'Seed', createdAt: { __ts: `${date}T02:00:00Z` } }) }, currentDocument: { exists: false } })
        ledgerCount++
      }
    }
    for (const d of days.values()) await push({ update: { name: name(`projects/${p}/items/${c}/days/${d.date}`), fields: fields(d) } })
    for (const m of months.values()) await push({ update: { name: name(`projects/${p}/items/${c}/months/${m.ym}`), fields: fields(m) } })
    await push({ update: { name: name(`projects/${p}/items/${c}`), fields: fields({ currentStock: stock, txCount: seq, lastTxDate: last }) }, updateMask: { fieldPaths: ['currentStock', 'txCount', 'lastTxDate'] }, currentDocument: { exists: true } })
  }
}
await flush()
info.push(`seed: ${ledgerCount.toLocaleString('id-ID')} transaksi, ${docs.toLocaleString('id-ID')} dokumen ditulis dalam ${((performance.now() - t0) / 1000).toFixed(0)} dtk`)

// ---------- pengukuran di browser ----------
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const pg = await ctx.newPage()
const go = async (h) => {
  await pg.evaluate((x) => (location.hash = x), h)
}
await pg.goto('http://127.0.0.1:4173/')
await pg.waitForSelector('#login-username')
await pg.fill('#login-username', 'Reza4Official_')
await pg.fill('input[autocomplete=current-password]', 'rahasia123')
await pg.click('button[type=submit]')
await pg.waitForSelector('.me')
const measure = async (label, action, ready) => {
  await pg.evaluate(() => (window.__wknReads = 0))
  const t = performance.now()
  await action()
  await ready()
  const ms = Math.round(performance.now() - t)
  const reads = await pg.evaluate(() => window.__wknReads)
  info.push(`${label}: ${reads.toLocaleString('id-ID')} dokumen dibaca, ${ms} ms`)
  return { reads, ms }
}
const dashAll = await measure('Dashboard, semua 5 proyek', () => go('dashboard'), () => pg.waitForSelector('button.linkbtn'))
const dashOne = await measure('Dashboard, satu proyek (30 barang)', async () => { await pg.selectOption('#dash-scope', { index: 1 }) }, async () => { await pg.waitForTimeout(250); await pg.waitForSelector('button.linkbtn', { timeout: 60000 }) })
const inv = await measure('Transaksi Stok, satu proyek, bulan berjalan, semua barang', () => go('inventory'), async () => { await pg.waitForSelector('#inv-project'); await pg.waitForSelector('main tbody tr', { timeout: 60000 }) })
const exp = await measure('Ekspor Excel (transaksi + ringkasan), satu proyek', async () => { await go('io'); await pg.waitForSelector('#io-project') }, async () => { const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('button:has-text("Excel (.xlsx)")')]); await d.path() })
ok('Dashboard satu proyek: bacaan = katalog + barang + <= 2 total bulanan per barang (<= C + 3N)', dashOne.reads <= N + N + 2 * N + 5, String(dashOne.reads))
ok('Dashboard semua proyek: bacaan <= C + P x 3N', dashAll.reads <= N + P * 3 * N + 5, String(dashAll.reads))
ok('Transaksi Stok membaca hanya transaksi bulan itu + total bulan (jauh di bawah 27.000 riwayat)', inv.reads < 1500, String(inv.reads))
ok('halaman dimuat < 15 detik pada skala ini', Math.max(dashAll.ms, dashOne.ms, inv.ms) < 15000, JSON.stringify([dashAll.ms, dashOne.ms, inv.ms]))
await b.close()

// ---------- konkurensi ----------
// Profil A (puncak realistis): 60 pencatatan dalam detik yang sama, tersebar di 30 barang (2 per barang).
// Profil B (uji tekanan, ekstrem): 300 permintaan bersamaan pada 6 barang (50 per barang); hanya invarian yang dituntut.
const proj = projects[0]
let n = 0
async function burst(label, items, count) {
  const reqs = []
  for (let k = 0; k < count; k++) {
    const itemId = items[k % items.length]
    const masuk = k % 5 < 2
    reqs.push(call('/ledger/add', { projectId: proj, itemId, type: masuk ? 'masuk' : 'keluar', qty: masuk ? 5 : 1, date: todayStr, requestId: `load-${Date.now()}-${++n}`, note: 'beban' }))
  }
  const t = performance.now()
  const res = await Promise.all(reqs)
  const total = performance.now() - t
  const ms = res.map((r) => r.ms).sort((a, b) => a - b)
  const pct = (q) => Math.round(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))])
  const good = res.filter((r) => r.status === 200).length
  const busy = res.filter((r) => r.status === 409 && r.body.error === 'busy').length
  info.push(`konkurensi ${label}: ${count} permintaan bersamaan pada ${items.length} barang: ${good} berhasil, ${busy} "busy" (dapat diulang), ${res.length - good - busy} lainnya; total ${(total / 1000).toFixed(1)} dtk; p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms`)
  ok(`${label}: tidak ada galat server (5xx)`, res.every((r) => r.status < 500), JSON.stringify([...new Set(res.map((r) => r.status))]))
  ok(`${label}: setiap permintaan berakhir berhasil atau "busy" yang jelas`, good + busy === count, `${good}/${busy}`)
  return { good, busy }
}
const A = await burst('A (puncak realistis)', cats, 60)
ok('profil A: >= 90% berhasil pada puncak yang realistis', A.good >= 54, `${A.good}/60`)
await burst('B (titik panas)', cats.slice(0, 6), 300)
const items = cats

const doc = async (path) => (await fetch(`${EMU}/${path}`, { headers: { Authorization: 'Bearer owner' } })).json()
const num = (f) => Number(f?.integerValue ?? f?.doubleValue ?? 0)
let bad = []
for (const itemId of items) {
  const item = await doc(`projects/${proj}/items/${itemId}`)
  const q = await fetch(`${EMU}/projects/${proj}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { fieldFilter: { field: { fieldPath: 'itemId' }, op: 'EQUAL', value: { stringValue: itemId } } } } }) })
  const rows = (await q.json()).filter((x) => x.document).map((x) => x.document.fields)
  const net = rows.reduce((s, f) => s + num(f.in) - num(f.out), 5000)
  const seqs = rows.map((f) => num(f.seq))
  if (num(item.fields.currentStock) !== net) bad.push(`${itemId}: stok ${num(item.fields.currentStock)} != buku ${net}`)
  if (num(item.fields.txCount) !== rows.length) bad.push(`${itemId}: txCount ${num(item.fields.txCount)} != ${rows.length}`)
  if (new Set(seqs).size !== seqs.length) bad.push(`${itemId}: nomor urut ganda`)
  if (num(item.fields.currentStock) < 0) bad.push(`${itemId}: stok negatif`)
  const month = await doc(`projects/${proj}/items/${itemId}/months/${curYm}`)
  const inM = rows.filter((f) => f.ym.stringValue === curYm)
  if (num(month.fields.in) !== inM.reduce((s, f) => s + num(f.in), 0) || num(month.fields.out) !== inM.reduce((s, f) => s + num(f.out), 0) || num(month.fields.count) !== inM.length) bad.push(`${itemId}: total bulan tidak cocok`)
}
ok('invarian setelah 300 permintaan bersamaan: stok = saldo awal + buku, txCount = jumlah baris, urutan unik, total bulan cocok', bad.length === 0, bad.join(' | '))

console.log('--- PENGUKURAN (asumsi skala: 5 proyek x 30 barang x 12 bulan x 15 transaksi/bulan) ---')
for (const i of info) console.log('INFO', i)
for (const [s, nm, e] of results) console.log(s, nm, e ? '-> ' + e : '')
process.exit(results.some((r) => r[0] === 'GAGAL') ? 1 : 0)
