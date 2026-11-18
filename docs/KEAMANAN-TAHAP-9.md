# Tinjauan Keamanan dan Aksesibilitas — Tahap 9 (v0.9.0)

Metode: pemeriksaan otomatis yang dapat diulang (kode di repo), bukan hanya pembacaan kode. Tiap temuan memuat bukti dan statusnya.
**Tidak ada temuan tinggi yang terbuka.** Satu temuan rendah terbuka (S-04), dua risiko diterima dengan alasan (S-05, S-07).

## Temuan

| ID | Hal | Tingkat | Status | Bukti |
|----|-----|---------|--------|-------|
| S-01 | **Setiap jalur tulis mencatat audit** (siapa, apa, kapan) | Tinggi bila gagal | **Tertutup** | `FakeBackend` menggagalkan tes bila ada commit yang mengubah data tanpa dokumen `auditLog/*` di commit yang SAMA. Seluruh suite Worker (207 tes) lulus dengan invarian ini aktif; pengecualian hanya `webauthnCredentials/*` (penghitung login biometrik) dan `system/*` (status cron), masing-masing beralasan. Uji mutasi: menghapus audit dari `catalog.create` menggagalkan 19 tes. Handler baru otomatis ikut diperiksa. |
| S-02 | Eskalasi hak (role, level, izin) | Tinggi bila gagal | **Tertutup** | Tahap 3–8: pelaku hanya mengelola level di bawahnya, role yang diberikan harus berizin subset, level role tak berubah, rute profil hanya mengubah nama/HP/email sendiri (tes mengirim `roleId`, `level`, `projectIds`, `disabled`, `perms` dan memastikan tak berpengaruh). Aturan Firestore: klien tidak dapat menulis apa pun (tes aturan 23). |
| S-03 | **CSP dan header hosting** | Sedang bila gagal | **Tertutup** | `e2e/csp.mjs` menyajikan build dengan header PERSIS `firebase.json` (hanya `connect-src` ditambah alamat emulator/Worker lokal), menjelajahi semua halaman, rincian dashboard, ekspor Excel dan PDF (ExcelJS/jsPDF dimuat malas), impor, dan mengumpulkan `securitypolicyviolation` + galat konsol: **nol pelanggaran**. Uji-diri: skrip inline yang sengaja disisipkan terdeteksi dan diblokir, jadi "nol" berarti sesuatu. |
| S-04 | `connect-src https://*.workers.dev` terlalu lebar (mengizinkan sambungan ke Worker siapa pun) | Rendah | **Terbuka** (rekomendasi) | Ganti dengan host Worker Anda yang tepat di `firebase.json` (dua blok CSP): `https://wkn-data-hub-api.<subdomain>.workers.dev`. Tidak diubah otomatis karena subdomain tidak ada di repo. Dampak bila dibiarkan: kecil, karena halaman tetap hanya memuat skrip dari `self`. |
| S-05 | `npm audit` produksi: 4 tinggi, 2 sedang | Tinggi/sedang (nominal) | **Diterima, dengan bukti** | Rantai `firebase → @firebase/firestore → @grpc/grpc-js`: pustaka gRPC **sisi server Node**; `grep` pada build produksi menunjukkan tidak ada `@grpc`/`grpc-js`/`getAuthContext` (hanya nama opsi `grpcFlowControlWindow` milik Firestore). "Perbaikan" yang disarankan npm adalah menurunkan Firebase ke v9 (tidak masuk akal). `uuid` (sedang) lewat `exceljs`: kerentanan hanya untuk `v3/v5/v6` dengan argumen buffer; ExcelJS hanya memanggil `v4()` tanpa buffer (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`). Worker: 0 kerentanan. Ulangi `npm audit --omit=dev` tiap rilis. |
| S-06 | Rahasia bocor di repo/riwayat git | Tinggi bila ada | **Tertutup** | `git log -p --all` dipindai untuk `BEGIN PRIVATE KEY`, `"private_key"`, `"client_email"`, kunci API, token GitHub/Slack: **tidak ada**. Worktree juga bersih. Rahasia hanya di `wrangler secret` dan Script Properties. |
| S-07 | Password hanya minimal 6 karakter | Sedang | **Diterima (keputusan pemilik)** | Mitigasi: pembatas laju bawaan Firebase Auth, Turnstile pada permintaan reset, ganti password sendiri butuh password lama (token login password ≤ 5 menit), reset oleh atasan mencabut sesi dan passkey, login biometrik opsional. |
| S-08 | Tidak ada pembatas laju khusus untuk rute tulis Worker | Rendah | **Diterima** | Semua rute tulis butuh token Firebase yang sah + izin + lingkup proyek; badan permintaan dibatasi; Firestore Rules menolak tulis klien. KV gratis hanya 1.000 tulis/hari, tidak cukup untuk membatasi tiap permintaan. Tinjau bila ada akun yang disalahgunakan. |
| S-09 | Ubah email kontak sendiri memindahkan hak **Login Google** | Info | **Dengan desain** | Email harus unik (server menolak duplikat); dijelaskan di layar. Atasan melihat perubahan di Log Audit (sebelum/sesudah). |
| S-10 | Web app Apps Script berakses "Siapa saja" | Sedang bila salah | **Dimitigasi** | Rahasia ≥ 16 karakter di badan permintaan, perbandingan waktu konstan, **gagal tertutup** bila properti `SECRET` kosong/pendek (diuji), tidak ada `doGet` yang mengembalikan data (diuji), penulisan diserialisasi `LockService`, sel berawalan `= + - @` dinetralkan di dua lapis (Worker dan skrip). Galat yang disimpan/ditampilkan dibersihkan dari URL dan rahasia (diuji). |
| S-11 | Google Sheet cadangan memuat data pribadi (HP, email, transaksi) | Sedang bila dibagikan | **Dimitigasi (prosedur)** | Panduan: jangan dibagikan; hanya pemilik. Tidak ada password, kunci passkey, atau hash. |
| S-12 | Ganti password sendiri tidak mencabut sesi lain/passkey | Info | **Dengan desain** | Berbeda dari reset oleh atasan (yang mencabut keduanya). Pelaku butuh password lama. |
| S-13 | Izin akun layanan Worker bertambah (Monitoring Viewer) | Rendah | **Dimitigasi** | Hanya-baca metrik; opsional; panduan menyebut proyek dan peran tepat. |

| S-14 | **Hapus permanen** proyek/perusahaan (tindakan merusak) | Tinggi bila salah | **Dimitigasi** (Tahap 10) | Hanya level ≥ 90 dengan izin `projects` (Direktur ke bawah ditolak 403, diuji di Worker dan e2e); konfirmasi nama dicek di server; penghapusan resumable dan atomik per langkah dengan dokumen induk terakhir; proyek yang sedang dihapus tidak bisa diaktifkan ulang; setiap commit membawa audit. Uji mutasi pada pengecekan level, nama konfirmasi, dan penjaga `deleting`. |
| S-15 | Cadangan Sheets dapat merusak teks (nomor HP, tanggal) lewat penafsiran otomatis Google Sheets | Sedang (integritas cadangan) | **Diperbaiki** (v0.10.0) | `Code.gs` menetapkan format teks sebelum menulis; tes mensimulasikan perilaku Sheets dan membuktikan pengubahan tanpa format. Sheet yang sudah terisi sebelum perbaikan perlu dibersihkan (RUNBOOK bagian 3). |

## Aksesibilitas dan responsif

`e2e/a11y.mjs`: axe-core 4.14 (WCAG 2.0/2.1 A dan AA) pada **19 keadaan** (semua halaman, modal Tambah akun / Catat transaksi, laci rincian dashboard, pratinjau impor, halaman login dan "Lupa password") × tema terang dan gelap × lebar 360 dan 1440 px.

Temuan awal dan perbaikannya:
- **Kontras warna** (575 simpul): teks sekunder `--fg-3` (4,0:1), serta hijau/kuning status di latar pilnya (4,4:1) di tema terang → token digelapkan menjadi ≥ 5:1. Tema gelap sudah memenuhi.
- **Indikator fokus keyboard**: tombol urut kolom dashboard dan nama barang kehilangan cincin fokus (`all: inherit/unset`); kolom bulan memakai cincin pucat; cincin kuning logo hanya 2,1:1 di latar putih → semua fokus kini cincin biru tema (≥ 6:1 di kedua tema).
- **"Pilih berkas" tidak dapat dicapai keyboard** (label di sekitar input tersembunyi) → kini tombol sungguhan.

Hasil akhir: **nol pelanggaran axe**; setiap elemen yang menerima fokus pada 5 halaman (40 tab) menampilkan indikator fokus; **tanpa scroll samping** pada semua halaman di **360, 390, 768, 1100, 1440 px**.

Belum dicakup: pembaca layar nyata (NVDA/VoiceOver), uji ponsel nyata (sidik jari/wajah dan keyboard virtual), dan WCAG 2.2 AA penuh.

## Cara mengulang
```powershell
cd app; npm audit --omit=dev
git log -p --all | Select-String "BEGIN PRIVATE KEY|private_key|client_email"
```
Uji otomatis: `e2e/csp.mjs`, `e2e/a11y.mjs`, tes Worker (invarian audit), tes aturan Firestore (lihat panduan Tahap 9).
