import type { Employee } from './data'
import type { DashRow } from './dashboard'
import { dayName, type LedgerRow } from './ledger'
import { formatWita } from './time'

export type Cell = string | number | null
export interface Table {
  /** Nama lembar (Excel, maks. 31 karakter) dan judul tabel (PDF). */
  title: string
  head: string[]
  rows: Cell[][]
  /** Indeks kolom angka (rata kanan, format angka). */
  numeric: number[]
}
export interface ExportMeta {
  title: string
  project: string
  period: string
  by: string
  role: string
  printedAt: string
}

export const meta = (
  title: string,
  project: string,
  period: string,
  by: string,
  role: string,
  now = new Date(),
): ExportMeta => ({
  title,
  project,
  period,
  by,
  role,
  printedAt: formatWita(now),
})

/** Baris transaksi (termasuk baris saldo awal dan koreksi) sebagaimana tampil di halaman Transaksi Stok. */
export function transactionTable(rows: LedgerRow[]): Table {
  return {
    title: 'Transaksi',
    head: [
      'Hari',
      'Tanggal',
      'Nama Barang',
      'Satuan',
      'Masuk',
      'Keluar',
      'Tersisa',
      'Keterangan',
      'Dicatat oleh',
      'Waktu catat',
    ],
    numeric: [4, 5, 6],
    rows: rows.map((r) => [
      dayName(r.date),
      r.date,
      r.itemName,
      r.unit,
      r.in,
      r.out,
      r.balance,
      r.kind === 'opening'
        ? 'Saldo awal'
        : r.kind === 'koreksi'
          ? `Koreksi: ${r.note}`
          : r.corrected
            ? `${r.note} (sudah dikoreksi)`
            : r.note,
      r.entry?.createdByName ?? '',
      r.entry ? formatWita(r.entry.createdAt) : '',
    ]),
  }
}

export function summaryTable(rows: DashRow[]): Table {
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    title: 'Ringkasan',
    head: [
      'Barang',
      'Satuan',
      'Awal',
      'Masuk',
      'Keluar',
      'Sisa',
      'Pemakaian (%)',
      'Laju keluar/hari',
      'Cukup (hari)',
      'Batas minimum',
      'Status',
    ],
    numeric: [2, 3, 4, 5, 6, 7, 8, 9],
    rows: rows.map((r) => [
      r.name,
      r.unit,
      r.awal,
      r.masuk,
      r.keluar,
      r.sisa,
      r2(r.pct),
      r2(r.rate),
      r.cover === null ? null : Math.floor(r.cover),
      r.min,
      r.statusLabel,
    ]),
  }
}

/** Nama berkas aman dan deskriptif, mis. wkn-transaksi-jalan-maros-2026-11. */
export const fileSlug = (...parts: string[]): string =>
  `wkn-${parts
    .join('-')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`

/** Database Karyawan: kolom sama dengan layar, plus proyek dan waktu catat. */
export function employeeTable(
  rows: Employee[],
  roleName: (id: string) => string,
  projectName: (id: string) => string,
): Table {
  return {
    title: 'Karyawan',
    head: [
      'Nama',
      'Username',
      'No. HP',
      'Email',
      'Role',
      'Level',
      'Status',
      'Proyek',
      'Diperbarui oleh',
      'Waktu',
    ],
    numeric: [5],
    rows: rows.map((e) => [
      e.name,
      e.username,
      e.phone,
      e.emailContact,
      roleName(e.roleId),
      e.level,
      e.disabled ? 'Nonaktif' : 'Aktif',
      e.projectIds.map(projectName).join(', '),
      e.updatedByName || e.createdByName,
      formatWita(e.updatedAt ?? e.createdAt),
    ]),
  }
}
