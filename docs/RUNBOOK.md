# Runbook Operasional — WKN Group Data Hub

Untuk Developer/Owner. Semua perintah PowerShell dijalankan di folder repo. Tidak ada langkah di sini yang meminta Anda mengirim rahasia ke siapa pun.

## 1. Reset password (oleh atasan)
1. Menu **Permintaan Reset** → baris yang bersangkutan → **Eksekusi reset** → ketik password baru (min. 6 karakter) → simpan.
2. Berikan password baru langsung kepada orangnya. Sesi lama dan **passkey (biometrik)** akun itu dicabut otomatis; orangnya perlu mengaktifkan ulang biometrik.
3. Tanpa permintaan pun bisa: **Akun Pengguna → Reset password** pada akun di bawah level Anda.
4. Catatan *Reset password* tercatat di Log Audit (pelaku dan waktu).

## 2. Akun bermasalah
| Masalah | Tindakan |
|---|---|
| Akun harus berhenti masuk | Akun Pengguna → **Nonaktifkan** (sesi dicabut). Aktifkan lagi bila perlu. |
| Orang pindah proyek | Akun Pengguna → Ubah → Proyek. |
| Login Google "email belum terdaftar" | Email Google harus sama dengan **email kontak** di profil akun; minta atasan/orangnya mengisi di Profil Saya. |
| Login Google "ambigu" | Dua akun memakai email yang sama (tidak boleh terjadi): ubah salah satunya di Akun Pengguna. |
| Lupa akun Developer | Jalankan ulang `scripts/bootstrap-developer.mjs` hanya bila akun Developer benar-benar tidak ada; skrip menolak bila sudah ada. |

## 3. Cadangan Google Sheets
- **Berjalan otomatis** pukul 03:00 WITA. Status dan tombol **Cadangkan sekarang** ada di menu *Cadangan & Kuota*.
- **Status "Gagal"**: baca pesannya.
  - `unauthorized`: `BACKUP_SECRET` (Worker) ≠ properti `SECRET` (Apps Script). Samakan keduanya.
  - `format tak dikenal`: web app Apps Script bukan *Execute as: Me / Anyone*, atau URL salah. Terapkan ulang.
  - `SHEET_ID belum diatur`: isi properti skrip `SHEET_ID`.
- **Mengganti rahasia**: buat rahasia baru; perbarui properti `SECRET` di Apps Script **dan** `npx wrangler secret put BACKUP_SECRET`; tekan *Cadangkan sekarang*.
- **Memperbarui `Code.gs`**: tempel isi baru → **Terapkan → Kelola penerapan → Edit → Versi baru**.
- **PENTING — periksa Sheet yang sudah ada.** Versi cadangan sebelum v0.10.0 menulis lewat `setValues` biasa, yang dapat membuat Google Sheets menafsirkan ulang teks: **nomor HP "0812…" kehilangan 0 di depan** dan **tanggal "2026-09-10" menjadi nilai tanggal**. Buka Sheet Anda: kolom *No. HP* di lembar **Pengguna** dan kolom *Tanggal* di lembar **Transaksi**. Bila rusak:
  1. Perbarui `Code.gs` ke versi terbaru (di bawah v0.10.0 sudah memakai format teks biasa) dan terapkan **Versi baru**.
  2. Kosongkan isi lembar **Transaksi** dan **Audit** (biarkan baris judul).
  3. Firebase Console → Firestore → koleksi `system` → hapus dokumen `backup` (ini mengatur ulang kursor).
  4. Tekan **Cadangkan sekarang** (mungkin beberapa kali sampai status "Berhasil"; "Sebagian" berarti masih berlanjut).
- **Kuota "tidak tersedia"**: lihat Tahap 9 bagian "Pemantau kuota".

## 4. Memulihkan data dari cadangan
Cadangan memuat cukup data untuk membangun ulang: perusahaan, proyek, katalog, barang proyek (saldo awal), transaksi, role, pengguna (**tanpa password**), dan audit. **Tidak** memuat password, passkey, total harian/bulanan (dihitung ulang dari transaksi).

> **Status:** prosedur ini **belum diuji di Sheet dan Firebase produksi**. Skrip pemulihan otomatis belum ada; langkah berikut manual dan memakai fitur impor yang ada. Uji sekali di proyek percobaan sebelum Anda membutuhkannya.

Bila seluruh data hilang:
1. Siapkan proyek Firebase yang sama (Auth, Firestore, aturan, indeks) dan jalankan `scripts/bootstrap-developer.mjs` untuk akun Developer.
2. Dari Google Sheet: **File → Unduh → Microsoft Excel (.xlsx)**.
3. **Perusahaan dan proyek**: buat ulang lewat aplikasi (lembar *Perusahaan*, *Proyek*) — jumlahnya kecil.
4. **Katalog**: salin kolom *Nama, Satuan, Kategori, Batas minimum* dari lembar *Katalog* ke template **Impor Katalog**.
5. **Saldo awal**: dari lembar *Barang Proyek* (kolom *Saldo awal* dan *Tanggal saldo awal*) ke template **Impor Saldo Awal** per proyek.
6. **Transaksi**: dari lembar *Transaksi* (kolom *Tanggal, Barang, Jenis, Masuk/Keluar, Keterangan*) ke template **Impor Transaksi** per proyek.
   - **Lewati** proyek, perusahaan, dan barang yang punya catatan penghapusan di lembar **Audit** (*Hapus proyek (permanen)*, *Hapus perusahaan (permanen)*): cadangan tidak ikut terhapus saat Anda menghapus data uji, jadi data itu masih ada di Sheet.
   - **Koreksi** (jenis *koreksi*): impor hanya transaksi asli yang tidak punya pasangan koreksi, atau impor keduanya sebagai masuk/keluar bersih.
7. **Akun**: buat ulang lewat Akun Pengguna (daftar di lembar *Pengguna*); password baru diberikan ke masing-masing.
8. Cocokkan: stok per barang di Dashboard = kolom *Stok kini* di lembar *Barang Proyek* pada saat cadangan.

## 5. Hapus data uji (Owner/Developer)
Menu **Proyek & Perusahaan → Hapus**; barang katalog tak terpakai: **Katalog Barang → ikon sampah**. Akun uji: **Akun Pengguna → Hapus**.
- Tidak bisa dibatalkan. **Log Audit tidak ikut terhapus** (sengaja, hanya bisa bertambah) dan **cadangan Sheets tetap menyimpan salinannya**; bersihkan lembar Sheet secara manual bila perlu.
- Kuota hapus harian paket gratis ±20.000 dokumen. Bila habis, penghapusan berhenti dengan pesan dan dapat dilanjutkan besok ("Lanjutkan hapus").
- Proyek yang sedang dihapus tampil "Sedang dihapus" dan tidak bisa diubah atau diisi transaksi.

## 6. Deploy dan versi
Urutan: Worker → `firebase deploy --only firestore` → hosting. Setelah deploy, `/health` Worker harus sesuai versi di `CHANGELOG.md` dan footer aplikasi. Rinciannya per tahap ada di `docs/TAHAP-*-PENERAPAN.md`.
Rollback aplikasi: Firebase Console → Hosting → riwayat rilis → *Rollback*. Rollback Worker: `npx wrangler rollback`. Aturan Firestore: deploy ulang berkas `firestore.rules` versi lama dari git.

## 7. Pemantauan rutin (mingguan)
- *Cadangan & Kuota*: cadangan terakhir "Berhasil" dalam 24 jam; kuota harian < 80%.
- Firebase Console → Firestore → Indexes: semua *Enabled*.
- `npm audit --omit=dev` di folder `app` dan `worker` (lihat `docs/KEAMANAN-TAHAP-9.md`).

## 8. Kontak dan eskalasi
Catat di sini setelah serah terima: Developer penanggung jawab, kontak Owner, akun Google pemilik Sheet cadangan, akun Cloudflare dan Firebase (hanya nama akun, bukan kata sandi).
