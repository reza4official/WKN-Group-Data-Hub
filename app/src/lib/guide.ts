/**
 * Isi Panduan: dibangun dari data, disaring oleh izin dan level akun SAAT INI, sehingga otomatis mengikuti perubahan
 * role dan izinnya. Setiap bagian menyebut izin yang dibutuhkan; bagian yang tidak boleh dipakai akun ini dipisahkan
 * beserta petunjuk meminta kepada siapa. Tes memastikan semua menu aplikasi tercakup dan semua target petunjuk masih ada.
 */
import type { IconName } from '../components/Icon'
import { PERMISSION_LABELS } from './permissions'

export interface Ctx {
  perms: ReadonlySet<string>
  level: number
  projectIds: string[]
  roleName: string
}
export interface Need {
  label: string
  ok: (c: Ctx) => boolean
}
export interface GuideStep {
  text: string
  /** Pemilih CSS elemen yang ditunjuk tombol "Tunjukkan". */
  target?: string
  /** Halaman (hash) yang dibuka sebelum menunjuk. */
  route?: string
  /** Nomor tanda pada gambar. */
  mark?: number
}
export type GroupName = 'Dasar' | 'Stok' | 'Data' | 'Administrasi' | 'Bantuan'
export interface GuideSection {
  id: string
  title: string
  group: GroupName
  icon: IconName
  route?: string
  summary: string
  needs: Need[]
  /** Hambatan praktis walau izin ada (mis. belum ditugaskan ke proyek). */
  warn?: (c: Ctx) => string | null
  steps: (c: Ctx) => GuideStep[]
  rules?: (c: Ctx) => string[]
  tips?: (c: Ctx) => string[]
  shots?: string[]
  /** Kepada siapa meminta bila akun ini tidak punya akses. */
  askWho: string
}

const has = (k: string): Need => ({ label: PERMISSION_LABELS[k] ?? k, ok: (c) => c.perms.has(k) })
const level = (n: number, label: string): Need => ({ label, ok: (c) => c.level >= n })
const assigned = (c: Ctx) => c.perms.has('projects') || c.projectIds.length > 0
const noProject = (c: Ctx) =>
  assigned(c)
    ? null
    : 'Akun Anda belum ditugaskan ke proyek mana pun, jadi fitur ini belum dapat dipakai. Minta atasan menugaskan Anda (Akun Pengguna → Ubah → Proyek).'

export const SECTIONS: GuideSection[] = [
  {
    id: 'mulai',
    title: 'Masuk dan mengenal tampilan',
    group: 'Dasar',
    icon: 'user',
    route: 'dashboard',
    summary: 'Cara masuk, membaca menu samping, dan berpindah halaman. Berlaku untuk semua akun.',
    needs: [],
    shots: ['login', 'mulai'],
    steps: (c) => [
      {
        text: 'Buka https://wkngroup-datahub.web.app. Isi **Username** dan **Password**, lalu tekan **Masuk**.',
        mark: 3,
      },
      {
        text: 'Bisa juga **Login Google** (bila email Google Anda terdaftar sebagai email kontak akun) atau **sidik jari / wajah** (setelah diaktifkan di Profil Saya).',
      },
      {
        text:
          'Menu di sisi kiri hanya memuat halaman yang boleh Anda buka. Akun Anda sekarang melihat menu sesuai role **' +
          c.roleName +
          '**.',
        target: '.nav',
        mark: 1,
      },
      {
        text: 'Nama dan role Anda ada di bagian bawah menu. Tombol **Keluar** ada di sebelahnya.',
        target: '.me',
        mark: 2,
      },
      {
        text: 'Di ponsel, tekan ikon garis tiga di kiri atas untuk membuka menu. Tema terang/gelap diganti dari bilah atas.',
      },
    ],
    rules: () => [
      'Aplikasi **tidak keluar sendiri** (tanpa auto-logout). Tekan Keluar bila memakai perangkat bersama.',
      'Satu-satunya aturan password: minimal 6 karakter.',
      'Versi aplikasi tampil di footer (mis. v1.0.0).',
    ],
    askWho: 'Semua akun mendapat bagian ini.',
  },
  {
    id: 'akses',
    title: 'Akses akun Anda',
    group: 'Dasar',
    icon: 'shield',
    summary: 'Role, level, izin, dan proyek akun Anda. Panduan ini menyesuaikan diri dengan semuanya.',
    needs: [],
    steps: (c) => [
      {
        text: `Role Anda: **${c.roleName}** (level ${c.level}). Level menentukan siapa yang dapat mengelola siapa: Anda hanya dapat mengelola akun yang levelnya **di bawah** level Anda.`,
      },
      {
        text: c.perms.has('projects')
          ? 'Anda memegang izin **proyek**, jadi melihat dan mengelola **semua** proyek.'
          : `Anda ditugaskan ke **${c.projectIds.length}** proyek. Anda hanya melihat dan bekerja di proyek itu.`,
      },
      {
        text: 'Daftar izin Anda ada di tabel "Izin Anda" di bawah. Bagian panduan di halaman ini muncul atau hilang mengikutinya.',
      },
      {
        text: 'Bila Owner/Direktur mengubah izin role Anda, **buka ulang halaman Panduan ini** (atau muat ulang aplikasi): panduan membaca izin terbaru dari server.',
      },
    ],
    tips: () => [
      'Merasa kurang akses? Lihat di bagian "Tidak tersedia untuk akun Anda" siapa yang dapat membantu.',
    ],
    askWho: 'Semua akun mendapat bagian ini.',
  },
  {
    id: 'profil',
    title: 'Profil, password, dan login biometrik',
    group: 'Dasar',
    icon: 'user',
    route: 'profil',
    summary: 'Mengubah data diri, mengganti password, dan mengaktifkan sidik jari/wajah.',
    needs: [],
    shots: ['profil'],
    steps: () => [
      {
        text: 'Buka **Profil Saya**. Ubah nama, no. HP, atau email, lalu tekan **Simpan perubahan**.',
        route: 'profil',
        target: '#pf-name',
        mark: 1,
      },
      {
        text: 'Tombol Simpan baru aktif setelah ada perubahan.',
        route: 'profil',
        target: '[data-guide=pf-save]',
        mark: 2,
      },
      {
        text: 'Untuk **ganti password**: isi password lama, password baru, dan ulangi, lalu **Ganti password**. Anda tetap masuk.',
        route: 'profil',
        target: '[data-guide=pf-password]',
        mark: 3,
      },
      {
        text: 'Untuk **login biometrik**: tekan **Aktifkan di perangkat ini** (hanya tampil di perangkat yang mendukung) lalu verifikasi dengan sidik jari, wajah, atau kunci layar.',
        route: 'profil',
        target: '[data-guide=pf-bio]',
      },
    ],
    rules: () => [
      'Email kontak juga dipakai untuk **Login Google** dan harus unik; email yang dipakai akun lain ditolak.',
      'Username dan role tidak dapat diubah di sini; hubungi atasan.',
      'Nama, HP, dan email Anda langsung tampil di Database Karyawan.',
    ],
    askWho: 'Semua akun mendapat bagian ini.',
  },
  {
    id: 'transaksi',
    title: 'Mencatat barang masuk dan keluar',
    group: 'Stok',
    icon: 'swap',
    route: 'inventory',
    summary: 'Pencatatan harian stok per proyek. Setiap catatan menyimpan nama Anda dan waktunya.',
    needs: [has('inventory.write')],
    warn: noProject,
    shots: ['inventory', 'inventory-catat'],
    steps: (c) => [
      {
        text: 'Buka **Transaksi Stok**, pilih **proyek** dan **bulan**.',
        route: 'inventory',
        target: '#inv-project',
        mark: 1,
      },
      { text: 'Tekan **Catat transaksi**.', route: 'inventory', target: '[data-guide=inv-catat]', mark: 3 },
      {
        text: 'Pilih **barang** (hanya barang yang sudah punya saldo awal), **Barang masuk** atau **Barang keluar**, isi **jumlah**, **tanggal**, dan keterangan (opsional), lalu **Catat**.',
      },
      {
        text: 'Baris baru muncul di tabel dengan kolom **Tersisa** yang dihitung otomatis dan nama Anda di **Dicatat oleh**.',
        target: '[aria-label="Transaksi stok"]',
        mark: 4,
      },
      c.perms.has('inventory.correct')
        ? { text: 'Salah catat? Tekan **Koreksi** pada barisnya (lihat bagian "Mengoreksi transaksi").' }
        : { text: 'Salah catat? Anda tidak punya tombol Koreksi; minta Manajer Proyek mengoreksinya.' },
    ],
    rules: () => [
      'Stok **tidak boleh negatif** pada tanggal mana pun; aplikasi menolak dan menyebut batas maksimal.',
      'Tanggal tidak boleh **sebelum saldo awal** dan tidak boleh **di masa depan** (menurut WITA).',
      'Dalam satu hari, barang **masuk dihitung lebih dulu** daripada barang keluar.',
      'Jumlah maksimal 3 angka desimal. Catatan tidak dapat diubah atau dihapus, hanya dikoreksi.',
      'Jaringan putus saat menekan Catat? Tekan lagi: transaksi **tidak tercatat dua kali**.',
    ],
    tips: () => [
      'Pesan "sedang dicatat pengguna lain" berarti barang yang sama dicatat bersamaan; tunggu beberapa detik lalu ulangi.',
      'Tombol Catat nonaktif bila belum ada barang bersaldo awal di proyek itu.',
    ],
    askWho:
      'Minta Owner/Direktur menambahkan izin "Catat barang masuk/keluar" pada role Anda, atau minta Admin Logistik/Manajer Proyek mencatatkannya.',
  },
  {
    id: 'lihat-stok',
    title: 'Melihat transaksi dan stok',
    group: 'Stok',
    icon: 'swap',
    route: 'inventory',
    summary: 'Membaca buku transaksi per proyek, bulan, dan barang.',
    needs: [has('inventory.read')],
    warn: noProject,
    shots: ['inventory'],
    steps: () => [
      {
        text: 'Buka **Transaksi Stok**. Pilih **proyek**, **bulan**, dan (opsional) **barang**.',
        route: 'inventory',
        target: '#inv-project',
        mark: 1,
      },
      {
        text: 'Baris pertama bulan saldo awal adalah **Saldo awal**. Kolom **Tersisa** berjalan dari saldo itu.',
        route: 'inventory',
        target: '[aria-label="Transaksi stok"]',
        mark: 4,
      },
      {
        text: 'Baris bertanda **Koreksi** membalik transaksi yang salah; transaksi aslinya bertanda "Sudah dikoreksi". Total di kaki tabel dihitung **setelah koreksi**.',
      },
    ],
    rules: () => ['Anda hanya melihat proyek yang ditugaskan kepada Anda (kecuali berizin semua proyek).'],
    askWho: 'Minta Owner/Direktur menambahkan izin "Lihat transaksi inventory".',
  },
  {
    id: 'koreksi',
    title: 'Mengoreksi transaksi',
    group: 'Stok',
    icon: 'swap',
    route: 'inventory',
    summary: 'Memperbaiki salah catat dengan entri pembalik, tanpa mengubah catatan asli.',
    needs: [has('inventory.correct')],
    warn: noProject,
    shots: ['inventory'],
    steps: () => [
      {
        text: 'Di **Transaksi Stok**, cari barisnya lalu tekan **Koreksi**.',
        route: 'inventory',
        target: '[data-guide=inv-koreksi]',
        mark: 5,
      },
      { text: 'Isi **alasan koreksi** (wajib, minimal 3 karakter), lalu **Buat koreksi**.' },
      { text: 'Muncul baris koreksi baru; transaksi asli tetap tampil bertanda "Sudah dikoreksi".' },
    ],
    rules: () => [
      'Satu transaksi hanya dapat dikoreksi **sekali**; baris koreksi tidak dapat dikoreksi lagi.',
      'Membalik barang **masuk** ditolak bila stok sesudah tanggal itu sudah terpakai (akan menjadi negatif).',
      'Alasan dan pelakunya tercatat di Log Audit.',
    ],
    askWho: 'Minta Manajer Proyek atau Owner/Direktur melakukan koreksi.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard ringkasan',
    group: 'Stok',
    icon: 'dash',
    route: 'dashboard',
    summary: 'Ringkasan stok per barang dan proyek: masuk, keluar, sisa, pemakaian, status, dan grafik.',
    needs: [has('dashboard')],
    warn: noProject,
    shots: ['dashboard'],
    steps: (c) => [
      {
        text: c.perms.has('projects') ? 'Pilih **Semua proyek** atau satu proyek.' : 'Pilih proyek Anda.',
        route: 'dashboard',
        target: '#dash-scope',
        mark: 1,
      },
      { text: 'Pilih **bulan**.', route: 'dashboard', target: '#dash-month', mark: 2 },
      {
        text: 'Tekan **Segarkan** untuk memuat ulang sekarang (data disimpan 5 menit demi menghemat kuota baca).',
        route: 'dashboard',
        target: '[data-guide=dash-refresh]',
        mark: 3,
      },
      {
        text: 'Kartu di atas: jumlah jenis barang, transaksi bulan ini, **stok kritis**, dan barang **tidak bergerak**.',
        route: 'dashboard',
        target: '.kpis',
        mark: 4,
      },
      {
        text: 'Tabel per barang: **Awal, Masuk, Keluar, Sisa**, perbandingan laju pemakaian dengan bulan lalu, persentase pemakaian, perkiraan hari stok, dan **Status**. Klik nama barang untuk grafik 30 hari dan 6 bulan.',
        route: 'dashboard',
        target: '[aria-label="Ringkasan per barang"]',
        mark: 5,
      },
    ],
    rules: () => [
      '**Kritis** = sisa ≤ batas minimum; **Menipis** = sisa ≤ 1,5 × batas minimum; **Tidak bergerak** = tanpa transaksi 14 hari atau lebih.',
      'Angka sudah memperhitungkan koreksi.',
    ],
    askWho: 'Minta Owner/Direktur menambahkan izin "Lihat dashboard ringkasan".',
  },
  {
    id: 'ekspor',
    title: 'Ekspor laporan Excel dan PDF',
    group: 'Data',
    icon: 'xls',
    route: 'io',
    summary: 'Mengunduh transaksi dan ringkasan per barang, berkop logo dan waktu cetak.',
    needs: [has('export')],
    shots: ['io'],
    steps: () => [
      {
        text: 'Buka **Impor / Ekspor**, pilih **proyek** dan **bulan**, centang isi berkas (Transaksi dan/atau Ringkasan).',
        route: 'io',
        target: '#io-project',
        mark: 1,
      },
      {
        text: 'Tekan **Excel (.xlsx)** atau **PDF**. Berkas terunduh dengan nama pembuat dan waktu cetak (WITA) di bagian atas.',
        route: 'io',
        target: '[data-guide=io-xlsx]',
        mark: 2,
      },
    ],
    tips: () => ['Berkas dibuat di perangkat Anda; tidak ada data yang dikirim keluar.'],
    askWho: 'Minta Owner/Direktur menambahkan izin "Ekspor Excel/PDF".',
  },
  {
    id: 'impor-transaksi',
    title: 'Impor transaksi dari Excel',
    group: 'Data',
    icon: 'xls',
    route: 'io',
    summary: 'Memasukkan banyak transaksi sekaligus (mis. riwayat lama) dengan pratinjau validasi.',
    needs: [has('import'), has('inventory.write')],
    warn: noProject,
    shots: ['io'],
    steps: () => [
      {
        text: 'Di **Impor / Ekspor**, pilih **proyek** lalu **Jenis impor: Transaksi stok**.',
        route: 'io',
        target: '#io-kind',
        mark: 4,
      },
      {
        text: 'Tekan **Unduh template Excel**. Lembar *Contoh Pengisian* memperlihatkan isian yang benar dan salah.',
        route: 'io',
        target: '[data-guide=io-template]',
        mark: 5,
      },
      {
        text: 'Isi lembar *Transaksi* (Tanggal `YYYY-MM-DD`, Nama Barang, Jenis Masuk/Keluar, Jumlah, Keterangan), simpan sebagai .xlsx, lalu **unggah**.',
        route: 'io',
        target: '#io-file',
      },
      {
        text: 'Periksa **pratinjau**: baris merah memuat alasan dan tidak diimpor. Tekan **Impor N baris valid**.',
      },
    ],
    rules: () => [
      'Maksimal 2 MB dan 3.000 baris per berkas; hanya .xlsx.',
      'Barang masuk dalam berkas diproses lebih dulu, lalu keluar menurut tanggal; keluar yang membuat stok negatif ditolak dengan alasan, baris lain tetap masuk.',
      'Kegagalan jaringan: tekan Impor lagi; baris yang sudah masuk dilewati (tidak ganda).',
    ],
    askWho: 'Minta Owner/Direktur menambahkan izin "Impor Excel" dan "Catat barang masuk/keluar".',
  },
  {
    id: 'impor-katalog',
    title: 'Impor katalog barang',
    group: 'Data',
    icon: 'xls',
    route: 'io',
    summary: 'Mengisi katalog baku dari Excel.',
    needs: [has('import'), has('catalog')],
    shots: ['io'],
    steps: () => [
      {
        text: 'Di **Impor / Ekspor**, pilih **Jenis impor: Katalog barang** lalu **Unduh template Excel**.',
        route: 'io',
        target: '#io-kind',
        mark: 4,
      },
      {
        text: 'Isi Nama Barang, Satuan, Kategori, dan Batas Minimum, lalu unggah dan periksa pratinjau.',
        route: 'io',
        target: '#io-file',
      },
      { text: 'Tekan **Impor N baris valid**. Nama yang sudah ada di katalog ditolak, baris lain masuk.' },
    ],
    rules: () => [
      'Nama barang unik di seluruh grup (huruf besar/kecil tidak dibedakan).',
      'Satuan tidak dapat diganti setelah barang dipakai proyek.',
    ],
    askWho: 'Minta Owner/Direktur.',
  },
  {
    id: 'impor-saldo',
    title: 'Impor saldo awal proyek',
    group: 'Data',
    icon: 'xls',
    route: 'io',
    summary: 'Memasukkan barang katalog ke proyek beserta saldo awalnya dari Excel.',
    needs: [
      has('import'),
      {
        label: 'Izin proyek, atau catat transaksi di proyek yang ditugaskan',
        ok: (c) => c.perms.has('projects') || (c.perms.has('inventory.write') && c.projectIds.length > 0),
      },
    ],
    shots: ['io'],
    steps: () => [
      {
        text: 'Pilih **proyek**, lalu **Jenis impor: Saldo awal proyek** dan **Unduh template Excel**.',
        route: 'io',
        target: '#io-kind',
        mark: 4,
      },
      {
        text: 'Template sudah terisi nama barang katalog yang belum ada di proyek. Isi **Saldo Awal** dan **Tanggal** untuk yang diinginkan; baris kosong dilewati.',
        route: 'io',
        target: '[data-guide=io-template]',
        mark: 5,
      },
      { text: 'Unggah, periksa pratinjau, lalu **Impor**. Barang langsung dapat menerima transaksi.' },
    ],
    rules: () => [
      'Barang yang sudah ada di proyek tidak ditimpa.',
      'Barang yang belum ada di katalog harus diimpor ke katalog dulu.',
    ],
    askWho: 'Minta Owner/Direktur.',
  },
  {
    id: 'katalog',
    title: 'Mengelola katalog barang',
    group: 'Data',
    icon: 'tag',
    route: 'catalog',
    summary: 'Daftar baku barang dan satuannya, dipakai bersama semua proyek.',
    needs: [has('catalog')],
    shots: ['catalog'],
    steps: () => [
      {
        text: 'Buka **Katalog Barang**. Cari barang dengan kotak pencarian.',
        route: 'catalog',
        target: '[aria-label="Cari barang"]',
        mark: 1,
      },
      {
        text: 'Tekan **Tambah barang**: isi nama, satuan, kategori, dan batas minimum bawaan.',
        route: 'catalog',
        target: '[data-guide=catalog-add]',
        mark: 2,
      },
      {
        text: '**Ubah** untuk memperbaiki data; ikon **sampah** menghapus barang yang tidak dipakai proyek mana pun.',
      },
    ],
    rules: () => [
      'Nama harus unik; barang yang sudah dipakai proyek tidak dapat dinonaktifkan atau diganti satuannya.',
      'Menghapus barang bersifat permanen; namanya dapat dipakai lagi.',
    ],
    askWho: 'Minta Owner/Direktur menambahkan barang atau izin "Kelola katalog barang".',
  },
  {
    id: 'proyek',
    title: 'Perusahaan, proyek, dan saldo awal',
    group: 'Data',
    icon: 'build',
    route: 'projects',
    summary: 'Menambah perusahaan dan proyek, lalu menyiapkan barang proyek dan saldo awalnya.',
    needs: [has('projects')],
    shots: ['projects'],
    steps: () => [
      {
        text: 'Buka **Proyek & Perusahaan**. Tekan **Tambah perusahaan** (induk dulu, lalu anak).',
        route: 'projects',
        target: '[data-guide=projects-add-company]',
        mark: 1,
      },
      {
        text: 'Tekan **Tambah proyek**: nama, lokasi, tanggal mulai.',
        route: 'projects',
        target: '[data-guide=projects-add-project]',
        mark: 2,
      },
      {
        text: 'Buka **Barang & saldo awal** pada proyek: **Tambah barang** dari katalog, isi **saldo awal dan tanggalnya**, atau atur batas minimum.',
        route: 'projects',
        target: '.li a.btn',
        mark: 3,
      },
    ],
    rules: () => [
      'Barang tanpa saldo awal belum dapat menerima transaksi.',
      'Saldo awal terkunci setelah barang punya transaksi.',
      'Proyek dan perusahaan dinonaktifkan, bukan dihapus, kecuali memakai fitur Hapus permanen (Owner/Developer).',
    ],
    askWho:
      'Minta Owner/Direktur. Akun yang ditugaskan ke proyek dengan izin catat transaksi juga dapat mengisi saldo awal di proyeknya.',
  },
  {
    id: 'hapus-data-uji',
    title: 'Menghapus proyek atau perusahaan (data uji)',
    group: 'Data',
    icon: 'trash',
    route: 'projects',
    summary: 'Membersihkan data uji secara permanen. Tidak dapat dibatalkan.',
    needs: [has('projects'), level(90, 'Level Owner atau Developer (≥ 90)')],
    shots: ['projects'],
    steps: () => [
      {
        text: 'Di **Proyek & Perusahaan**, tekan **Hapus** pada proyek atau perusahaan.',
        route: 'projects',
        target: '[data-guide=projects-delete]',
        mark: 4,
      },
      { text: 'Baca akibatnya (jumlah barang, transaksi, akun terdampak, status cadangan terakhir).' },
      {
        text: 'Ketik **nama persis** untuk mengonfirmasi, lalu **Hapus permanen**. Proyek besar dihapus bertahap dengan kemajuan.',
      },
    ],
    rules: () => [
      'Hapus perusahaan ikut menghapus **semua proyeknya**.',
      'Log Audit dan isi Google Sheet cadangan **tidak** ikut terhapus. Jalankan *Cadangkan sekarang* dulu bila ini data nyata.',
      'Terputus di tengah jalan? Proyek tampil "Sedang dihapus" dengan tombol **Lanjutkan hapus**. Kuota hapus harian gratis ±20.000 dokumen.',
    ],
    askWho: 'Hanya Owner dan Developer yang dapat menghapus.',
  },
  {
    id: 'akun',
    title: 'Mengelola akun pengguna',
    group: 'Administrasi',
    icon: 'users',
    route: 'users',
    summary: 'Membuat, mengubah, menonaktifkan, menghapus akun, dan mengatur ulang password bawahan.',
    needs: [has('users')],
    shots: ['users'],
    steps: (c) => [
      {
        text:
          'Buka **Akun Pengguna**. Anda melihat akun **di bawah level ' +
          c.level +
          '**' +
          (c.perms.has('projects') ? '.' : ' yang berbagi proyek dengan Anda.'),
        route: 'users',
        target: '[aria-label="Cari akun"]',
        mark: 1,
      },
      {
        text:
          'Tekan **Tambah akun**: username, nama, password awal, role, dan **proyek** (' +
          (c.perms.has('projects') ? 'opsional' : 'wajib minimal satu proyek Anda') +
          ').',
        route: 'users',
        target: '[data-guide=users-add]',
        mark: 2,
      },
      {
        text: 'Pada baris akun: **Ubah** (data, role, proyek), **Reset password**, **Nonaktifkan/Aktifkan**, atau ikon **sampah** (hapus akun).',
      },
    ],
    rules: (c) => [
      'Role yang dapat diberikan: levelnya **di bawah level Anda** dan izinnya **tidak melebihi izin Anda**.',
      c.perms.has('projects')
        ? 'Anda dapat menugaskan akun ke proyek mana pun.'
        : 'Anda hanya dapat menugaskan akun ke proyek Anda sendiri.',
      'Menonaktifkan akun mencabut sesinya; menghapus akun tidak dapat dibatalkan.',
    ],
    tips: () => ['Berikan password awal langsung kepada orangnya dan minta menggantinya di Profil Saya.'],
    askWho: 'Minta atasan Anda (Manajer Proyek, Direktur, atau Owner) membuatkan atau mengubah akun.',
  },
  {
    id: 'reset',
    title: 'Menangani permintaan reset password',
    group: 'Administrasi',
    icon: 'key',
    route: 'resets',
    summary: 'Mengatur password baru untuk bawahan yang lupa password.',
    needs: [has('resets')],
    steps: () => [
      {
        text: 'Buka **Permintaan Reset**. Anda melihat permintaan dari akun di bawah level Anda.',
        route: 'resets',
      },
      {
        text: 'Pada permintaan yang menunggu, tekan **Eksekusi reset**, ketik **password baru** (minimal 6 karakter), lalu **Simpan password baru**.',
      },
      { text: 'Berikan password baru langsung kepada orangnya. Pelaku dan waktu tercatat permanen.' },
    ],
    rules: () => [
      'Sesi lama dan passkey (biometrik) akun itu dicabut; orangnya perlu mengaktifkan ulang biometrik.',
    ],
    askWho: 'Minta atasan Anda mengatur ulang password.',
  },
  {
    id: 'role',
    title: 'Role dan hak akses',
    group: 'Administrasi',
    icon: 'shield',
    route: 'roles',
    summary: 'Mengatur izin tiap role dan membuat role baru.',
    needs: [has('roles')],
    shots: ['roles'],
    steps: () => [
      {
        text: 'Buka **Role & Akses**. Pilih role di daftar hirarki untuk melihat izinnya.',
        route: 'roles',
        target: '.rolerow',
        mark: 1,
      },
      {
        text: 'Centang atau cabut izin pada matriks; perubahan langsung tersimpan dan berlaku pada akun role itu **saat berikutnya mereka membuka aplikasi/panduan**.',
      },
      {
        text: 'Tekan **Role baru** untuk membuat role dengan level yang belum dipakai.',
        route: 'roles',
        target: '[data-guide=roles-new]',
        mark: 2,
      },
    ],
    rules: () => [
      'Anda hanya dapat mengubah role **di bawah level Anda** dan hanya dapat memberi izin yang **Anda sendiri miliki**.',
      'Role Developer terkunci. Level role dapat diubah di kolom **Level** (harus di bawah level Anda dan belum dipakai role lain; akun pemegang role ikut berubah). Role yang dipakai akun tidak dapat dihapus.',
    ],
    askWho: 'Minta Owner/Direktur atau Developer.',
  },
  {
    id: 'karyawan',
    title: 'Database karyawan',
    group: 'Administrasi',
    icon: 'id',
    route: 'employees',
    summary: 'Data semua akun beserta siapa yang terakhir mengubahnya.',
    needs: [has('employees')],
    shots: ['employees'],
    steps: () => [
      {
        text: 'Buka **Database Karyawan**. Cari berdasarkan nama, username, HP, atau email; saring menurut role, status, dan proyek.',
        route: 'employees',
        target: '[aria-label="Cari karyawan"]',
        mark: 1,
      },
      {
        text: 'Kolom **Terakhir diperbarui** menunjukkan pengubah dan waktunya (WITA). Perubahan di Profil Saya langsung tampil di sini.',
        route: 'employees',
        target: '[aria-label="Database karyawan"]',
        mark: 2,
      },
      {
        text: 'Tombol **Excel** dan **PDF** (bila Anda berizin ekspor) mengunduh data yang sedang tersaring.',
      },
    ],
    askWho: 'Minta Owner/Direktur.',
  },
  {
    id: 'audit',
    title: 'Log audit',
    group: 'Administrasi',
    icon: 'log',
    route: 'audit',
    summary: 'Catatan permanen siapa melakukan apa dan kapan.',
    needs: [has('audit')],
    shots: ['audit'],
    steps: () => [
      {
        text: 'Buka **Log Audit**. Cari pelaku, aksi, atau target.',
        route: 'audit',
        target: '[aria-label="Cari log"]',
        mark: 1,
      },
      {
        text: 'Setiap baris: waktu (WITA), pelaku, aksi, target, dan rincian (sebelum/sesudah untuk perubahan).',
        route: 'audit',
        target: '[aria-label="Log audit"]',
        mark: 2,
      },
    ],
    rules: () => [
      'Catatan hanya bisa bertambah: tidak ada yang dapat mengubah atau menghapusnya, termasuk saat data proyek dihapus.',
      'Password tidak pernah tercatat.',
    ],
    askWho: 'Minta Owner/Direktur.',
  },
  {
    id: 'cadangan',
    title: 'Cadangan Sheets dan kuota harian',
    group: 'Administrasi',
    icon: 'shield',
    route: 'backup',
    summary: 'Memantau cadangan otomatis ke Google Sheets dan pemakaian kuota gratis Firestore.',
    needs: [has('audit')],
    shots: ['backup'],
    steps: () => [
      {
        text: 'Buka **Cadangan & Kuota**. Status terakhir, waktu berhasil, dan jumlah baris per lembar tampil di bagian atas.',
        route: 'backup',
      },
      {
        text: 'Tekan **Cadangkan sekarang** untuk menjalankan segera (jeda 5 menit antar-permintaan). Otomatis berjalan tiap pukul 03:00 WITA.',
        route: 'backup',
        target: '[data-guide=backup-run]',
        mark: 1,
      },
      {
        text: 'Bagian **Kuota Firestore hari ini** menampilkan persentase baca/tulis/hapus. Bilah peringatan muncul di atas halaman pada 80% dan 95%.',
      },
    ],
    rules: () => [
      'Hari kuota berganti tengah malam waktu **Pasifik**, bukan WITA.',
      'Cadangan bukan sumber kebenaran dan tidak memuat password.',
    ],
    askWho: 'Minta Owner/Direktur.',
  },
  {
    id: 'bantuan',
    title: 'Masalah yang sering muncul',
    group: 'Bantuan',
    icon: 'alert',
    summary: 'Pesan umum dan cara mengatasinya.',
    needs: [],
    steps: () => [
      {
        text: '**"Stok tidak cukup"**: jumlah keluar melebihi stok pada tanggal itu atau sesudahnya. Periksa jumlah dan tanggal.',
      },
      {
        text: '**"Tanggal sebelum saldo awal"**: transaksi tidak boleh lebih awal dari tanggal saldo awal barang di proyek itu.',
      },
      { text: '**Tombol Catat transaksi nonaktif**: belum ada barang bersaldo awal di proyek itu.' },
      {
        text: '**Proyek tidak tampil**: Anda belum ditugaskan. Minta atasan menugaskan lewat Akun Pengguna.',
      },
      { text: '**Lupa password**: di halaman masuk tekan **Lupa password**; atasan akan mengatur ulang.' },
      { text: '**Halaman lama/versi lama**: muat ulang dengan **Ctrl+F5**.' },
      {
        text: '**"Akses ditolak"**: akun Anda tidak berizin untuk halaman itu. Lihat "Tidak tersedia untuk akun Anda".',
      },
    ],
    askWho: 'Semua akun mendapat bagian ini.',
  },
]

export function isAvailable(s: GuideSection, c: Ctx): boolean {
  return s.needs.every((n) => n.ok(c))
}

export interface GuideView {
  available: GuideSection[]
  unavailable: GuideSection[]
}
/** Membagi bagian panduan menjadi yang dapat dipakai akun ini dan yang tidak (dengan petunjuk meminta akses). */
export function buildGuide(c: Ctx): GuideView {
  return {
    available: SECTIONS.filter((s) => isAvailable(s, c)),
    unavailable: SECTIONS.filter((s) => !isAvailable(s, c)),
  }
}

export interface PermRow {
  key: string
  label: string
  granted: boolean
  allows: string
}
const ALLOWS: Record<string, string> = {
  dashboard: 'Menu Dashboard: ringkasan dan grafik stok.',
  'inventory.read': 'Menu Transaksi Stok: melihat buku transaksi.',
  'inventory.write': 'Mencatat barang masuk/keluar; impor saldo awal dan transaksi (bersama izin impor).',
  'inventory.correct': 'Tombol Koreksi pada transaksi.',
  catalog: 'Menu Katalog Barang: tambah, ubah, hapus barang tak terpakai; impor katalog.',
  projects:
    'Melihat dan mengelola SEMUA perusahaan dan proyek (Owner/Developer juga dapat menghapus permanen).',
  users: 'Menu Akun Pengguna: kelola akun di bawah level Anda.',
  roles: 'Menu Role & Akses: atur izin role di bawah Anda.',
  resets: 'Menu Permintaan Reset: atur ulang password bawahan.',
  employees: 'Menu Database Karyawan.',
  audit: 'Menu Log Audit dan Cadangan & Kuota.',
  export: 'Ekspor Excel/PDF.',
  import: 'Menu impor: transaksi, katalog, saldo awal (sesuai izin lain yang menyertai).',
}
/** Tabel "Izin Anda": setiap izin sistem, apakah dimiliki, dan apa yang dibukanya. */
export function permissionRows(c: Ctx): PermRow[] {
  return Object.keys(PERMISSION_LABELS).map((key) => ({
    key,
    label: PERMISSION_LABELS[key],
    granted: c.perms.has(key),
    allows: ALLOWS[key] ?? '',
  }))
}

/** Teks dengan **tebal** dan `kode` sederhana menjadi potongan untuk dirender tanpa HTML mentah. */
export function inline(text: string): { t: string; k: 'b' | 'code' | 'txt' }[] {
  const out: { t: string; k: 'b' | 'code' | 'txt' }[] = []
  const re = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), k: 'txt' })
    out.push(m[1] !== undefined ? { t: m[1], k: 'b' } : { t: m[2], k: 'code' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), k: 'txt' })
  return out
}

/** Pencarian: judul, ringkasan, dan teks langkah/aturan/tips. */
export function matches(s: GuideSection, c: Ctx, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    s.title,
    s.summary,
    ...s.steps(c).map((x) => x.text),
    ...(s.rules?.(c) ?? []),
    ...(s.tips?.(c) ?? []),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}
