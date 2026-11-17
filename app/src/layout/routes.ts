import type { IconName } from '../components/Icon'

export type RouteDef = {
  id: string
  label: string
  icon: IconName
  group: string
  /** Versi tempat fitur ini dibangun (lihat docs/TAHAP-PENGERJAAN.md). */
  arrives: string
  description: string
}

export const ROUTES: RouteDef[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dash',
    group: 'Ringkasan',
    arrives: 'v0.6.0',
    description:
      'Ringkasan stok per barang: masuk, keluar, sisa, perbandingan bulan lalu, dan persentase pemakaian.',
  },
  {
    id: 'inventory',
    label: 'Transaksi Stok',
    icon: 'swap',
    group: 'Inventory',
    arrives: 'v0.5.0',
    description: 'Pencatatan barang masuk dan keluar per proyek, lengkap dengan pencatat dan waktunya.',
  },
  {
    id: 'catalog',
    label: 'Katalog Barang',
    icon: 'tag',
    group: 'Inventory',
    arrives: 'v0.4.0',
    description: 'Daftar baku barang dan satuan yang dipakai bersama oleh semua proyek.',
  },
  {
    id: 'projects',
    label: 'Proyek & Perusahaan',
    icon: 'build',
    group: 'Inventory',
    arrives: 'v0.4.0',
    description: 'Perusahaan induk, anak perusahaan, proyek, dan saldo awal barang.',
  },
  {
    id: 'io',
    label: 'Impor / Ekspor',
    icon: 'xls',
    group: 'Inventory',
    arrives: 'v0.7.0',
    description: 'Ekspor dan impor data dalam bentuk Excel dan PDF.',
  },
  {
    id: 'users',
    label: 'Akun Pengguna',
    icon: 'users',
    group: 'Administrasi',
    arrives: 'v0.3.0',
    description: 'Membuat, mengubah, dan menghapus akun untuk role di bawah Anda.',
  },
  {
    id: 'roles',
    label: 'Role & Akses',
    icon: 'shield',
    group: 'Administrasi',
    arrives: 'v0.3.0',
    description: 'Hirarki role dan pengaturan hak akses.',
  },
  {
    id: 'resets',
    label: 'Permintaan Reset',
    icon: 'key',
    group: 'Administrasi',
    arrives: 'v0.3.0',
    description: 'Permintaan reset password beserta siapa yang mengeksekusi dan kapan.',
  },
  {
    id: 'employees',
    label: 'Database Karyawan',
    icon: 'id',
    group: 'Administrasi',
    arrives: 'v0.8.0',
    description: 'Data karyawan yang terhubung dengan profil pengguna.',
  },
  {
    id: 'audit',
    label: 'Log Audit',
    icon: 'log',
    group: 'Administrasi',
    arrives: 'v0.3.0',
    description: 'Catatan permanen siapa melakukan apa, tanggal, dan jam.',
  },
  {
    id: 'profil',
    label: 'Profil Saya',
    icon: 'user',
    group: 'Akun',
    arrives: 'v0.8.0',
    description: 'Ubah nama, no. HP, email, dan password Anda.',
  },
]

export const DEFAULT_ROUTE = ROUTES[0]

export function findRoute(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id)
}
