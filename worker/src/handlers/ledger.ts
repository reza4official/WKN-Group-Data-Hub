import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { batchGetDocuments, commit, CommitError, getDocument, queryDocuments, type Doc, type Write } from '../lib/firestore'
import { HttpError, isoDate, oneOf, optStr, positiveQuantity, str, todayWita, type Body } from '../lib/http'
import { fromMilli, toMilli } from '../lib/qty'
import { assertProjectAccess } from '../lib/scope'
import type { ServiceAccount } from '../lib/serviceAccount'

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

const MAX_RETRIES = 5
const MAX_DAYS = 1500
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/

/** Dilempar saat penulisan bertabrakan dengan penulis lain; seluruh percobaan dibaca ulang dan divalidasi ulang. */
class Retry extends Error {}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Retry)) throw e
      // Jeda acak yang membesar agar penulis yang bertabrakan tidak mengulang serempak (lihat uji beban).
      if (i < MAX_RETRIES - 1) await sleep(10 * 2 ** i + Math.random() * 40)
    }
  }
  throw new HttpError(409, 'busy', 'Barang ini sedang dicatat oleh pengguna lain. Coba lagi sebentar lagi.')
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
const itemPath = (pid: string, iid: string) => `projects/${pid}/items/${iid}`
const pre = (d: Doc | null): { updateTime: string } | { exists: boolean } => (d ? (d.updateTime ? { updateTime: d.updateTime } : { exists: true }) : { exists: false })

/**
 * Saldo terendah (dalam milli) dari akhir hari D sampai hari ini, SEBELUM perubahan baru.
 * Saldo hanya berubah pada hari yang punya dokumen harian, sehingga cukup memeriksa akhir hari tiap dokumen.
 * Dalam satu hari, barang masuk dihitung lebih dulu daripada barang keluar (aturan yang sama dengan kolom
 * "Tersisa"), jadi saldo akhir hari yang tidak negatif berarti tidak ada baris yang tampak negatif.
 */
export function lowestBalanceFrom(currentStockMilli: number, days: { date: string; net: number }[], from: string): number {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const totalNet = sorted.reduce((s, d) => s + d.net, 0)
  let running = currentStockMilli - totalNet // saldo akhir hari sebelum `from`
  for (const d of sorted) if (d.date <= from) running += d.net
  let min = running // akhir hari `from`
  for (const d of sorted) {
    if (d.date <= from) continue
    running += d.net
    if (running < min) min = running
  }
  return min
}

async function suffixDays(c: Ctx, pid: string, iid: string, from: string): Promise<{ date: string; net: number }[]> {
  const docs = await queryDocuments(c.env, c.sa, 'days', [{ field: 'date', op: 'GREATER_THAN_OR_EQUAL', value: from }], MAX_DAYS + 1, itemPath(pid, iid))
  if (docs.length > MAX_DAYS) throw new HttpError(400, 'bad_request', 'Rentang tanggal terlalu panjang untuk diperiksa. Gunakan tanggal yang lebih baru.')
  return docs.map((d) => ({ date: String(d.data.date), net: toMilli(num(d.data.in)) - toMilli(num(d.data.out)) }))
}

interface Applied {
  id: string
  currentStock: number
  duplicate?: boolean
}

/** Menyusun penulisan atomik: entri ledger + stok barang + total harian + total bulanan + audit. */
function buildWrites(p: {
  c: Ctx
  pid: string
  iid: string
  entryId: string
  entry: Record<string, unknown>
  inM: number
  outM: number
  item: Doc
  day: Doc | null
  month: Doc | null
  correction: boolean
  label: string
  action: string
  detail: Record<string, unknown>
}): Write[] {
  const { c, pid, iid, entry, inM, outM, item, day, month, correction } = p
  const date = String(entry.date)
  const ym = date.slice(0, 7)
  const newStock = toMilli(num(item.data.currentStock)) + inM - outM
  const dIn = toMilli(num(day?.data.in)) + inM
  const dOut = toMilli(num(day?.data.out)) + outM
  const m = month?.data ?? {}
  const prevLast = typeof item.data.lastTxDate === 'string' ? item.data.lastTxDate : ''
  const lastTx = correction ? null : date > prevLast ? date : null
  return [
    { path: `projects/${pid}/ledger/${p.entryId}`, data: entry, precondition: { exists: false }, serverTime: ['createdAt'] },
    // Setiap perubahan stok melewati dokumen barang dengan prasyarat updateTime: penulis bersamaan saling bertabrakan.
    {
      path: itemPath(pid, iid),
      // lastTxDate = tanggal pergerakan terakhir (masuk/keluar, bukan koreksi); dipakai dashboard untuk "tidak bergerak".
      data: { currentStock: fromMilli(newStock), txCount: num(item.data.txCount) + 1, ...(lastTx ? { lastTxDate: lastTx } : {}) },
      mask: ['currentStock', 'txCount', ...(lastTx ? ['lastTxDate'] : [])],
      precondition: pre(item),
    },
    { path: `${itemPath(pid, iid)}/days/${date}`, data: { date, in: fromMilli(dIn), out: fromMilli(dOut) }, precondition: pre(day) },
    {
      path: `${itemPath(pid, iid)}/months/${ym}`,
      data: {
        ym,
        // Koreksi disimpan terpisah agar persentase pemakaian tidak menghitung ganda entri dan pembaliknya.
        in: fromMilli(toMilli(num(m.in)) + (correction ? 0 : inM)),
        out: fromMilli(toMilli(num(m.out)) + (correction ? 0 : outM)),
        corrIn: fromMilli(toMilli(num(m.corrIn)) + (correction ? inM : 0)),
        corrOut: fromMilli(toMilli(num(m.corrOut)) + (correction ? outM : 0)),
        count: num(m.count) + (correction ? 0 : 1),
        corrCount: num(m.corrCount) + (correction ? 1 : 0),
      },
      precondition: pre(month),
    },
    auditWrite(c.actor, p.action, { type: 'ledger', id: p.entryId, label: p.label }, p.detail),
  ]
}

async function load(c: Ctx, pid: string, iid: string) {
  const [project, item, cat] = await Promise.all([
    getDocument(c.env, c.sa, `projects/${pid}`),
    getDocument(c.env, c.sa, itemPath(pid, iid)),
    getDocument(c.env, c.sa, `catalog/${iid}`),
  ])
  if (!project) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
  if (!item) throw new HttpError(404, 'not_found', 'Barang tidak ada di proyek ini.')
  return { project, item, cat }
}

// ---------- Catat barang masuk / keluar ----------

export async function addEntry(c: Ctx, body: Body): Promise<Applied> {
  requirePerm(c.actor, 'inventory.write')
  const pid = str(body, 'projectId', { label: 'Proyek' })
  assertProjectAccess(c.actor, pid)
  const iid = str(body, 'itemId', { label: 'Barang' })
  const type = oneOf(body, 'type', ['masuk', 'keluar'] as const, 'Jenis')
  const qty = positiveQuantity(body, 'qty', 'Jumlah')
  const date = isoDate(body, 'date', 'Tanggal')
  if (!date) throw new HttpError(400, 'bad_request', 'Tanggal wajib diisi.')
  const note = optStr(body, 'note', 200, 'Keterangan') ?? ''
  const requestId = str(body, 'requestId', { max: 64, label: 'ID permintaan' })
  if (!REQUEST_ID.test(requestId)) throw new HttpError(400, 'bad_request', 'ID permintaan tidak valid.')
  if (date > todayWita()) throw new HttpError(400, 'bad_request', 'Tanggal tidak boleh di masa depan.')

  return withRetry(async () => {
    const { project, item, cat } = await load(c, pid, iid)
    if (project.data.active === false) throw new HttpError(409, 'inactive', 'Proyek sudah nonaktif.')
    if (item.data.active === false) throw new HttpError(409, 'inactive', 'Barang ini nonaktif di proyek.')
    const openingDate = item.data.openingDate
    if (item.data.openingQty === null || item.data.openingQty === undefined || typeof openingDate !== 'string') {
      throw new HttpError(409, 'no_opening', 'Barang ini belum punya saldo awal. Isi saldo awalnya dulu.')
    }
    if (date < openingDate) throw new HttpError(400, 'bad_request', `Tanggal tidak boleh sebelum saldo awal (${openingDate}).`)

    // Semua bacaan yang dibutuhkan diambil serempak: jendela antara membaca dan menulis (tempat tabrakan terjadi) menjadi pendek.
    const qM = toMilli(qty)
    const inM = type === 'masuk' ? qM : 0
    const outM = type === 'keluar' ? qM : 0
    const [prior, days, day, month] = await Promise.all([
      getDocument(c.env, c.sa, `projects/${pid}/ledger/${requestId}`),
      type === 'keluar' ? suffixDays(c, pid, iid, date) : Promise.resolve(null),
      getDocument(c.env, c.sa, `${itemPath(pid, iid)}/days/${date}`),
      getDocument(c.env, c.sa, `${itemPath(pid, iid)}/months/${date.slice(0, 7)}`),
    ])
    // Idempotensi: permintaan yang diulang (jaringan tidak stabil) tidak mencatat dua kali.
    if (prior) {
      const same = prior.data.createdBy === c.actor.uid && prior.data.itemId === iid && prior.data.date === date && prior.data.type === type && toMilli(num(prior.data[type === 'masuk' ? 'in' : 'out'])) === toMilli(qty)
      if (!same) throw new HttpError(409, 'duplicate_request', 'ID permintaan ini sudah dipakai untuk transaksi lain.')
      return { id: requestId, currentStock: num(item.data.currentStock), duplicate: true }
    }
    if (days) {
      // Stok tidak boleh negatif pada titik waktu mana pun sejak tanggal transaksi.
      const low = lowestBalanceFrom(toMilli(num(item.data.currentStock)), days, date)
      if (low - qM < 0) {
        throw new HttpError(409, 'insufficient', `Stok tidak cukup. Jumlah keluar maksimal pada tanggal itu: ${fromMilli(Math.max(low, 0))} ${String(cat?.data.unit ?? '')}.`.trim())
      }
    }

    const writes = buildWrites({
      c, pid, iid, entryId: requestId, inM, outM, item, day, month, correction: false,
      entry: { itemId: iid, date, ym: date.slice(0, 7), type, in: fromMilli(inM), out: fromMilli(outM), seq: num(item.data.txCount) + 1, note, createdBy: c.actor.uid, createdByName: c.actor.name, createdByRole: c.actor.roleName },
      label: `${String(cat?.data.name ?? iid)} @ ${String(project.data.name)}`,
      action: type === 'masuk' ? 'ledger.in' : 'ledger.out',
      detail: { jumlah: qty, satuan: String(cat?.data.unit ?? ''), tanggal: date, keterangan: note },
    })
    try {
      await commit(c.env, c.sa, writes)
    } catch (e) {
      if (e instanceof CommitError && e.conflict) throw new Retry()
      throw e
    }
    return { id: requestId, currentStock: fromMilli(toMilli(num(item.data.currentStock)) + inM - outM) }
  })
}

// ---------- Koreksi (entri pembalik) ----------

export async function correctEntry(c: Ctx, body: Body): Promise<Applied> {
  requirePerm(c.actor, 'inventory.correct')
  const pid = str(body, 'projectId', { label: 'Proyek' })
  assertProjectAccess(c.actor, pid)
  const entryId = str(body, 'entryId', { max: 80, label: 'Entri' })
  const reason = str(body, 'reason', { min: 3, max: 200, label: 'Alasan koreksi' })

  return withRetry(async () => {
    const orig = await getDocument(c.env, c.sa, `projects/${pid}/ledger/${entryId}`)
    if (!orig) throw new HttpError(404, 'not_found', 'Transaksi tidak ditemukan.')
    if (orig.data.type !== 'masuk' && orig.data.type !== 'keluar') throw new HttpError(409, 'not_correctable', 'Hanya transaksi masuk atau keluar yang dapat dikoreksi.')
    const iid = String(orig.data.itemId)
    const date = String(orig.data.date)
    const { project, item, cat } = await load(c, pid, iid)

    // Satu koreksi per transaksi, dijamin atomik oleh ID tetap + exists:false.
    const corrId = `${entryId}__k`
    const existing = await getDocument(c.env, c.sa, `projects/${pid}/ledger/${corrId}`)
    if (existing) throw new HttpError(409, 'already_corrected', 'Transaksi ini sudah dikoreksi.')

    // Pembalik: masuk menjadi keluar dan sebaliknya, bertanggal sama dengan aslinya (total bulan tetap konsisten).
    const inM = toMilli(num(orig.data.out))
    const outM = toMilli(num(orig.data.in))
    if (outM > inM) {
      // membatalkan barang masuk mengurangi stok: periksa saldo terendah sejak tanggal aslinya
      const days = await suffixDays(c, pid, iid, date)
      const low = lowestBalanceFrom(toMilli(num(item.data.currentStock)), days, date)
      if (low - (outM - inM) < 0) {
        throw new HttpError(409, 'insufficient', 'Koreksi tidak dapat dilakukan karena stok setelah tanggal itu sudah terpakai dan akan menjadi negatif.')
      }
    }
    const day = await getDocument(c.env, c.sa, `${itemPath(pid, iid)}/days/${date}`)
    const month = await getDocument(c.env, c.sa, `${itemPath(pid, iid)}/months/${date.slice(0, 7)}`)
    const writes = buildWrites({
      c, pid, iid, entryId: corrId, inM, outM, item, day, month, correction: true,
      entry: { itemId: iid, date, ym: date.slice(0, 7), type: 'koreksi', in: fromMilli(inM), out: fromMilli(outM), seq: num(item.data.txCount) + 1, note: reason, refEntryId: entryId, createdBy: c.actor.uid, createdByName: c.actor.name, createdByRole: c.actor.roleName },
      label: `${String(cat?.data.name ?? iid)} @ ${String(project.data.name)}`,
      action: 'ledger.correct',
      detail: { entriAsal: entryId, jenisAsal: String(orig.data.type), jumlah: Math.max(num(orig.data.in), num(orig.data.out)), tanggal: date, alasan: reason },
    })
    try {
      await commit(c.env, c.sa, writes)
    } catch (e) {
      if (e instanceof CommitError && e.conflict) throw new Retry()
      throw e
    }
    return { id: corrId, currentStock: fromMilli(toMilli(num(item.data.currentStock)) + inM - outM) }
  })
}

// ---------- Impor massal ----------

const MAX_IMPORT_ROWS = 150
const MAX_IMPORT_ITEMS = 10
const IMPORT_ID = /^[A-Za-z0-9-]{8,48}$/

export interface ImportResult {
  index: number
  status: 'ok' | 'duplicate' | 'error'
  code?: string
  message?: string
}

interface ParsedRow {
  index: number
  itemId: string
  type: 'masuk' | 'keluar'
  qM: number
  date: string
  note: string
}

/**
 * Mengimpor sekumpulan transaksi satu proyek dalam SATU commit atomik. Setiap baris divalidasi sendiri:
 * baris yang salah ditolak (dengan alasan) dan baris yang benar dimasukkan. Barang masuk diproses lebih dulu,
 * lalu barang keluar menurut tanggal; keluar ditolak bila membuat saldo negatif pada titik waktu mana pun.
 * Batas 150 baris dan 10 barang per permintaan menjaga jumlah sub-permintaan Worker (paket gratis: 50) dan 500 penulisan per commit.
 */
export async function importEntries(c: Ctx, body: Body): Promise<{ results: ImportResult[]; accepted: number; rejected: number; duplicates: number }> {
  requirePerm(c.actor, 'import')
  requirePerm(c.actor, 'inventory.write')
  const pid = str(body, 'projectId', { label: 'Proyek' })
  assertProjectAccess(c.actor, pid)
  const importId = str(body, 'importId', { max: 48, label: 'ID impor' })
  if (!IMPORT_ID.test(importId)) throw new HttpError(400, 'bad_request', 'ID impor tidak valid.')
  const fileName = optStr(body, 'fileName', 120, 'Nama berkas') ?? ''
  const raw = body.rows
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'bad_request', 'Tidak ada baris untuk diimpor.')
  if (raw.length > MAX_IMPORT_ROWS) throw new HttpError(400, 'too_many_rows', `Maksimal ${MAX_IMPORT_ROWS} baris per permintaan.`)

  const today = todayWita()
  const errors = new Map<number, ImportResult>()
  const parsed: ParsedRow[] = []
  raw.forEach((r, i) => {
    const index = i + 1
    try {
      if (!r || typeof r !== 'object') throw new HttpError(400, 'bad_request', 'Baris tidak valid.')
      const row = r as Body
      const date = isoDate(row, 'date', 'Tanggal')
      if (!date) throw new HttpError(400, 'bad_request', 'Tanggal wajib diisi.')
      if (date > today) throw new HttpError(400, 'bad_request', 'Tanggal tidak boleh di masa depan.')
      parsed.push({
        index,
        itemId: str(row, 'itemId', { label: 'Barang' }),
        type: oneOf(row, 'type', ['masuk', 'keluar'] as const, 'Jenis'),
        qM: toMilli(positiveQuantity(row, 'qty', 'Jumlah')),
        date,
        note: optStr(row, 'note', 200, 'Keterangan') ?? '',
      })
    } catch (e) {
      if (!(e instanceof HttpError)) throw e
      errors.set(index, { index, status: 'error', code: e.code, message: e.message })
    }
  })
  if (new Set(parsed.map((p) => p.itemId)).size > MAX_IMPORT_ITEMS) {
    throw new HttpError(400, 'too_many_items', `Maksimal ${MAX_IMPORT_ITEMS} barang berbeda per permintaan.`)
  }

  return withRetry(async () => {
    const project = await getDocument(c.env, c.sa, `projects/${pid}`)
    if (!project) throw new HttpError(404, 'not_found', 'Proyek tidak ditemukan.')
    if (project.data.active === false) throw new HttpError(409, 'inactive', 'Proyek sudah nonaktif.')

    const results = new Map<number, ImportResult>(errors)
    const fail = (index: number, code: string, message: string) => results.set(index, { index, status: 'error', code, message })

    // Baris yang sudah pernah masuk (permintaan diulang) dilewati, bukan dicatat ulang.
    const existing = await batchGetDocuments(c.env, c.sa, parsed.map((p) => `projects/${pid}/ledger/${importId}-${p.index}`))
    const fresh: ParsedRow[] = []
    for (const p of parsed) {
      if (existing.has(`projects/${pid}/ledger/${importId}-${p.index}`)) results.set(p.index, { index: p.index, status: 'duplicate', message: 'Baris ini sudah pernah diimpor.' })
      else fresh.push(p)
    }

    const writes: Write[] = []
    let accepted = 0
    const byItem = new Map<string, ParsedRow[]>()
    for (const p of fresh) byItem.set(p.itemId, [...(byItem.get(p.itemId) ?? []), p])

    for (const [iid, rows] of byItem) {
      const item = await getDocument(c.env, c.sa, itemPath(pid, iid))
      if (!item) {
        rows.forEach((r) => fail(r.index, 'not_found', 'Barang tidak ada di proyek ini.'))
        continue
      }
      const openingDate = item.data.openingDate
      if (item.data.active === false) {
        rows.forEach((r) => fail(r.index, 'inactive', 'Barang ini nonaktif di proyek.'))
        continue
      }
      if (item.data.openingQty === null || item.data.openingQty === undefined || typeof openingDate !== 'string') {
        rows.forEach((r) => fail(r.index, 'no_opening', 'Barang ini belum punya saldo awal.'))
        continue
      }
      const cand = rows.filter((r) => {
        if (r.date < openingDate) {
          fail(r.index, 'bad_request', `Tanggal sebelum saldo awal (${openingDate}).`)
          return false
        }
        return true
      })
      if (cand.length === 0) continue

      const minDate = cand.reduce((m, r) => (r.date < m ? r.date : m), cand[0].date)
      const minYm = minDate.slice(0, 7)
      const [dayDocs, monthDocs] = await Promise.all([
        queryDocuments(c.env, c.sa, 'days', [{ field: 'date', op: 'GREATER_THAN_OR_EQUAL', value: minDate }], MAX_DAYS + 1, itemPath(pid, iid)),
        queryDocuments(c.env, c.sa, 'months', [{ field: 'ym', op: 'GREATER_THAN_OR_EQUAL', value: minYm }], 400, itemPath(pid, iid)),
      ])
      if (dayDocs.length > MAX_DAYS) throw new HttpError(400, 'bad_request', 'Rentang tanggal terlalu panjang untuk diperiksa. Gunakan tanggal yang lebih baru.')

      // Garis waktu dalam memori: total harian yang ada + baris yang diterima sejauh ini.
      const dayIn = new Map<string, number>()
      const dayOut = new Map<string, number>()
      const dayDoc = new Map<string, Doc>()
      for (const d of dayDocs) {
        const k = String(d.data.date)
        dayIn.set(k, toMilli(num(d.data.in)))
        dayOut.set(k, toMilli(num(d.data.out)))
        dayDoc.set(k, d)
      }
      let stock = toMilli(num(item.data.currentStock))
      const net = () => [...new Set([...dayIn.keys(), ...dayOut.keys()])].map((date) => ({ date, net: (dayIn.get(date) ?? 0) - (dayOut.get(date) ?? 0) }))
      const accept: ParsedRow[] = []
      const order = [...cand.filter((r) => r.type === 'masuk').sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index), ...cand.filter((r) => r.type === 'keluar').sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)]
      for (const r of order) {
        if (r.type === 'keluar') {
          const low = lowestBalanceFrom(stock, net(), r.date)
          if (low - r.qM < 0) {
            fail(r.index, 'insufficient', `Stok tidak cukup. Jumlah keluar maksimal pada tanggal itu: ${fromMilli(Math.max(low, 0))}.`)
            continue
          }
          dayOut.set(r.date, (dayOut.get(r.date) ?? 0) + r.qM)
          stock -= r.qM
        } else {
          dayIn.set(r.date, (dayIn.get(r.date) ?? 0) + r.qM)
          stock += r.qM
        }
        accept.push(r)
      }
      if (accept.length === 0) continue

      const prevCount = num(item.data.txCount)
      const prevLast = typeof item.data.lastTxDate === 'string' ? item.data.lastTxDate : ''
      let last = prevLast
      accept.forEach((r, n) => {
        results.set(r.index, { index: r.index, status: 'ok' })
        if (r.date > last) last = r.date
        writes.push({
          path: `projects/${pid}/ledger/${importId}-${r.index}`,
          data: {
            itemId: iid, date: r.date, ym: r.date.slice(0, 7), type: r.type,
            in: r.type === 'masuk' ? fromMilli(r.qM) : 0, out: r.type === 'keluar' ? fromMilli(r.qM) : 0,
            seq: prevCount + n + 1, note: r.note, source: 'import', importId,
            createdBy: c.actor.uid, createdByName: c.actor.name, createdByRole: c.actor.roleName,
          },
          precondition: { exists: false },
          serverTime: ['createdAt'],
        })
      })
      accepted += accept.length
      writes.push({
        path: itemPath(pid, iid),
        data: { currentStock: fromMilli(stock), txCount: prevCount + accept.length, ...(last !== prevLast ? { lastTxDate: last } : {}) },
        mask: ['currentStock', 'txCount', ...(last !== prevLast ? ['lastTxDate'] : [])],
        precondition: pre(item),
      })
      for (const date of new Set(accept.map((r) => r.date))) {
        writes.push({ path: `${itemPath(pid, iid)}/days/${date}`, data: { date, in: fromMilli(dayIn.get(date) ?? 0), out: fromMilli(dayOut.get(date) ?? 0) }, precondition: pre(dayDoc.get(date) ?? null) })
      }
      for (const ym of new Set(accept.map((r) => r.date.slice(0, 7)))) {
        const md = monthDocs.find((d) => d.id === ym) ?? null
        const m = md?.data ?? {}
        const mine = accept.filter((r) => r.date.slice(0, 7) === ym)
        writes.push({
          path: `${itemPath(pid, iid)}/months/${ym}`,
          data: {
            ym,
            in: fromMilli(toMilli(num(m.in)) + mine.filter((r) => r.type === 'masuk').reduce((s, r) => s + r.qM, 0)),
            out: fromMilli(toMilli(num(m.out)) + mine.filter((r) => r.type === 'keluar').reduce((s, r) => s + r.qM, 0)),
            corrIn: num(m.corrIn), corrOut: num(m.corrOut),
            count: num(m.count) + mine.length, corrCount: num(m.corrCount),
          },
          precondition: pre(md),
        })
      }
    }

    const rejected = [...results.values()].filter((r) => r.status === 'error').length
    const duplicates = [...results.values()].filter((r) => r.status === 'duplicate').length
    if (writes.length > 0) {
      writes.push(auditWrite(c.actor, 'ledger.import', { type: 'ledger', id: importId, label: String(project.data.name) }, { berkas: fileName, diterima: accepted, ditolak: rejected, duplikat: duplicates }))
      if (writes.length > 480) throw new HttpError(400, 'too_many_rows', 'Impor terlalu besar untuk satu permintaan.')
      try {
        await commit(c.env, c.sa, writes)
      } catch (e) {
        if (e instanceof CommitError && e.conflict) throw new Retry()
        throw e
      }
    }
    return { results: [...results.values()].sort((a, b) => a.index - b.index), accepted, rejected, duplicates }
  })
}
