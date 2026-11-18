import shared from '../../../shared/permissions.json'

/** Daftar izin (sumber tunggal di shared/permissions.json) beserta label tampilannya. */
export const PERMISSION_KEYS: readonly string[] = shared.keys

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: 'Lihat dashboard ringkasan',
  'inventory.read': 'Lihat transaksi inventory',
  'inventory.write': 'Catat barang masuk/keluar',
  'inventory.correct': 'Koreksi transaksi (reversal)',
  catalog: 'Kelola katalog barang',
  projects: 'Kelola perusahaan & proyek',
  users: 'Kelola akun di bawahnya',
  roles: 'Kelola role & akses',
  resets: 'Menangani permintaan reset',
  employees: 'Lihat database karyawan',
  audit: 'Lihat log audit',
  export: 'Ekspor Excel/PDF',
  import: 'Impor Excel',
}
