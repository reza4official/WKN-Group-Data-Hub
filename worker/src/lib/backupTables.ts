/**
 * Tabel cermin cadangan ke Google Sheets: kolom cukup untuk memulihkan data (lihat docs/TAHAP-9-PENERAPAN.md).
 * Tidak memuat password (disimpan Firebase Auth), kunci passkey, atau dokumen penjaga/total turunan
 * (days/months dapat dihitung ulang dari Transaksi). Sel teks berawalan = + - @ diberi awalan agar tidak menjadi rumus Sheets.
 */
export type Cell = string | number | boolean
export type Mode = 'replace' | 'upsert' | 'append'
export interface TableDef {
  sheet: string
  mode: Mode
  header: string[]
}

export const T = {
  users: { sheet: 'Pengguna', mode: 'replace', header: ['ID', 'Username', 'Nama', 'No. HP', 'Email', 'Role ID', 'Level', 'Status', 'Proyek', 'Dibuat oleh', 'Dibuat', 'Diperbarui oleh', 'Diperbarui'] },
  roles: { sheet: 'Role', mode: 'replace', header: ['ID', 'Nama', 'Level', 'Sistem', 'Izin'] },
  companies: { sheet: 'Perusahaan', mode: 'upsert', header: ['ID', 'Nama', 'Jenis', 'Aktif'] },
  projects: { sheet: 'Proyek', mode: 'upsert', header: ['ID', 'Perusahaan ID', 'Nama', 'Lokasi', 'Status', 'Tanggal mulai', 'Aktif', 'Dibuat oleh', 'Dibuat'] },
  catalog: { sheet: 'Katalog', mode: 'upsert', header: ['ID', 'Nama', 'Satuan', 'Kategori', 'Batas minimum', 'Aktif', 'Dipakai di proyek', 'Sumber'] },
  items: { sheet: 'Barang Proyek', mode: 'upsert', header: ['Kunci', 'Proyek ID', 'Barang ID', 'Saldo awal', 'Tanggal saldo awal', 'Stok kini', 'Jumlah transaksi', 'Batas minimum', 'Aktif', 'Transaksi terakhir', 'Sumber'] },
  ledger: { sheet: 'Transaksi', mode: 'append', header: ['Kunci', 'Proyek ID', 'ID', 'Barang ID', 'Tanggal', 'Jenis', 'Masuk', 'Keluar', 'Urutan', 'Keterangan', 'Entri asal (koreksi)', 'Sumber', 'ID impor', 'Dicatat oleh (UID)', 'Dicatat oleh', 'Role', 'Waktu catat'] },
  audit: { sheet: 'Audit', mode: 'append', header: ['ID', 'Waktu', 'Pelaku UID', 'Pelaku', 'Username', 'Role', 'Aksi', 'Target tipe', 'Target ID', 'Target', 'Rincian'] },
} satisfies Record<string, TableDef>

export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
type D = Record<string, unknown>
const s = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? safeCell(v) : String(v))
const n = (v: unknown): number | string => (typeof v === 'number' ? v : '')
const list = (v: unknown): string => (Array.isArray(v) ? v.map(String).join('; ') : '')

export const rowUser = (id: string, d: D): Cell[] => [id, s(d.username), s(d.name), s(d.phone), s(d.emailContact), s(d.roleId), n(d.level), d.disabled === true ? 'Nonaktif' : 'Aktif', list(d.projectIds), s(d.createdByName), s(d.createdAt), s(d.updatedByName), s(d.updatedAt)]
export const rowRole = (id: string, d: D): Cell[] => [id, s(d.name), n(d.level), d.system === true, list(d.perms)]
export const rowCompany = (id: string, d: D): Cell[] => [id, s(d.name), s(d.type), d.active !== false]
export const rowProject = (id: string, d: D): Cell[] => [id, s(d.companyId), s(d.name), s(d.location), s(d.status), s(d.startDate), d.active !== false, s(d.createdByName), s(d.createdAt)]
export const rowCatalog = (id: string, d: D): Cell[] => [id, s(d.name), s(d.unit), s(d.category), n(d.minStock), d.active !== false, n(d.projectCount), s(d.source)]
export const rowItem = (pid: string, id: string, d: D): Cell[] => [`${pid}/${id}`, pid, id, n(d.openingQty), s(d.openingDate), n(d.currentStock), n(d.txCount), n(d.minStock), d.active !== false, s(d.lastTxDate), s(d.source)]
export const rowLedger = (pid: string, id: string, d: D): Cell[] => [`${pid}/${id}`, pid, id, s(d.itemId), s(d.date), s(d.type), n(d.in), n(d.out), n(d.seq), s(d.note), s(d.refEntryId), s(d.source), s(d.importId), s(d.createdBy), s(d.createdByName), s(d.createdByRole), s(d.createdAt)]
export const rowAudit = (id: string, d: D): Cell[] => [id, s(d.at), s(d.actorUid), s(d.actorName), s(d.actorUsername), s(d.actorRole), s(d.action), s(d.targetType), s(d.targetId), s(d.targetLabel), s(JSON.stringify(d.detail ?? {}))]
