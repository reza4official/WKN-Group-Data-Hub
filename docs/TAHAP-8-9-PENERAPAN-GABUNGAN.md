# Tutorial Gabungan: Menerapkan Tahap 8 (v0.8.x) dan Tahap 9 (v0.9.0)

Satu urutan langkah untuk memasang **Profil & Database Karyawan** (Tahap 8) dan **Cadangan Sheets, Kuota, Impor Penyiapan, Pengerasan** (Tahap 9) sekaligus ke proyek asli. Untuk Windows PowerShell di folder repo `WKN-Group-Data-Hub`.
Rincian per tahap: [`TAHAP-8-PENERAPAN.md`](TAHAP-8-PENERAPAN.md) dan [`TAHAP-9-PENERAPAN.md`](TAHAP-9-PENERAPAN.md).

**Prasyarat:** v0.7.x sudah tayang (Worker, Firestore, Hosting berjalan). Akun Developer/Owner untuk menguji.
**Perkiraan waktu:** 30–40 menit, termasuk menyiapkan Google Sheet.

---

## A. Ambil kode terbaru

```powershell
git stash
git pull
git stash pop
```
- Gunakan tiga baris di atas bila `git pull` berhenti karena perubahan lokal (mis. `worker/wrangler.toml`, `public-config.json`, `turnstile.json`). Nilai asli Anda tetap aman.
- Bila `stash pop` menampilkan `CONFLICT` di `worker/wrangler.toml`: pertahankan **kedua** sisi (nilai Anda dan blok di bawah), hapus tanda `<<<<<<<`, `=======`, `>>>>>>>`, lalu `git stash drop`:
  ```toml
  [triggers]
  crons = ["0 * * * *"]
  ```
- Bila `git pull` mengeluh soal `app/package-lock.json` saja: `git checkout -- app/package-lock.json`, lalu `git pull`.
- Cek blok cron ada: `Select-String -Path worker/wrangler.toml -Pattern "triggers|crons"`.

Tidak ada paket baru untuk Tahap 8 dan 9 selain yang sudah dipasang di Tahap 7 (`npm install` di folder `app` tetap aman dijalankan).

---

## B. Siapkan cadangan Google Sheets (Tahap 9, sekali saja)

Cadangan satu arah: Worker mengirim data ke web app Apps Script milik Anda, yang menulis ke Google Sheet. Sheet ini bukan sumber kebenaran.

1. **Buat Google Sheet** baru, mis. *WKN Data Hub — Cadangan*. **Jangan dibagikan ke siapa pun** (memuat HP, email, transaksi). Salin **ID Sheet** dari alamatnya: bagian di antara `/d/` dan `/edit`.
2. Di Sheet itu: **Ekstensi → Apps Script**. Hapus isi bawaan, tempel seluruh isi `apps-script/Code.gs`, simpan.
3. **Setelan Proyek (roda gigi) → Properti skrip → Tambahkan properti skrip**:
   - `SHEET_ID` = ID Sheet dari langkah 1.
   - `SECRET` = rahasia acak ≥ 32 karakter. Buat di PowerShell (tampil di layar; salin untuk langkah 5):
     ```powershell
     -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
     ```
4. **Terapkan → Penerapan baru → Jenis: Aplikasi web.** *Jalankan sebagai:* **Saya**. *Yang memiliki akses:* **Siapa saja**. Setujui izin akses Sheet. Salin **URL aplikasi web** (berakhiran `/exec`).
5. **Pasang dua rahasia di Worker** (ketik/tempel sendiri; jangan dikirim ke siapa pun):
   ```powershell
   cd worker
   npx wrangler secret put BACKUP_WEBHOOK_URL
   npx wrangler secret put BACKUP_SECRET
   cd ..
   ```
   `BACKUP_WEBHOOK_URL` = URL langkah 4. `BACKUP_SECRET` = rahasia yang **sama** dengan properti `SECRET`.

---

## C. Pemantau kuota: beri izin baca metrik (opsional, disarankan)

Tanpa langkah ini halaman kuota menampilkan "tidak tersedia" dengan petunjuk; fitur lain tetap jalan.

1. Buka https://console.cloud.google.com, pastikan proyek terpilih di bagian atas adalah **wkngroup-datahub**.
2. **APIs & Services → Library → Cloud Monitoring API → Enable** (bila belum).
3. **IAM & Admin → IAM** → temukan akun layanan yang kuncinya terpasang di secret `FIREBASE_SERVICE_ACCOUNT` (alamat `client_email` di berkas JSON-nya) → **Edit** → **Tambahkan peran lain** → **Monitoring Viewer** → Simpan.
4. Tunggu beberapa menit.

---

## D. Deploy (urutan penting)

```powershell
# 1) Worker (rute profil, impor, cadangan, kuota + cron)
cd worker
npm install
npx wrangler deploy

# 2) Aturan Firestore (WAJIB: employees, system/*, total harian)
cd ..
firebase deploy --only firestore

# 3) Aplikasi
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```
Cek:
- `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.9.0`.
- Dashboard Cloudflare → Workers → wkn-data-hub-api → Settings → Triggers: cron `0 * * * *`.
- Firebase Console → Firestore → Indexes: dua indeks Tahap 4 (`users`, `resetRequests`) berstatus *Enabled*.

> Tanpa langkah 2 (aturan Firestore), **Database Karyawan** dan **Cadangan & Kuota** menampilkan galat izin.

---

## E. Uji di produksi

Gunakan proyek percobaan bila ada.

### Tahap 8 — Profil dan Database Karyawan
1. Masuk sebagai Admin Logistik atau Manajer Proyek → **Profil Saya** → ubah nama, no. HP, email → **Simpan**. Nama di bilah atas ikut berubah.
2. Coba email yang dipakai akun lain → ditolak "sudah dipakai akun lain".
3. **Ganti password**: password lama salah → ditolak; benar → berhasil dan Anda tetap masuk. Keluar, masuk dengan password baru. Ketiga kolom password punya ikon mata.
4. Masuk sebagai Developer/Owner/Direktur → **Database Karyawan**: perubahan tadi tampil beserta pengubah dan waktu (WITA). Cari/filter/ekspor Excel dan PDF berfungsi.
5. Manajer Proyek: menu Database Karyawan tidak ada; membuka `#employees` menampilkan "Akses ditolak".

### Tahap 9 — Cadangan, kuota, impor penyiapan
6. **Cadangan & Kuota** → status awal "Belum pernah berjalan" → **Cadangkan sekarang** → "Berhasil" dengan jumlah baris per lembar.
7. Buka Google Sheet: lembar **Pengguna, Role, Perusahaan, Proyek, Katalog, Barang Proyek, Transaksi, Audit**. Cocokkan jumlah baris Transaksi dengan halaman Transaksi Stok.
8. Catat satu transaksi, tunggu 5 menit, **Cadangkan sekarang** lagi: hanya baris baru bertambah. Tekan lagi segera: ditolak (jeda 5 menit).
9. Bagian **Kuota Firestore hari ini** menampilkan persentase baca/tulis/hapus. Bila "tidak tersedia", ikuti petunjuk di layar (Bagian C).
10. Keesokan hari setelah 03:00 WITA: status menunjukkan putaran **otomatis**.
11. **Impor / Ekspor → Jenis impor → Katalog barang**: unduh template (ada lembar *Contoh Pengisian*), isi, unggah, periksa pratinjau, impor.
12. **Jenis impor → Saldo awal proyek**: pilih proyek, unduh template (sudah terisi nama barang katalog yang belum ada di proyek), isi saldo dan tanggal untuk yang diinginkan, unggah, impor. Baris yang dikosongkan dilewati.
13. **Dashboard**: tombol **Segarkan** ada; membuka ulang dalam 5 menit memakai cache (menghemat kuota baca).
14. **Log Audit**: *Ubah data diri*, *Ganti password sendiri*, *Jalankan cadangan Sheets*, *Impor katalog*, *Impor saldo awal*, *Impor transaksi*.

---

## F. Bila ada masalah

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| `git pull` berhenti soal berkas lokal | Perubahan lokal pada `wrangler.toml`, `public-config.json`, `package-lock.json` | Bagian A |
| Database Karyawan / Cadangan & Kuota: galat izin | Aturan Firestore belum di-deploy | `firebase deploy --only firestore` |
| Status cadangan "Gagal: unauthorized" | `BACKUP_SECRET` tidak sama dengan properti `SECRET` | Samakan keduanya, `wrangler secret put BACKUP_SECRET`, coba lagi |
| "Gagal: format tak dikenal" | Penerapan Apps Script bukan *Siapa saja* / URL salah | Terapkan ulang (Execute as: Me, Anyone), perbarui `BACKUP_WEBHOOK_URL` |
| "Belum dikonfigurasi" | Dua rahasia belum dipasang | Bagian B langkah 5 |
| Kuota "tidak tersedia" | Peran Monitoring Viewer / API belum aktif | Bagian C |
| Ganti password: "Password lama salah" padahal benar | Salah ketik, atau percobaan terlalu banyak | Tunggu beberapa menit, ulangi |
| Impor: "Barang ada di katalog tetapi belum ditambahkan ke proyek" | Barang belum dimasukkan ke proyek | Impor **Saldo awal proyek** dulu |
| Cron tidak muncul di Triggers | Blok `[triggers]` hilang dari `wrangler.toml` | Bagian A, lalu `npx wrangler deploy` |

## G. Urutan ringkas (cheat sheet)

```powershell
git stash; git pull; git stash pop
# Sheet + Apps Script (Bagian B langkah 1-4)
cd worker; npx wrangler secret put BACKUP_WEBHOOK_URL; npx wrangler secret put BACKUP_SECRET
npm install; npx wrangler deploy; cd ..
firebase deploy --only firestore
cd app; npm install; npm run build; cd ..
firebase deploy --only hosting
```
