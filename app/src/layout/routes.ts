import type { IconName } from '../components/Icon'

export type RouteDef = {
  id: string
  label: string
  icon: IconName
  group: string
  /** Izin yang diperlukan (salah satu cukup). Kosong berarti semua akun masuk boleh. */
  perm?: string[]
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
    perm: ['dashboard'],
    arrives: 'v0.6.0',
    description:
      'Ringkasan stok per barang: masuk, keluar, sisa, perbandingan bulan lalu, dan persentase pemakaian.',
  },
  {
    id: 'inventory',
    label: 'Transaksi Stok',
    icon: 'swap',
    group: 'Inventory',
    perm: ['inventory.read'],
    arrives: 'v0.5.0',
    description: 'Pencatatan barang masuk dan keluar per proyek, lengkap dengan pencatat dan waktunya.',
  },
  {
    id: 'catalog',
    label: 'Katalog Barang',
    icon: 'tag',
    group: 'Inventory',
    perm: ['catalog'],
    arrives: 'v0.4.0',
    description: 'Daftar baku barang dan satuan yang dipakai bersama oleh semua proyek.',
  },
  {
    id: 'projects',
    label: 'Proyek & Perusahaan',
    icon: 'build',
    group: 'Inventory',
    perm: ['projects', 'inventory.read'],
    arrives: 'v0.4.0',
    description: 'Perusahaan induk, anak perusahaan, proyek, dan saldo awal barang.',
  },
  {
    id: 'io',
    label: 'Impor / Ekspor',
    icon: 'xls',
    group: 'Inventory',
    perm: ['export', 'import'],
    arrives: 'v0.7.0',
    description: 'Ekspor dan impor data dalam bentuk Excel dan PDF.',
  },
  {
    id: 'users',
    label: 'Akun Pengguna',
    icon: 'users',
    group: 'Administrasi',
    perm: ['users'],
    arrives: 'v0.3.0',
    description: 'Membuat, mengubah, dan menghapus akun untuk role di bawah Anda.',
  },
  {
    id: 'roles',
    label: 'Role & Akses',
    icon: 'shield',
    group: 'Administrasi',
    perm: ['roles'],
    arrives: 'v0.3.0',
    description: 'Hirarki role dan pengaturan hak akses.',
  },
  {
    id: 'resets',
    label: 'Permintaan Reset',
    icon: 'key',
    group: 'Administrasi',
    perm: ['resets'],
    arrives: 'v0.3.0',
    description: 'Permintaan reset password beserta siapa yang mengeksekusi dan kapan.',
  },
  {
    id: 'employees',
    label: 'Database Karyawan',
    icon: 'id',
    group: 'Administrasi',
    perm: ['employees'],
    arrives: 'v0.8.0',
    description: 'Data karyawan yang terhubung dengan profil pengguna.',
  },
  {
    id: 'backup',
    label: 'Cadangan & Kuota',
    icon: 'shield',
    group: 'Administrasi',
    perm: ['audit'],
    arrives: 'v0.9.0',
    description: 'Status cadangan ke Google Sheets dan pemakaian kuota harian Firestore.',
  },
  {
    id: 'audit',
    label: 'Log Audit',
    icon: 'log',
    group: 'Administrasi',
    perm: ['audit'],
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

export function findRoute(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id)
}

/** Penjaga rute dasar berdasarkan izin role. Penegakan sesungguhnya ada di Firestore Rules dan Worker. */
export function canAccess(route: RouteDef, perms: ReadonlySet<string>): boolean {
  return !route.perm || route.perm.some((p) => perms.has(p))
}

export function accessibleRoutes(perms: ReadonlySet<string>): RouteDef[] {
  return ROUTES.filter((r) => canAccess(r, perms))
}
