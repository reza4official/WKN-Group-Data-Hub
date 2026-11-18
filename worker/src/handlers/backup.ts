import type { Env } from '../env'
import { requirePerm, type Actor } from '../lib/actor'
import { auditWrite } from '../lib/audit'
import { rowAudit, rowCatalog, rowCompany, rowItem, rowLedger, rowProject, rowRole, rowUser, T, type Cell, type TableDef } from '../lib/backupTables'
import { commit, CommitError, getDocument, queryDocuments, type Doc } from '../lib/firestore'
import { HttpError } from '../lib/http'
import type { ServiceAccount } from '../lib/serviceAccount'

/**
 * Cermin cadangan satu arah ke Google Sheets (Apps Script web app). Bukan sumber kebenaran.
 * Dijalankan oleh cron (harian) atau tombol "Cadangkan sekarang". Dirancang untuk batas Workers paket gratis:
 * 50 sub-permintaan per pemanggilan, jadi kerja dipecah dan dilanjutkan di pemanggilan berikutnya lewat kursor di system/backup.
 */
const PAGE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const COOLDOWN_SECONDS = 300
/** Sub-permintaan yang dipakai webhook (POST dan satu pengalihan 302 Apps Script) dihitung 2. */
const WEBHOOK_COST = 2

export interface BackupState {
  cursors: Record<string, string>
  projectPtr: number
  /** Jumlah proyek yang sudah diproses sejak awal siklus; siklus selesai bila sama dengan jumlah proyek. */
  cycle: number
  lastRunAt: string
  lastOkAt: string
  lastStatus: 'ok' | 'partial' | 'error' | 'unconfigured'
  lastError: string
  lastTrigger: string
  counts: Record<string, number>
}

interface Ctx {
  actor: Actor
  env: Env
  sa: ServiceAccount
}

export class BackupError extends Error {}

/** Pesan galat untuk disimpan/ditampilkan: tanpa URL, rahasia, atau token. */
export function sanitize(msg: string, env: Env): string {
  let m = msg.replace(/https?:\/\/\S+/g, '[url]')
  for (const secret of [env.BACKUP_SECRET, env.BACKUP_WEBHOOK_URL]) if (secret) m = m.split(secret).join('[rahasia]')
  return m.replace(/[A-Za-z0-9_-]{32,}/g, '[token]').slice(0, 200)
}

export const backupConfigured = (env: Env): boolean => Boolean(env.BACKUP_WEBHOOK_URL && env.BACKUP_SECRET)

interface Payload {
  sheet: string
  mode: TableDef['mode']
  header: string[]
  rows: Cell[][]
}

async function send(env: Env, tables: Payload[]): Promise<Record<string, number>> {
  let res: Response
  try {
    res = await fetch(env.BACKUP_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      // Apps Script tidak dapat membaca header; rahasia ikut di badan permintaan.
      body: JSON.stringify({ v: 1, secret: env.BACKUP_SECRET, tables }),
    })
  } catch (e) {
    throw new BackupError(sanitize(`Apps Script tidak dapat dihubungi: ${e instanceof Error ? e.message : ''}`, env))
  }
  let body: { ok?: boolean; error?: string; counts?: Record<string, number> } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    throw new BackupError(`Apps Script menjawab dengan format tak dikenal (HTTP ${res.status}). Periksa penerapan web app (Execute as: Me, Who has access: Anyone).`)
  }
  if (!res.ok || body.ok !== true) throw new BackupError(sanitize(`Apps Script menolak: ${body.error ?? `HTTP ${res.status}`}`, env))
  return body.counts ?? {}
}

async function readState(env: Env, sa: ServiceAccount): Promise<{ state: BackupState; doc: Doc | null }> {
  const doc = await getDocument(env, sa, 'system/backup')
  const d = (doc?.data ?? {}) as Partial<BackupState>
  return {
    doc,
    state: {
      cursors: (d.cursors ?? {}) as Record<string, string>,
      projectPtr: Number(d.projectPtr ?? 0),
      cycle: Number(d.cycle ?? 0),
      lastRunAt: String(d.lastRunAt ?? ''),
      lastOkAt: String(d.lastOkAt ?? ''),
      lastStatus: (d.lastStatus as BackupState['lastStatus']) ?? 'unconfigured',
      lastError: String(d.lastError ?? ''),
      lastTrigger: String(d.lastTrigger ?? ''),
      counts: (d.counts ?? {}) as Record<string, number>,
    },
  }
}

async function saveState(env: Env, sa: ServiceAccount, state: BackupState, doc: Doc | null): Promise<void> {
  try {
    await commit(env, sa, [{ path: 'system/backup', data: { ...state }, precondition: doc?.updateTime ? { updateTime: doc.updateTime } : { exists: !!doc } }])
  } catch (e) {
    // Pemanggilan lain menyimpan lebih dulu; pekerjaan bersifat idempoten, jadi cukup dilewati.
    if (!(e instanceof CommitError && e.conflict)) throw e
  }
}

const maxTs = (docs: Doc[], field: string, cur: string): string => docs.reduce((m, d) => (typeof d.data[field] === 'string' && (d.data[field] as string) > m ? (d.data[field] as string) : m), cur)

/**
 * Satu putaran cadangan. `budget` = jumlah sub-permintaan maksimum yang boleh dipakai putaran ini (paket gratis: 50 total,
 * sisanya untuk pemuatan pelaku dan pencatatan audit). Kursor hanya maju setelah Apps Script mengonfirmasi.
 */
export async function runBackup(env: Env, sa: ServiceAccount, trigger: 'cron' | 'manual', budget = 38, now = new Date()): Promise<BackupState> {
  const { state, doc } = await readState(env, sa)
  let used = 1 // pembacaan status
  const stamp = { lastRunAt: now.toISOString(), lastTrigger: trigger }

  if (!backupConfigured(env)) {
    const next: BackupState = { ...state, ...stamp, lastStatus: 'unconfigured', lastError: '' }
    await saveState(env, sa, next, doc)
    return next
  }

  try {
    // ---- Tahap A: tabel kecil (satu pemanggilan webhook)
    const [users, roles, companies, projects, catalog] = await Promise.all(
      ['users', 'roles', 'companies', 'projects', 'catalog'].map((c) => queryDocuments(env, sa, c, [], 1000)),
    )
    used += 5
    const counts: Record<string, number> = { ...state.counts }
    const a = await send(env, [
      { ...T.users, rows: users.map((d) => rowUser(d.id, d.data)) },
      { ...T.roles, rows: roles.map((d) => rowRole(d.id, d.data)) },
      { ...T.companies, rows: companies.map((d) => rowCompany(d.id, d.data)) },
      { ...T.projects, rows: projects.map((d) => rowProject(d.id, d.data)) },
      { ...T.catalog, rows: catalog.map((d) => rowCatalog(d.id, d.data)) },
    ])
    used += WEBHOOK_COST
    Object.assign(counts, a)

    // ---- Tahap B: barang dan transaksi per proyek (berlanjut lintas putaran) + audit
    const ordered = [...projects].sort((x, y) => x.id.localeCompare(y.id))
    const cursors = { ...state.cursors }
    const items: Cell[][] = []
    const ledger: Cell[][] = []
    const nextCursors: Record<string, string> = {}
    let partial = false
    let ptr = ordered.length ? state.projectPtr % ordered.length : 0
    let done = 0
    // sisa anggaran: webhook B (2) + audit (1) + simpan status (1)
    while (done < ordered.length && used + 2 + WEBHOOK_COST + 2 <= budget) {
      const p = ordered[ptr]
      const [its, led] = await Promise.all([
        queryDocuments(env, sa, 'items', [], 1000, `projects/${p.id}`),
        queryDocuments(env, sa, 'ledger', [{ field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value: cursors[`ledger:${p.id}`] ?? EPOCH, timestamp: true }], PAGE, `projects/${p.id}`),
      ])
      used += 2
      items.push(...its.map((d) => rowItem(p.id, d.id, d.data)))
      ledger.push(...led.map((d) => rowLedger(p.id, d.id, d.data)))
      if (led.length > 0) nextCursors[`ledger:${p.id}`] = maxTs(led, 'createdAt', cursors[`ledger:${p.id}`] ?? EPOCH)
      if (led.length >= PAGE) partial = true
      ptr = (ptr + 1) % ordered.length
      done++
    }
    const cycleDone = state.cycle + done
    const cycleComplete = cycleDone >= ordered.length
    if (!cycleComplete) partial = true
    const audit = await queryDocuments(env, sa, 'auditLog', [{ field: 'at', op: 'GREATER_THAN_OR_EQUAL', value: cursors.audit ?? EPOCH, timestamp: true }], PAGE)
    used += 1
    if (audit.length >= PAGE) partial = true
    if (audit.length > 0) nextCursors.audit = maxTs(audit, 'at', cursors.audit ?? EPOCH)

    const b = await send(env, [
      { ...T.items, rows: items },
      { ...T.ledger, rows: ledger },
      { ...T.audit, rows: audit.map((d) => rowAudit(d.id, d.data)) },
    ])
    used += WEBHOOK_COST
    Object.assign(counts, b)

    const next: BackupState = {
      cursors: { ...cursors, ...nextCursors },
      projectPtr: ptr,
      cycle: cycleComplete ? 0 : cycleDone,
      ...stamp,
      lastOkAt: now.toISOString(),
      lastStatus: partial ? 'partial' : 'ok',
      lastError: '',
      counts,
    }
    await saveState(env, sa, next, doc)
    return next
  } catch (e) {
    const msg = e instanceof BackupError ? e.message : sanitize(e instanceof Error ? e.message : 'Kesalahan tak dikenal.', env)
    // Kursor tidak berubah: putaran berikutnya mengulang dari titik terakhir yang berhasil.
    const next: BackupState = { ...state, ...stamp, lastStatus: 'error', lastError: msg }
    await saveState(env, sa, next, doc).catch(() => {})
    return next
  }
}

/** Tombol "Cadangkan sekarang": izin audit, jeda 5 menit antar-putaran, tercatat di audit. */
export async function runBackupNow(c: Ctx): Promise<BackupState> {
  requirePerm(c.actor, 'audit')
  const { state } = await readState(c.env, c.sa)
  if (!backupConfigured(c.env)) {
    throw new HttpError(409, 'not_configured', 'Cadangan Google Sheets belum dikonfigurasi (BACKUP_WEBHOOK_URL dan BACKUP_SECRET). Lihat panduan Tahap 9.')
  }
  const since = state.lastRunAt ? (Date.now() - new Date(state.lastRunAt).getTime()) / 1000 : Infinity
  if (since < COOLDOWN_SECONDS) {
    throw new HttpError(429, 'cooldown', `Cadangan baru saja dijalankan. Coba lagi dalam ${Math.ceil(COOLDOWN_SECONDS - since)} detik.`)
  }
  await commit(c.env, c.sa, [auditWrite(c.actor, 'backup.run', { type: 'system', id: 'backup', label: 'Cadangan Google Sheets' })])
  // Pemuatan pelaku (±3) dan audit (1) sudah memakai sebagian dari 50 sub-permintaan.
  return runBackup(c.env, c.sa, 'manual', 34)
}
