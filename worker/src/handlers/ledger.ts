import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { commit, CommitError, getDocument, queryDocuments, type Doc, type Write } from '../lib/firestore'
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

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Retry)) throw e
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
  return [
    { path: `projects/${pid}/ledger/${p.entryId}`, data: entry, precondition: { exists: false }, serverTime: ['createdAt'] },
    // Setiap perubahan stok melewati dokumen barang dengan prasyarat updateTime: penulis bersamaan saling bertabrakan.
    { path: itemPath(pid, iid), data: { currentStock: fromMilli(newStock), txCount: num(item.data.txCount) + 1 }, mask: ['currentStock', 'txCount'], precondition: pre(item) },
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

    // Idempotensi: permintaan yang diulang (jaringan tidak stabil) tidak mencatat dua kali.
    const prior = await getDocument(c.env, c.sa, `projects/${pid}/ledger/${requestId}`)
    if (prior) {
      const same = prior.data.createdBy === c.actor.uid && prior.data.itemId === iid && prior.data.date === date && prior.data.type === type && toMilli(num(prior.data[type === 'masuk' ? 'in' : 'out'])) === toMilli(qty)
      if (!same) throw new HttpError(409, 'duplicate_request', 'ID permintaan ini sudah dipakai untuk transaksi lain.')
      return { id: requestId, currentStock: num(item.data.currentStock), duplicate: true }
    }

    const qM = toMilli(qty)
    const inM = type === 'masuk' ? qM : 0
    const outM = type === 'keluar' ? qM : 0
    let day: Doc | null
    if (type === 'keluar') {
      // Stok tidak boleh negatif pada titik waktu mana pun sejak tanggal transaksi.
      const days = await suffixDays(c, pid, iid, date)
      const low = lowestBalanceFrom(toMilli(num(item.data.currentStock)), days, date)
      if (low - qM < 0) {
        throw new HttpError(409, 'insufficient', `Stok tidak cukup. Jumlah keluar maksimal pada tanggal itu: ${fromMilli(Math.max(low, 0))} ${String(cat?.data.unit ?? '')}.`.trim())
      }
    }
    day = await getDocument(c.env, c.sa, `${itemPath(pid, iid)}/days/${date}`)
    const month = await getDocument(c.env, c.sa, `${itemPath(pid, iid)}/months/${date.slice(0, 7)}`)

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
