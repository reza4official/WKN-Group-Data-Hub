# Tahap 9 (v0.9.0): Cadangan, Kuota, dan Pengerasan — Menerapkan ke Proyek Asli

Berisi: **cadangan harian ke Google Sheets**, **pemantau kuota Firestore** (dengan peringatan di aplikasi), **impor penyiapan** (template katalog barang dan saldo awal proyek), perbaikan aksesibilitas, cache dashboard, dan tinjauan keamanan ([`KEAMANAN-TAHAP-9.md`](KEAMANAN-TAHAP-9.md)).
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.8.x sudah tayang.

## 1. Ambil kode terbaru
```powershell
git checkout -- app/package-lock.json
git pull
```
(Baris pertama hanya bila `git pull` mengeluh soal `package-lock.json`.) Tidak ada paket baru.

## 2. Siapkan cadangan Google Sheets (sekali saja, ±15 menit)
Cadangan satu arah: Worker mengirim data ke sebuah web app Google Apps Script milik Anda, yang menulisnya ke Google Sheet. Sheet ini **bukan** sumber kebenaran.

1. Buat Google Sheet baru, mis. **WKN Data Hub — Cadangan**. **Jangan dibagikan ke siapa pun**: isinya memuat nomor HP, email, dan seluruh transaksi. Salin **ID Sheet** dari alamatnya (bagian di antara `/d/` dan `/edit`).
2. Di Sheet itu: **Ekstensi → Apps Script**. Hapus isi bawaan, tempel seluruh isi [`apps-script/Code.gs`](../apps-script/Code.gs), simpan.
3. **Setelan Proyek (ikon roda gigi) → Properti skrip → Tambahkan properti skrip**:
   - `SHEET_ID` = ID Sheet dari langkah 1.
   - `SECRET` = rahasia acak minimal 32 karakter. Buat di PowerShell (tampil di layar; salin untuk langkah 5):
     ```powershell
     -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
     ```
     Bila `SECRET` kosong atau kurang dari 16 karakter, skrip menolak SEMUA permintaan.
4. **Terapkan → Penerapan baru → Jenis: Aplikasi web**. *Jalankan sebagai*: **Saya**. *Yang memiliki akses*: **Siapa saja**. Setujui izin akses Sheet. Salin **URL aplikasi web** (berakhiran `/exec`).
5. Pasang dua rahasia di Worker (ketik/tempel sendiri di terminal; jangan dikirim ke siapa pun):
   ```powershell
   cd worker
   npx wrangler secret put BACKUP_WEBHOOK_URL
   npx wrangler secret put BACKUP_SECRET
   ```
   `BACKUP_WEBHOOK_URL` = URL langkah 4, `BACKUP_SECRET` = rahasia yang sama dengan properti `SECRET`.

> Mengganti rahasia: buat yang baru, perbarui properti `SECRET` di Apps Script **dan** `wrangler secret put BACKUP_SECRET`, lalu tekan *Cadangkan sekarang* untuk memastikan.
> Mengubah kode `Code.gs` di kemudian hari: **Terapkan → Kelola penerapan → Edit → Versi baru** (URL tidak berubah).

## 3. Pemantau kuota: beri izin baca metrik (opsional, disarankan)
Satu-satunya sumber yang ikut menghitung bacaan dari perangkat pengguna adalah Cloud Monitoring. Tanpa langkah ini halaman kuota menampilkan "tidak tersedia" dengan petunjuk, dan semua fitur lain tetap berjalan.

1. Buka https://console.cloud.google.com dan pastikan proyek yang dipilih di bagian atas adalah **wkngroup-datahub** (bukan proyek lain).
2. **APIs & Services → Library** → cari **Cloud Monitoring API** → pastikan *Enabled*.
3. **IAM & Admin → IAM** → cari akun layanan yang kuncinya terpasang di secret `FIREBASE_SERVICE_ACCOUNT` (alamat `client_email` pada berkas JSON-nya) → **Edit** → **Tambahkan peran lain** → **Monitoring Viewer** → Simpan. Peran ini hanya baca metrik.
4. Tunggu beberapa menit.

## 4. Deploy
```powershell
cd worker
npm install
npx wrangler deploy
cd ..
firebase deploy --only firestore
cd app
npm run build
cd ..
firebase deploy --only hosting
```
- `wrangler deploy` juga mendaftarkan **Cron Trigger** (`wrangler.toml`: tiap jam). Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.9.0`. Di dashboard Cloudflare: Workers → wkn-data-hub-api → Settings → Triggers harus memuat cron `0 * * * *`.
- Aturan Firestore berubah (`system/*` hanya terbaca pemegang izin `audit`; total harian terbaca sejak Tahap 6). Tidak ada indeks baru.

## 5. Uji di produksi
1. Menu **Cadangan & Kuota** (Developer/Owner/Direktur): status awal "Belum pernah berjalan". Tekan **Cadangkan sekarang** → "Berhasil", dengan jumlah baris per lembar.
2. Buka Google Sheet: lembar **Pengguna, Role, Perusahaan, Proyek, Katalog, Barang Proyek, Transaksi, Audit**. Cocokkan jumlah baris Transaksi dengan halaman Transaksi Stok.
3. Catat satu transaksi baru, tunggu lima menit, tekan **Cadangkan sekarang** lagi: hanya baris baru yang bertambah (tanpa baris ganda).
4. Tekan sekali lagi segera: ditolak "baru saja dijalankan" (jeda 5 menit).
5. Keesokan hari (setelah pukul 03:00 WITA): status menunjukkan putaran **otomatis**.
6. Bagian **Kuota Firestore hari ini**: persentase baca/tulis/hapus. Bila "tidak tersedia", ikuti petunjuk yang tampil (langkah 3 di atas).
7. Log Audit: *Jalankan cadangan Sheets* atas nama pelaku.

## Impor penyiapan (baru): katalog barang dan saldo awal
Menu **Impor / Ekspor → Jenis impor**:
1. **Katalog barang**: unduh template (lembar *Katalog*, *Contoh Pengisian*, *Barang di Katalog*, *Petunjuk*), isi Nama Barang, Satuan, Kategori, Batas Minimum, unggah. Nama harus unik; yang sudah ada ditolak.
2. **Saldo awal proyek** (pilih proyek dulu): template sudah **terisi nama semua barang katalog** yang belum ada di proyek; cukup isi Saldo Awal dan Tanggal untuk yang diinginkan (baris kosong dilewati). Barang yang sudah ada di proyek tidak ditimpa.
3. **Transaksi stok**: seperti sebelumnya.
Urutan penyiapan awal: katalog → saldo awal → transaksi lama. Izin: `import` ditambah `catalog` (katalog) atau akses proyek (saldo awal).

## Cara kerja dan batasannya
- **Isi cadangan** (cukup untuk memulihkan data): pengguna (tanpa password), role, perusahaan, proyek, katalog, barang proyek (saldo awal, tanggal, stok, minimum, status), transaksi (semua kolom termasuk koreksi, sumber, ID impor, pencatat), dan log audit. **Tidak** ada: password dan kredensial (disimpan Firebase Authentication), kunci passkey, hash penjaga nama, total harian/bulanan (dapat dihitung ulang dari transaksi).
- **Inkremental**: transaksi dan audit dikirim sejak kursor terakhir (`system/backup`); tabel kecil diperbarui penuh. Kursor hanya maju setelah Apps Script mengonfirmasi, jadi kegagalan mengulang dari titik terakhir. Baris dedupe menurut kunci di sisi Sheet, sehingga pengulangan tidak menggandakan.
- **Batas Workers paket gratis**: 50 sub-permintaan per pemanggilan. Satu putaran memakai ≤ 38, dipecah per proyek; bila proyek banyak, status "Sebagian" dan sisanya dilanjutkan di putaran berikutnya (cron per jam hanya menjalankan cadangan pukul 03:00 WITA; tekan *Cadangkan sekarang* untuk melanjutkan lebih cepat, jeda 5 menit).
- **Waktu CPU Workers gratis (10 ms)**: belum teruji di produksi untuk data besar. Bila log (`npx wrangler tail`) menampilkan "exceeded CPU", kecilkan `PAGE` di `worker/src/handlers/backup.ts`.
- **Kuota**: hari kuota Firestore berganti **tengah malam waktu Pasifik** (≈ 15:00/16:00 WITA), bukan WITA. Peringatan di bilah atas muncul pada 80% (kuning) dan 95% (merah) bagi pemegang izin audit.
- **Cache dashboard** 5 menit per tab (tombol *Segarkan*): menghemat kuota baca. Satu muat dashboard membaca ≈ katalog + barang + ≤ 2 total bulanan per barang per proyek.

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
End-to-end (emulator): `e2e/backup.mjs` (Code.gs asli + pola 302), `e2e/csp.mjs` (header produksi), `e2e/a11y.mjs` (axe-core, fokus, 360–1440 px), `e2e/load.mjs` (uji beban), `e2e/setup-import.mjs`.

## Hasil uji beban (asumsi skala; mohon dikonfirmasi)
Skala yang **diasumsikan** (belum pernah disepakati): 5 proyek × 30 barang × 12 bulan × 15 transaksi/bulan/barang = 27.000 transaksi (+ 20 ribu total harian). Emulator, satu mesin.

| Pengukuran | Hasil |
|---|---|
| Dashboard satu proyek (30 barang) | 120 dokumen dibaca, ≈ 1 dtk |
| Dashboard semua 5 proyek | ≈ 420–450 dokumen, ≈ 5 dtk (cache 5 menit mencegah muat berulang) |
| Transaksi Stok satu proyek, bulan berjalan, semua barang | ≈ 545 dokumen (bukan 27.000 riwayat), ≈ 1,4 dtk |
| Ekspor Excel (transaksi + ringkasan) satu proyek | ≈ 665 dokumen, ≈ 2 dtk |
| 60 pencatatan serempak tersebar di 30 barang | 60/60 berhasil, 1,5 dtk |
| 300 permintaan serempak pada 6 barang (uji tekanan) | 57 berhasil, sisanya "busy" yang jelas; **invarian stok tetap utuh** |

Catatan: target rencana "< 100 dokumen per muat dashboard" hanya tercapai untuk proyek kecil (≈ ≤ 20 barang); pada 30 barang 120 dokumen. Dengan cache 5 menit dan batas 50.000 baca/hari, ± 100 muat dashboard semua-proyek per hari masih aman.
Pencatatan serempak pada **satu barang yang sama** dibatasi oleh keamanan data (bacaan-tulisan bersyarat dengan percobaan ulang berjeda): bila ramai, server menjawab "busy" dan pengguna mengulang beberapa detik kemudian; tidak ada data yang rusak.

## Belum terverifikasi di produksi
Pertukaran nyata dengan Apps Script (pola pengalihan 302 diuji dengan server palsu yang menjalankan `Code.gs` asli), metrik Cloud Monitoring nyata (nama metrik `firestore.googleapis.com/document/{read,write,delete}_count`), batas CPU cron Workers, uji di ponsel nyata, dan PWA (opsional, dilewati).
