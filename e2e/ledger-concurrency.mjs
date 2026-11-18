// Uji konkurensi buku stok terhadap Firestore emulator ASLI (bukan backend palsu).
// Prasyarat: emulator Auth+Firestore (demo-wkn), Worker dev di :8787, akun Developer
// (username Reza4Official_, password rahasia123) dari scripts/bootstrap-developer.mjs --emulator.
import { createHash } from 'node:crypto'

const WORKER = 'http://127.0.0.1:8787'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake'
const norm = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const email = (u) => `${createHash('sha256').update(norm(u)).digest('hex')}@users.wkngroup.invalid`
const results = []
const ok = (n, c, x = '') => results.push([c ? 'OK   ' : 'GAGAL', n, c ? '' : x])

const r = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email('Reza4Official_'), password: 'rahasia123', returnSecureToken: true }) })
const { idToken } = await r.json()
const call = async (path, body) => {
  const res = await fetch(WORKER + path, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const sfx = Math.random().toString(36).slice(2, 8)
const co = await call('/companies/create', { name: `PT Konkurensi ${sfx}`, type: 'induk' })
const pr = await call('/projects/create', { companyId: co.body.id, name: `Proyek ${sfx}` })
const cat = await call('/catalog/create', { name: `Semen ${sfx}`, unit: 'Sak' })
const pid = pr.body.id
const iid = cat.body.id
ok('persiapan data', !!(pid && iid), JSON.stringify([co, pr, cat]))
const add = await call('/items/add', { projectId: pid, catalogId: iid, openingQty: 100, openingDate: '2026-01-01' })
ok('barang + saldo awal 100', add.status === 200, JSON.stringify(add))

const rid = () => `r-${Math.random().toString(36).slice(2)}-${Date.now()}`
const tx = (type, qty, date = '2026-02-01') => call('/ledger/add', { projectId: pid, itemId: iid, type, qty, date, requestId: rid() })

// 1) 8 keluar @30 bersamaan; hanya 3 boleh lolos (100 -> 10)
const res = await Promise.all(Array.from({ length: 8 }, () => tx('keluar', 30)))
const good = res.filter((x) => x.status === 200).length
const insuf = res.filter((x) => x.status === 409 && x.body.error === 'insufficient').length
const busy = res.filter((x) => x.status === 409 && x.body.error === 'busy').length
console.log('status:', res.map((x) => x.status + (x.body.error ? ':' + x.body.error : '')).join(' '))
ok('maksimal 3 keluar @30 lolos dari stok 100 (tidak pernah negatif)', good <= 3, String(good))
ok('semua yang gagal ditolak benar (stok kurang / sibuk), tidak ada 500', good + insuf + busy === 8, JSON.stringify(res.map((x) => x.status)))

// 2) retry sampai tuntas: ulangi yang sibuk secara berurutan, lalu tuntaskan
for (let i = 0; i < 6; i++) {
  const x = await tx('keluar', 30)
  if (x.status === 200) continue
  if (x.body.error !== 'insufficient') ok('urutan tuntas tanpa galat tak terduga', false, JSON.stringify(x))
}

// 3) kebenaran akhir dibaca langsung dari Firestore emulator (tanpa Worker)
const FS = 'http://127.0.0.1:8080/v1/projects/demo-wkn/databases/(default)/documents'
const H = { Authorization: 'Bearer owner' }
const doc = async (p) => (await fetch(`${FS}/${p}`, { headers: H })).json()
const num = (f) => Number(f?.integerValue ?? f?.doubleValue ?? 0)
const item = await doc(`projects/${pid}/items/${iid}`)
const stock = num(item.fields.currentStock)
const tc = num(item.fields.txCount)
const q = await fetch(`${FS}/projects/${pid}:runQuery`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }] } }) })
const rows = (await q.json()).filter((x) => x.document).map((x) => x.document.fields)
const net = rows.reduce((s, f) => s + num(f.in) - num(f.out), 100)
ok('stok akhir tidak negatif', stock >= 0, String(stock))
ok('stok = saldo awal + total buku transaksi', stock === net, `${stock} vs ${net}`)
ok('txCount = jumlah baris buku', tc === rows.length, `${tc} vs ${rows.length}`)
ok('nomor urut (seq) unik', new Set(rows.map((f) => num(f.seq))).size === rows.length)
const m = await doc(`projects/${pid}/items/${iid}/months/2026-02`)
ok('total bulan cocok dengan buku', num(m.fields.out) === rows.reduce((s, f) => s + num(f.out), 0) && num(m.fields.count) === rows.length)
console.log('stok akhir', stock, '| transaksi', rows.length)

// 4) satu ID permintaan dikirim 6 kali bersamaan -> tercatat sekali
const same = rid()
const dup = await Promise.all(Array.from({ length: 6 }, () => call('/ledger/add', { projectId: pid, itemId: iid, type: 'masuk', qty: 7, date: '2026-02-02', requestId: same })))
const okc = dup.filter((x) => x.status === 200)
ok('ID permintaan sama bersamaan: tercatat tepat sekali', dup.filter((x) => x.status === 200 && !x.body.duplicate).length === 1, JSON.stringify(dup.map((x) => x.status + (x.body.error ?? ''))))
const item2 = await doc(`projects/${pid}/items/${iid}`)
ok('stok naik tepat 7', num(item2.fields.currentStock) === stock + 7, `${num(item2.fields.currentStock)} vs ${stock + 7}`)

// 5) dua koreksi bersamaan atas transaksi yang sama
const lone = await call('/ledger/add', { projectId: pid, itemId: iid, type: 'masuk', qty: 3, date: '2026-02-03', requestId: rid() })
const ks = await Promise.all([1, 2, 3].map(() => call('/ledger/correct', { projectId: pid, entryId: lone.body.id, reason: 'uji koreksi' })))
ok('koreksi bersamaan: tepat satu berhasil', ks.filter((x) => x.status === 200).length === 1, JSON.stringify(ks.map((x) => x.status + (x.body.error ?? ''))))
const item3 = await doc(`projects/${pid}/items/${iid}`)
ok('stok kembali setelah satu koreksi', num(item3.fields.currentStock) === stock + 7, String(num(item3.fields.currentStock)))

for (const [s, n, e] of results) console.log(s, n, e ? '-> ' + e : '')
process.exit(results.some((x) => x[0] === 'GAGAL') ? 1 : 0)
