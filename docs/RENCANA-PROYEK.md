# WKN Group Data Hub — Rencana, Rancangan, dan Kebutuhan Proyek

Versi dokumen: 0.1 (draft) · Target rilis aplikasi pertama: **v0.1.0**
Domain: https://wkngroup.web.app · Semua layanan harus **gratis**.

---

## 1. Tujuan dan Ruang Lingkup

WKN Group Data Hub adalah pusat data untuk PT. Wiratama Karya Nugraha (WKN) dan anak perusahaannya (kontraktor jalan dan jembatan).

**Tahap 1 (dokumen ini): Manajemen Inventory per proyek**
- Setiap proyek punya inventory stok bahan dan material.
- Setiap barang wajib punya **data awal** (saldo awal) sebelum transaksi masuk/keluar bisa dicatat.
- Dashboard ringkasan per barang: masuk, keluar, sisa, perbandingan bulan sebelumnya, persentase pemakaian, dan indikator lain.
- Ekspor/impor Excel dan PDF.
- Manajemen akun, role hierarkis, database karyawan, dan jejak audit.

Tahap berikutnya (di luar cakupan ini): modul lain (keuangan, alat berat, SDM, dokumen proyek) memakai fondasi yang sama.

---

## 2. Batasan Platform Gratis yang Bertabrakan dengan Kebutuhan

Bagian ini penting. Beberapa permintaan **tidak bisa dipenuhi apa adanya** di paket gratis. Berikut benturannya dan solusi yang diusulkan. Mohon konfirmasi.

| # | Kebutuhan | Kendala | Solusi yang diusulkan |
|---|-----------|---------|-----------------------|
| 1 | Password bebas aturan | Firebase Auth mewajibkan minimal 6 karakter | **Diputuskan pemilik**: ikuti batas Firebase (minimal 6 karakter), tanpa syarat lain (huruf besar, angka, simbol tidak diwajibkan). Password dikirim apa adanya ke Firebase, tanpa derivasi di klien. |
| 2 | Username bebas | Firebase Auth butuh email | Username dinormalisasi (huruf kecil, Unicode NFC) lalu di-encode (hex/base32) menjadi email sintetis `<encoded>@users.wkngroup.invalid`. Keunikan dijaga dokumen `usernames/{normalized}`. Spasi dan karakter unik tetap diperbolehkan. |
| 3 | Aksi admin (buat akun, reset password, nonaktifkan, set claims) | Cloud Functions butuh paket Blaze (berbayar) | **Cloudflare Worker (gratis) menjadi backend inti.** Worker menyimpan service account Firebase sebagai secret, memverifikasi ID token pemanggil, memeriksa hierarki role, lalu memanggil Identity Toolkit dan Firestore REST API. |
| 4 | Cloudflare di depan `wkngroup.web.app` | `web.app` milik Google, tidak bisa ditambahkan sebagai zone Cloudflare. WAF, caching, dan Rules Cloudflare tidak berlaku | Yang tetap gratis dan dipakai: **Workers (workers.dev), Turnstile (anti-bot), KV (rate limit), Cron Triggers**. Jika ingin Cloudflare Rules/WAF penuh, perlu domain sendiri (berbayar). "Rules" di dokumen ini berarti **Firestore Security Rules** dan **Hosting headers**. |
| 5 | Penyimpanan file/logo | Cloud Storage for Firebase dan Cloudflare R2 mungkin meminta kartu pembayaran atau paket Blaze | Tidak dipakai di v1. Logo dan aset disajikan sebagai file statis Firebase Hosting. Verifikasi ulang kebijakan terbaru sebelum menambah upload file. |
| 6 | Backup | Ekspor terkelola Firestore butuh Blaze | Worker Cron Trigger menyalin data ke Google Sheets (cermin) secara berkala, ditambah ekspor Excel manual. |
| 7 | Tanpa auto logout | Aman dari sisi Firebase (refresh token tidak kedaluwarsa sendiri), tapi akun yang dinonaktifkan harus tetap terputus | Persistensi lokal + pengecekan flag `disabled` setiap aplikasi dibuka dan pada setiap aturan Firestore. |
| 8 | Kuota Firestore Spark | ±50 ribu baca, 20 ribu tulis, 1 GB per hari/total | Dashboard hanya membaca **dokumen agregat bulanan**, bukan transaksi mentah. Impor besar memakai batch dan menghabiskan kuota tulis harian (lihat bagian 9). |

---

## 3. Arsitektur dan Stack (semua gratis)

```
Browser (SPA)  ──►  Firebase Hosting  (wkngroup.web.app, aset statis)
    │
    ├──►  Firebase Auth       (Google + username/password)
    ├──►  Firestore           (data, dijaga Security Rules)
    └──►  Cloudflare Worker   (api: aksi admin, reset password, ledger, Sheets)
              ├── Firebase Identity Toolkit + Firestore REST (service account)
              ├── Turnstile verify (permintaan reset tanpa login)
              ├── KV (rate limit)
              └── Apps Script Web App ──► Google Sheets (cermin/backup)
```

- **Frontend**: Vite + React + TypeScript, Tailwind CSS, React Router. Responsif dan mobile-first.
- **Ekspor/impor**: SheetJS (pasang dari cdn.sheetjs.com karena paket npm `xlsx` usang), jsPDF + jspdf-autotable. Semua berjalan di browser.
- **Grafik**: Recharts atau Chart.js.
- **Deploy**: Firebase CLI (`firebase deploy`), Wrangler untuk Worker, GitHub Actions opsional (gratis untuk repo ini).
- **Spreadsheet**: Google Sheets via Apps Script Web App, **satu arah** (aplikasi → Sheets). Bukan sumber kebenaran.

---

## 4. Model Data (Firestore)

```
companies/{companyId}            nama, tipe (induk|anak), aktif
projects/{projectId}             companyId, nama, lokasi, status, tglMulai, tglSelesai
catalog/{itemId}                 namaBaku, satuan, kategori, aktif      (katalog barang satu grup)
projects/{pid}/items/{itemId}    catalogId, saldoAwal, tglSaldoAwal, stokSaatIni, stokMinimum
projects/{pid}/ledger/{entryId}  tanggal, itemId, tipe(masuk|keluar|saldoAwal|koreksi),
                                 jumlah, keterangan, refEntryId?, createdBy, createdAt
projects/{pid}/summary/{itemId_YYYYMM}
                                 saldoAwalBulan, totalMasuk, totalKeluar, saldoAkhirBulan, jumlahTransaksi
roles/{roleId}                   nama, level (angka), izin{...}, sistem(true untuk bawaan)
users/{uid}                      username, nama, noHp, emailKontak, roleId, level,
                                 companyIds[], projectIds[], disabled, createdBy, createdAt
usernames/{normalized}           uid
resetRequests/{id}               targetUid, status, requestedAt, handledBy, handledAt
auditLog/{id}                    actorUid, aksi, target, sebelum, sesudah, waktuServer
```

**Prinsip ledger (anti-kecurangan dan konsistensi):**
- Ledger **append-only**. Entri tidak diedit atau dihapus. Kesalahan dikoreksi dengan entri **koreksi/reversal** yang merujuk entri asal, lengkap dengan pelaku dan waktu.
- Kolom "Jumlah yang tersisa" pada tabel **dihitung saat tampil/ekspor** dari saldo awal + entri berurutan, bukan disimpan per baris. Dengan begitu entri bertanggal mundur atau koreksi tidak merusak baris sesudahnya.
- `stokSaatIni` pada dokumen item dan dokumen `summary` bulanan diperbarui bersama entri ledger.
- **Saldo awal wajib**: aturan menolak transaksi untuk item yang belum punya `saldoAwal` dan `tglSaldoAwal`, dan menolak tanggal sebelum `tglSaldoAwal`. Stok tidak boleh negatif.
- **Katalog barang satu grup** mencegah duplikat ("Semen" vs "semen sak") sehingga perbandingan lintas proyek valid.

**Integritas agregat.** Jika klien menulis agregat langsung, angka bisa dimanipulasi. Pilihan:
- **A (disarankan)**: semua tulis ledger lewat Worker, yang memakai transaksi Firestore untuk menulis entri + item + summary sekaligus. Klien hanya boleh membaca.
- **B**: klien menulis langsung, rules memvalidasi konsistensi dengan `getAfter()`. Lebih rumit dan rapuh.

Dokumen ini memakai **A**. Konsekuensinya kuota Worker (100 ribu request/hari gratis) ikut terpakai, cukup untuk skala ini.

---

## 5. Role dan Akses

### 5.1 Hirarki

| Level | Role | Catatan |
|------:|------|---------|
| 100 | **Developer** | Puncak. Tidak bisa dihapus atau diubah role lain. |
| 90 | **Owner / Direktur Utama** | |
| 80 | **Direktur** | |
| 50 | **Manajer Proyek** (saran pengganti "Kepala/Penanggung jawab proyek") | Padanan umum di kontraktor: *Project Manager*. Alternatif: *Kepala Proyek*, *Site Manager*. |
| 20 | **Admin Logistik / Gudang** (saran tambahan) | Pelaksana input harian. Tanpa role ini, Manajer Proyek yang harus input sendiri. |

Level bersifat angka sehingga role baru bisa disisipkan di antaranya.

### 5.2 Aturan

1. Setiap role boleh **membuat, mengubah, menghapus, dan mereset password** akun dengan level **lebih rendah secara ketat**.
2. Tidak ada yang boleh membuat atau mengubah role/akun pada level **sama atau lebih tinggi** dari miliknya (pencegahan eskalasi hak).
3. **Developer, Owner, Direktur** dapat menambah role baru, mengubah izin role lama, dan mengatur izin role baru, hanya untuk role di bawah level mereka sendiri.
4. Pengguna dengan role lebih rendah dapat **mengirim permintaan reset password** ke semua role di atasnya. Permintaan bisa dieksekusi oleh siapa pun di atasnya. Setiap eksekusi mencatat **siapa, tanggal, dan jam** (waktu server).
5. Setiap aksi tulis (input data, ubah akun, ubah role, reset password) menyimpan **pelaku dan waktu** di `auditLog`.
6. **Cakupan**: akun dibatasi per perusahaan dan per proyek (`companyIds`, `projectIds`). Manajer Proyek hanya melihat proyek yang ditugaskan.
7. Developer, Owner, dan Direktur dapat mengakses **Database Karyawan**.

### 5.3 Matriks izin (awal, dapat diubah lewat UI)

Izin per role dalam bentuk kunci: `inventory.read`, `inventory.write`, `inventory.correct`, `catalog.manage`, `project.manage`, `users.manage`, `roles.manage`, `employees.read`, `audit.read`, `export`, `import`.

---

## 6. Autentikasi

**Login username + password**
- Form: username, password (ikon mata), tombol Masuk. Satu-satunya aturan: minimal 6 karakter (batas Firebase), tanpa syarat lain.

**Login Google**
- Hanya untuk akun yang **sudah didaftarkan** (email cocok dengan `emailKontak` akun). Jika tidak cocok, pengguna langsung di-sign out dengan pesan jelas. **Tidak ada pendaftaran otomatis.**

**Reset password**
- Pengguna yang tidak bisa login mengirim permintaan lewat endpoint Worker (dilindungi Turnstile + rate limit di KV) dengan memasukkan username.
- Atasan melihat daftar permintaan, mengeksekusi reset, dan sistem mencatat pelaku + tanggal + jam.
- Atasan juga bisa mereset langsung tanpa permintaan.

**Tanpa auto logout.** Sesi tetap sampai pengguna keluar sendiri atau akun dinonaktifkan.

**Semua input password memiliki ikon mata** (komponen `PasswordInput` tunggal dipakai di semua form).

**Profil pengguna**: ganti nama, no. HP, password, dan email. Email di sini adalah **email kontak** (kolom profil), terpisah dari email sintetis login username. Semuanya tersinkron ke Database Karyawan.

---

## 7. Fitur Inventory

### 7.1 Tabel transaksi per proyek
Kolom: **Hari/Tanggal, Nama Barang, Satuan, Jumlah Masuk, Jumlah Keluar, Jumlah Tersisa, Keterangan** (+ kolom otomatis: pencatat dan waktu input).

### 7.2 Alur
1. Proyek dibuat, item dipilih dari katalog.
2. Isi **saldo awal** dan tanggalnya (wajib).
3. Catat barang masuk/keluar. Validasi: stok tidak boleh minus, tanggal tidak boleh sebelum saldo awal.
4. Koreksi lewat entri reversal.

### 7.3 Dashboard ringkasan
Per barang dan per proyek (filter perusahaan/proyek/periode):
- Saldo awal, total masuk, total keluar, sisa.
- **Perbandingan dengan bulan sebelumnya** (selisih dan % perubahan masuk/keluar).
- **Persentase pemakaian** = keluar ÷ (saldo awal + masuk).
- Rata-rata pemakaian harian dan **estimasi sisa hari stok**.
- Peringatan **stok di bawah minimum**.
- Barang **tanpa pergerakan** N hari.
- Top barang paling banyak dipakai.
- Perbandingan antar proyek.
- Grafik tren bulanan.
- Log aktivitas terakhir.

### 7.4 Ekspor dan impor
- **Ekspor**: Excel (.xlsx) dan PDF (tabel transaksi, ringkasan, kop berlogo WKN, nama pembuat, tanggal cetak).
- **Impor**: unduh template Excel → isi → unggah → **pratinjau validasi** (baris error ditandai) → konfirmasi. Impor menulis lewat Worker dalam batch maksimal 500 operasi dan mencatat pelaku. Impor besar menghabiskan kuota tulis harian.

---

## 8. Desain dan UX

- **Warna**: dominan abu muda dan putih, aksen biru khas WKN. Nilai biru pasti diambil dari logo (menunggu logo). Sementara memakai token placeholder CSS (`--wkn-blue`, `--bg`, `--surface`, ...).
- **Logo** dipakai sebagai favicon, ikon PWA, header, halaman login, kop PDF.
- Profesional, rapi, interaktif: transisi halus, skeleton loading, toast, dialog konfirmasi aksi berbahaya, pencarian dan filter instan.
- **Responsif dan konsisten** di ponsel, tablet, desktop: grid simetris, navigasi samping di desktop dan bawah/hamburger di ponsel, tabel dapat digulir dengan kolom utama tetap terlihat.
- **Footer**: `© Copyright 2026 | PT. Wiratama Karya Nugraha | Dibuat di Makassar | @reza4official_ | vX.X.X`. Ejaan "Karya" sudah dikonfirmasi pemilik.
- Dapat dipasang sebagai PWA (gratis), opsional tahap lanjut.

---

## 9. Keamanan dan Aturan

- **Firestore Security Rules**: default tolak semua. Baca dibatasi per level/cakupan. Ledger, summary, dan akun hanya ditulis lewat Worker (klien tidak bisa menulis langsung).
- `auditLog`: hanya create, tidak ada update/delete, waktu dari server.
- Worker: verifikasi ID token Firebase, cek `disabled`, cek hierarki, rate limit KV, CORS hanya untuk `https://wkngroup.web.app`.
- Secret (service account, kunci Turnstile) hanya di Wrangler secrets, tidak pernah di repo atau klien.
- Hosting headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- Password hanya dibatasi minimal 6 karakter (batas Firebase); Firebase menyimpan hash di sisi server. Risiko password lemah tetap pada pemilik akun.

**Anggaran kuota harian (gratis)**: baca 50 ribu, tulis 20 ribu, Worker 100 ribu request. Dengan agregat bulanan, satu muat dashboard sekitar puluhan baca. Satu transaksi ledger ≈ 3 tulis (entri, item, summary) + 1 audit = 4 tulis, jadi sekitar 5 ribu transaksi per hari. Pantau dan beri peringatan di aplikasi.

---

## 10. Versioning

- Format **vX.X.X** (major.minor.patch), sumber tunggal di file `VERSION` / `package.json`, disuntikkan saat build ke footer.
- Naik setiap ada pembaruan: patch = perbaikan, minor = fitur, major = perubahan besar/tidak kompatibel.
- Riwayat di `CHANGELOG.md`.

---

## 11. Roadmap

| Versi | Isi |
|-------|-----|
| **v0.1.0** | Scaffolding repo, tema (token warna + logo placeholder), layout responsif, footer + versi, deploy Firebase Hosting ke wkngroup.web.app |
| **v0.2.0** | Auth: username/password (min. 6 karakter), Google (akun terdaftar), ikon mata, Worker dasar, Firestore Rules awal, akun Developer pertama |
| **v0.3.0** | Role dinamis + hierarki, kelola akun bawahan, permintaan dan eksekusi reset password beserta audit |
| **v0.4.0** | Perusahaan, proyek, katalog barang, saldo awal |
| **v0.5.0** | Ledger masuk/keluar/koreksi lewat Worker, tabel transaksi, summary bulanan |
| **v0.6.0** | Dashboard ringkasan dan grafik |
| **v0.7.0** | Ekspor/impor Excel dan PDF |
| **v0.8.0** | Profil pengguna + Database Karyawan |
| **v0.9.0** | Cermin Google Sheets + backup cron, pengerasan keamanan, uji menyeluruh |
| **v1.0.0** | Rilis resmi tahap 1 |

---

## 12. Kebutuhan Proyek

**Akun gratis**: Google/Firebase (Spark), Cloudflare (Free), GitHub, Google Sheets/Apps Script.
**Perangkat**: Node.js LTS, Firebase CLI, Wrangler, Git.
**Dari pemilik**: file logo (SVG/PNG resolusi tinggi), daftar anak perusahaan, daftar proyek awal, data karyawan/akun awal, daftar barang dan saldo awal (Excel).

---

## 13. Keputusan dan Pertanyaan Terbuka

**Sudah diputuskan pemilik**
- Nama perusahaan: "Karya".
- Password: ikuti Firebase, minimal 6 karakter, tanpa syarat lain.
- Cloudflare dipakai untuk Worker, Turnstile, KV (tanpa WAF/Rules, domain tetap di Firebase `wkngroup.web.app`).
- Nama role: **Manajer Proyek** dan **Admin Logistik/Gudang** (input harian oleh keduanya).

**Masih menunggu**
1. **Logo**: akan dikirim pemilik nanti. Sementara memakai token tema placeholder.
2. **Daftar anak perusahaan**: akan diberikan pemilik nanti.
3. **Skala data**: perkiraan jumlah proyek, barang, dan transaksi per hari, untuk memastikan kuota gratis cukup.
