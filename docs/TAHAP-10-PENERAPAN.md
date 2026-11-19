# Tahap 10 (v1.0.0): Rilis — Hapus Data Uji, Panduan, Runbook, dan Checklist Rilis

Versi ini bernomor **v1.0.0**. Beri tag git (perintah di bagian akhir) setelah Anda menyelesaikan migrasi data nyata, pelatihan, dan **periode pembekuan fitur** (bagian "Checklist rilis"). Hal-hal itu adalah tindakan pemilik dan tidak dapat dilakukan dari lingkungan pengembangan.
Untuk Windows PowerShell di folder repo. Prasyarat: v0.9.0 sudah tayang.

## Yang baru
- **Hapus permanen proyek, perusahaan, dan barang katalog** untuk membersihkan data uji (Owner/Developer).
- **Perbaikan cadangan Sheets**: teks tidak lagi ditafsirkan ulang Google Sheets (nomor HP kehilangan nol di depan, tanggal menjadi tanggal). Ini menuntut **memperbarui `Code.gs`** (lihat langkah 2).
- Dokumen: [`PANDUAN-PENGGUNA.md`](PANDUAN-PENGGUNA.md) (per role), [`RUNBOOK.md`](RUNBOOK.md), [`MIGRASI-DATA-NYATA.md`](MIGRASI-DATA-NYATA.md), [`KEAMANAN-TAHAP-9.md`](KEAMANAN-TAHAP-9.md) (diperbarui).

## 1. Ambil kode terbaru
```powershell
git stash
git pull
git stash pop
```
(Cara menangani konflik `wrangler.toml` ada di tutorial gabungan Tahap 8–9.)

## 2. Perbarui Apps Script (WAJIB untuk perbaikan cadangan)
1. Buka Google Sheet cadangan → **Ekstensi → Apps Script** (atau https://script.google.com dengan akun pemilik, dalam satu akun saja).
2. Hapus isi editor, tempel seluruh isi `apps-script/Code.gs` yang baru:
   ```powershell
   Get-Content apps-script\Code.gs -Raw | Set-Clipboard
   ```
3. Simpan, lalu **Terapkan → Kelola penerapan → ikon pensil → Versi: Versi baru → Terapkan**. URL tidak berubah; rahasia tidak perlu diganti.
4. **Periksa Sheet yang sudah terisi**: lembar **Pengguna** kolom *No. HP* (apakah nol di depan hilang?) dan lembar **Transaksi** kolom *Tanggal* (apakah berubah format tanggal?). Bila rusak, ikuti perbaikan di [`RUNBOOK.md`](RUNBOOK.md) bagian 3 (kosongkan Transaksi dan Audit, hapus dokumen `system/backup`, cadangkan ulang).

## 3. Deploy
```powershell
cd worker
npm install
npx wrangler deploy
cd ..
firebase deploy --only firestore
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```
Cek `/health` → `version: 1.0.0`. Aturan Firestore tidak berubah di tahap ini (deploy tetap aman).

## 4. Uji hapus data uji (di data uji, bukan data nyata)
1. Buat satu perusahaan uji dengan dua proyek, beberapa barang, dan beberapa transaksi (atau pakai data uji yang sudah ada).
2. Masuk sebagai **Owner/Developer** → **Proyek & Perusahaan** → **Hapus** pada satu proyek: dialog menampilkan jumlah barang, transaksi, dan akun terdampak, status cadangan terakhir, dan meminta Anda mengetik nama. Tombol *Hapus permanen* baru aktif bila nama persis sama.
3. Setelah selesai: proyek hilang; proyek lain utuh; barang katalog masih ada dengan "Dipakai di proyek" berkurang.
4. **Katalog Barang** → ikon sampah pada barang yang tidak dipakai → hilang; namanya bisa dipakai lagi.
5. **Hapus** pada perusahaan: semua proyeknya ikut terhapus; perusahaan lain utuh.
6. Masuk sebagai **Direktur**: tidak ada tombol Hapus pada proyek/perusahaan.
7. **Log Audit**: *Mulai hapus…*, *Bersihkan data…*, *Hapus proyek (permanen)* / *Hapus perusahaan (permanen)* dengan pelaku dan waktu.

## Perilaku penting
- **Tidak dapat dibatalkan.** Hanya **Owner dan Developer** (level ≥ 90 dengan izin proyek); Direktur ke bawah ditolak di aplikasi dan di server.
- **Konfirmasi nama** dicek juga di server (nama tak cocok → ditolak).
- **Bertahap dan dapat dilanjutkan**: proyek besar dihapus beberapa putaran (batas Workers gratis 50 sub-permintaan per panggilan); aplikasi mengulang otomatis. Bila terputus, proyek tampil **"Sedang dihapus"** dengan tombol **Lanjutkan hapus**. Selama dihapus, proyek tidak bisa diaktifkan, diubah, atau diisi barang/transaksi.
- **Kuota hapus harian** paket gratis ±20.000 dokumen. Bila habis: pesan jelas, lanjutkan besok; data yang sudah terhapus tetap terhapus. Pratinjau memperkirakan dan memperingatkan.
- **Yang ikut terhapus**: proyek, barang proyek, transaksi, total harian/bulanan; penugasan proyek pada akun dibersihkan (akun tidak dihapus; akun yang kehilangan proyek terakhirnya hanya dapat dikelola pemegang izin proyek); penghitung pemakaian katalog dikurangi.
- **Yang tidak ikut terhapus (sengaja)**: **Log Audit** (hanya bisa bertambah) dan **Google Sheet cadangan** (menyimpan salinan; bersihkan manual bila perlu). Barang katalog dihapus terpisah dan hanya bila tak dipakai proyek mana pun.

## Checklist rilis v1.0.0 (tindakan pemilik)
- [ ] Semua tahap 2–9 sudah di-deploy dan lulus uji produksi (lihat panduan tiap tahap dan tutorial gabungan 8–9).
- [ ] **Indeks Firestore** Tahap 4 (`users`, `resetRequests`) berstatus *Enabled*; halaman Akun Pengguna Manajer Proyek terbuka tanpa galat indeks.
- [ ] **Login biometrik** dicoba di ponsel sungguhan (sidik jari dan/atau wajah).
- [ ] **Cadangan Sheets** berjalan: status "Berhasil" beberapa hari berturut-turut; kolom HP dan Tanggal di Sheet benar (bagian 2 langkah 4).
- [ ] **Pemantau kuota** menampilkan angka (peran *Monitoring Viewer* diberikan) atau diputuskan dilewati.
- [x] **CSP**: `connect-src` di `firebase.json` sudah memakai host Worker yang tepat (temuan S-04 selesai).
- [ ] **Bersihkan data uji** ([`MIGRASI-DATA-NYATA.md`](MIGRASI-DATA-NYATA.md) bagian 7).
- [ ] **Migrasi data nyata** dan **rekonsiliasi** ([`MIGRASI-DATA-NYATA.md`](MIGRASI-DATA-NYATA.md) bagian 1–6).
- [ ] **Pelatihan** per role memakai [`PANDUAN-PENGGUNA.md`](PANDUAN-PENGGUNA.md); catat siapa sudah dilatih.
- [ ] **Uji pemulihan** sekali di proyek percobaan mengikuti [`RUNBOOK.md`](RUNBOOK.md) bagian 4.
- [ ] **Pembekuan fitur** satu periode (disarankan 1 bulan): hanya perbaikan kesalahan.
- [ ] Tidak ada temuan berat yang terbuka di periode pembekuan.
- [ ] **Beri tag rilis** (perintah di bawah) setelah semua butir di atas dicentang.

```powershell
# Setelah semua checklist selesai (di cabang yang sudah berisi perbaikan periode pembekuan):
git tag -a v1.0.0 -m "WKN Group Data Hub v1.0.0"
git push origin v1.0.0
```
(Tag `v1.0.0` dapat dibuat dengan cara yang sama pada commit rilis ini bila Anda ingin menandainya; saya tidak membuat atau mendorong tag apa pun atas nama Anda.)
Naikkan versi di `app/package.json` dan `worker/package.json` ke `1.0.0` (dan `VERSION` di `worker/src/index.ts`) pada commit rilis akhir, lalu deploy; footer aplikasi otomatis menampilkan `v1.0.0`.

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
```
End-to-end (emulator): `e2e/purge.mjs` (hapus proyek/perusahaan/katalog dengan aturan aktif, proyek besar bertahap, wewenang, audit).
