# Panduan Pengguna — WKN Group Data Hub

> Versi lengkap bergambar, tutorial impor/ekspor, dan cara mengisi template: [`manual/MANUAL-BOOK.pdf`](manual/MANUAL-BOOK.pdf). Di dalam aplikasi, menu **Panduan** menyesuaikan isinya dengan role Anda.

Alamat: https://wkngroup-datahub.web.app · Cara masuk: username dan password, atau **Login Google** (bila email Anda terdaftar), atau **sidik jari / wajah** (bila diaktifkan di perangkat).
Aplikasi tidak keluar sendiri (tanpa auto-logout). Tombol **Keluar** ada di pojok kanan atas.

## Untuk semua pengguna
- **Profil Saya** (menu paling bawah): ubah nama, no. HP, email, dan **password** (butuh password lama). Aktifkan login biometrik di sini juga. Lupa password? Di halaman login tekan *Lupa password*; atasan Anda akan mengatur ulang dan Anda diberi password baru.
- **Tema terang/gelap** di bilah atas. Aplikasi nyaman di ponsel, tablet, dan komputer.
- Setiap yang Anda catat tersimpan dengan **nama Anda dan waktu (WITA)**; tidak bisa diubah atau dihapus, hanya dikoreksi.

---

## Admin Logistik / Gudang
Tugas: mencatat barang masuk dan keluar di proyek Anda.
1. Menu **Transaksi Stok** → pilih proyek, bulan, (barang) → **Catat transaksi**.
2. Pilih barang, **Barang masuk** atau **Barang keluar**, jumlah, tanggal, keterangan → **Catat**.
3. Aturan yang perlu diingat:
   - Stok **tidak boleh negatif**; bila jumlah keluar melebihi stok, aplikasi menolak dan menyebut batas maksimal.
   - Tanggal tidak boleh **sebelum saldo awal** dan tidak boleh **di masa depan**.
   - Dalam satu hari, barang **masuk dihitung lebih dulu** daripada keluar.
   - Jaringan putus saat menekan Catat? Tekan lagi: transaksi **tidak akan tercatat dua kali**.
4. Salah input? Minta Manajer Proyek memakai **Koreksi** (Anda tidak punya tombol Koreksi).
5. **Dashboard** menampilkan stok per barang, status Kritis/Menipis, dan grafik. **Impor / Ekspor** untuk mengunduh laporan Excel/PDF.

## Manajer Proyek
Semua tugas Admin Logistik, ditambah:
1. **Koreksi**: di Transaksi Stok, tombol *Koreksi* pada baris yang salah → isi alasan → *Buat koreksi*. Transaksi asli tetap tampil bertanda "Sudah dikoreksi"; satu transaksi hanya bisa dikoreksi sekali. Membalik barang masuk yang sudah terpakai ditolak.
2. **Akun Pengguna**: membuat akun Admin Logistik untuk proyek Anda (pilih proyek, wajib minimal satu), menonaktifkan, mengatur ulang password.
3. **Permintaan Reset**: mengeksekusi permintaan reset password dari bawahan; password baru diberikan langsung ke yang bersangkutan.
4. **Impor / Ekspor**: impor transaksi dari Excel (unduh template, isi, periksa pratinjau, impor). Baris yang salah ditandai dan tidak diimpor.
5. Anda hanya melihat proyek dan akun yang ditugaskan kepada Anda.

## Direktur
1. **Dashboard** semua proyek (atau pilih satu); **Perbandingan antar proyek**; **Segarkan** untuk data terbaru (data disimpan 5 menit demi menghemat kuota).
2. **Akun Pengguna** dan **Role & Akses**: membuat akun, menugaskan proyek, mengatur izin role di bawah level Anda.
3. **Katalog Barang**: menambah barang baku; menghapus barang yang tidak dipakai proyek mana pun.
4. **Proyek & Perusahaan**: menambah dan mengubah perusahaan/proyek (menghapus permanen hanya Owner/Developer).
5. **Database Karyawan**, **Log Audit**, **Cadangan & Kuota**: lihat/cari data karyawan; telusuri siapa melakukan apa dan kapan; pantau cadangan Sheets dan kuota harian.
6. **Impor / Ekspor**: impor katalog dan saldo awal proyek dari Excel (template terisi), ekspor laporan.

## Owner
Semua yang dilakukan Direktur, ditambah:
- **Menghapus proyek atau perusahaan secara permanen** (membersihkan data uji): menu *Proyek & Perusahaan* → **Hapus**. Aplikasi menampilkan akibatnya (barang, transaksi, akun terdampak), meminta Anda **mengetik ulang namanya**, lalu menghapus bertahap. **Tidak dapat dibatalkan.** Cadangan Sheets dan Log Audit tidak ikut terhapus. Lakukan *Cadangkan sekarang* dulu bila itu data nyata.
- Mengatur role di bawah Anda dan menugaskan akun ke semua proyek.

## Developer
Semua yang dilakukan Owner. Developer juga menyiapkan sistem (deploy, rahasia, indeks) dan memegang akun cadangan; lihat [`RUNBOOK.md`](RUNBOOK.md).

---

## Alur kerja harian (ringkas)
1. **Gudang** mencatat barang masuk/keluar hari itu.
2. **Manajer Proyek** memeriksa Transaksi Stok dan Dashboard, mengoreksi bila ada salah catat.
3. **Direktur/Owner** memantau Dashboard (stok kritis, pemakaian) dan Log Audit.
4. **Otomatis** tiap pukul 03:00 WITA: cadangan ke Google Sheets.

## Pertanyaan yang sering muncul
| Pertanyaan | Jawaban |
|---|---|
| Tombol *Catat transaksi* tidak aktif | Barang belum punya saldo awal. Minta Manajer/Direktur mengisi saldo awal (Proyek & Perusahaan → proyek → Atur saldo awal). |
| "Stok tidak cukup" | Jumlah keluar melebihi stok pada tanggal itu atau sesudahnya. Periksa jumlah dan tanggal. |
| "Sedang dicatat pengguna lain" | Barang yang sama dicatat bersamaan. Tunggu beberapa detik dan ulangi. |
| Lupa password | Halaman login → *Lupa password*; atasan mengatur ulang. |
| Saya tidak melihat sebuah proyek | Anda belum ditugaskan. Minta atasan menugaskan lewat Akun Pengguna → Ubah → Proyek. |
| Ingin mengganti nama/HP/email | Profil Saya. Email juga dipakai Login Google dan harus unik. |
