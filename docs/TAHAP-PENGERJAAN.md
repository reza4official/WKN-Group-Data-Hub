# WKN Group Data Hub — Tahap Pengerjaan

Melengkapi `RENCANA-PROYEK.md`. Acuan tampilan: `mockup/index.html`. Logo: `assets/`.
Ukuran usaha: **S** (sekitar 1 sesi kerja), **M** (2–3 sesi), **L** (4 sesi atau lebih).
Setiap tahap berakhir dengan satu rilis berversi (vX.X.X), kriteria selesai yang bisa diperiksa, dan deploy ke https://wkngroup-datahub.web.app.

---

## Tahap 0 — Persiapan (dikerjakan pemilik, tanpa kode)

Panduan langkah demi langkah: [`PERSIAPAN-TAHAP-2.md`](PERSIAPAN-TAHAP-2.md).

| # | Tugas | Pelaku |
|---|-------|--------|
| 0.1 | Buat proyek Firebase (paket **Spark**), aktifkan Hosting, Authentication, Firestore. Project ID `wkngroup-datahub`; alamat aplikasi `https://wkngroup-datahub.web.app` | Pemilik |
| 0.2 | Aktifkan Authentication: **Email/Password** dan **Google** | Pemilik |
| 0.3 | Buat akun **Cloudflare** (Free), catat Account ID | Pemilik |
| 0.4 | Buat akun Cloudflare **Turnstile** (gratis), simpan site key dan secret | Pemilik |
| 0.5 | Buat **service account** Firebase untuk Worker (peran: Firebase Auth Admin + Cloud Datastore User). Simpan JSON hanya sebagai secret Wrangler, jangan masuk repo | Pemilik, dibantu |
| 0.6 | Siapkan data: daftar anak perusahaan, proyek awal, anggota tim, barang dan saldo awal (Excel) | Pemilik |
| 0.7 | Buat Google Sheet cadangan dan Apps Script web app (tahap 9) | Pemilik, dibantu |

**Selesai bila:** URL `wkngroup-datahub.web.app` menampilkan halaman default Firebase, dan semua kunci tersimpan aman di luar repo.

---

## Tahap 1 — v0.1.0 Fondasi dan tampilan

**Status: selesai di sisi kode. Deploy ke `wkngroup-datahub.web.app` menunggu Tahap 0.1 (proyek Firebase) dari pemilik.**

**Tujuan:** kerangka aplikasi yang tampil sama dengan mockup, belum ada data sungguhan.

- Inisialisasi repo: Vite + React + TypeScript, CSS token (tanpa Tailwind), ESLint, Prettier, Vitest, `firebase.json`, `.firebaserc`, `wrangler.toml`.
- Struktur: `app/` (frontend), `worker/` (Cloudflare Worker), `firestore.rules`, `docs/`, `assets/`.
- Token tema dari mockup (terang/gelap, biru, kuning, putih), font Inter + Space Grotesk.
- Komponen dasar: tombol, input, `PasswordInput` (ikon mata), tabel dengan penanda geser, kartu, modal, panel samping, toast, pill status.
- Layout: sidebar, bilah atas, footer `© Copyright 2026 | PT. Wiratama Karya Nugraha | Dibuat di Makassar | @reza4official_ | vX.X.X`.
- Versi: satu sumber di `package.json`, disuntikkan ke footer saat build. `CHANGELOG.md`.
- Logo untuk favicon, ikon PWA, header, login.
- Router berbasis hash, halaman kosong untuk semua menu.
- Deploy pertama ke Hosting, header keamanan (CSP, HSTS, dll.).

**Selesai bila:** build berhasil, tampil rapi di lebar 360–1440 px tanpa scroll samping, footer menunjukkan versi yang benar. Usaha: **M**.

---

## Tahap 2 — v0.2.0 Autentikasi dan Worker dasar

**Status: selesai dan teruji di produksi (v0.2.2). Login username dan Login Google berfungsi di `wkngroup-datahub.web.app`. Panduan: [`TAHAP-2-PENERAPAN.md`](TAHAP-2-PENERAPAN.md).**

**Tujuan:** pengguna dapat masuk. Hanya akun terdaftar yang bisa masuk.

- Worker: kerangka API, verifikasi ID token Firebase, CORS hanya untuk `https://wkngroup-datahub.web.app`, pembuat token akses Google OAuth dari service account.
- Login username + password: username dinormalisasi lalu dipetakan ke email sintetis, dokumen `usernames/{normalisasi}` menjaga keunikan. Satu-satunya aturan password: minimal 6 karakter (batas Firebase).
- Login Google: hanya untuk email yang cocok dengan akun terdaftar, selain itu langsung sign out dengan pesan jelas.
- Sesi permanen (tanpa auto logout). Cek flag `disabled` setiap aplikasi dibuka.
- Skrip pembuat akun **Developer** pertama (dijalankan sekali oleh pemilik).
- `firestore.rules` awal: tolak semua kecuali pembacaan profil sendiri.
- Penjaga rute berdasarkan role (belum penuh).

**Selesai bila:** login berhasil lewat username dan Google; email asing ditolak; akun nonaktif tidak bisa masuk; tidak ada logout otomatis setelah ditutup lama. Usaha: **M**.

---

## Tahap 3 — v0.3.0 Role, akun, dan reset password

**Status: kode selesai dan lulus uji emulator (aturan aktif, 25 skenario end-to-end). Penerapan: [`TAHAP-3-PENERAPAN.md`](TAHAP-3-PENERAPAN.md). Belum teruji: Turnstile asli dan perilaku sesi setelah reset di produksi.**

**Tujuan:** hirarki akses berjalan dan teraudit.

- Model role dinamis: level angka, izin per kunci. Role awal: Developer 100, Owner 90, Direktur 80, Manajer Proyek 50, Admin Logistik 20.
- Endpoint Worker: buat, ubah, hapus, nonaktifkan akun; reset password; semua hanya untuk level **di bawah** pelaku. Tolak eskalasi hak.
- Tambah role baru dan ubah matriks izin (hanya Developer, Owner, Direktur, dan hanya untuk level di bawah mereka).
- Permintaan reset password dari halaman login (Turnstile + batas laju di KV). Daftar permintaan, eksekusi oleh role mana pun di atasnya.
- `auditLog` hanya bisa ditambah, waktu dari server, memuat pelaku, aksi, target.
- Halaman: Akun Pengguna, Role & Akses, Permintaan Reset, Log Audit.
- Uji aturan hirarki dengan emulator Firebase.

**Selesai bila:** Manajer Proyek tidak dapat membuat atau mengubah akun setara atau di atasnya; tiap reset password tercatat siapa dan kapan; role baru dapat dibuat dan izinnya berlaku. Usaha: **L**.

---

## Tahap 4 — v0.4.0 Perusahaan, proyek, katalog, saldo awal (+ login biometrik)

**Status: kode selesai dan lulus uji emulator (aturan aktif). Penerapan: [`TAHAP-4-PENERAPAN.md`](TAHAP-4-PENERAPAN.md). Belum teruji: indeks komposit di Firestore asli (halaman Akun Pengguna milik Manajer Proyek) dan sensor biometrik perangkat nyata (pengujian memakai autentikator virtual).**

- Koleksi `companies`, `projects`, `catalog`, `projects/{id}/items`.
- Halaman Proyek & Perusahaan dan Katalog Barang (tambah, ubah, nonaktifkan). Nama barang unik di katalog.
- Penugasan anggota ke proyek. Cakupan akses per perusahaan dan proyek diterapkan di rules dan Worker.
- Saldo awal wajib: tanggal dan jumlah, dengan batas minimum stok per barang.
- Aturan Firestore untuk baca per cakupan.

**Selesai bila:** Manajer Proyek hanya melihat proyek yang ditugaskan; barang tanpa saldo awal tidak bisa dipilih untuk transaksi. Usaha: **M**.

---

## Tahap 5 — v0.5.0 Transaksi stok (ledger)

- Penulisan ledger **hanya lewat Worker** dalam satu transaksi Firestore: entri ledger + stok item + ringkasan bulanan + audit.
- Validasi: saldo awal wajib, tanggal tidak sebelum saldo awal dan tidak di masa depan, stok tidak boleh minus.
- Koreksi lewat entri pembalik yang merujuk entri asal. Tidak ada edit atau hapus.
- Halaman Transaksi Stok: tabel (Hari/Tanggal, Nama Barang, Satuan, Masuk, Keluar, Tersisa, Keterangan, pencatat, waktu). Kolom Tersisa dihitung saat tampil.
- Filter proyek, bulan, barang. Formulir catat transaksi.
- Pengujian konkurensi: dua transaksi bersamaan pada barang yang sama tidak boleh membuat stok minus.

**Selesai bila:** semua kolom model data tampil; koreksi menghasilkan ringkasan yang tepat; pelaku dan waktu tercatat di setiap baris. Usaha: **L**.

---

## Tahap 6 — v0.6.0 Dashboard

- Pembacaan hanya dari dokumen ringkasan bulanan (hemat kuota baca).
- Kartu KPI, tabel ringkasan per barang (awal, masuk, keluar, sisa), perbandingan bulan lalu berbasis laju per hari, persentase pemakaian, estimasi hari stok, status (Aman, Menipis, Kritis, Tidak bergerak).
- Grafik: pemakaian tertinggi, aktivitas 30 hari, tren sisa stok per barang.
- Filter proyek dan periode, pencarian, pengurutan.
- Perbandingan antar proyek.

**Selesai bila:** angka dashboard cocok dengan hitungan manual dari ledger pada data uji; satu muat dashboard membaca kurang dari 100 dokumen. Usaha: **M**.

---

## Tahap 7 — v0.7.0 Ekspor dan impor

- Ekspor Excel (SheetJS dari cdn.sheetjs.com) dan PDF (jsPDF + autotable) berkop logo, nama pembuat, waktu cetak.
- Impor: unduh template, unggah, pratinjau validasi per baris, konfirmasi. Penulisan lewat Worker dalam batch maks. 500, tercatat atas nama pelaku.
- Peringatan kuota tulis harian sebelum impor besar.
- Uji dengan file besar dan baris yang salah.

**Selesai bila:** hasil ekspor dibuka benar di Excel dan PDF; impor menolak baris salah dan hanya memasukkan baris valid. Usaha: **M**.

---

## Tahap 8 — v0.8.0 Profil dan Database Karyawan

- Profil: ganti nama, no. HP, email, password.
- Email di profil terpisah dari email sintetis login username.
- Database Karyawan (Developer, Owner, Direktur): cari, filter, ekspor. Perubahan profil langsung tampil di sini, lengkap dengan pengubah dan waktu.

**Selesai bila:** perubahan profil muncul di Database Karyawan; Manajer Proyek tidak bisa membukanya. Usaha: **S**.

---

## Tahap 9 — v0.9.0 Cadangan, Sheets, dan pengerasan

- Apps Script web app + Worker cron: salin data ke Google Sheets satu arah (cadangan, bukan sumber kebenaran).
- Pemantau kuota Firestore dan Worker dengan peringatan di aplikasi.
- Tinjauan keamanan: Rules lengkap diuji di emulator, header, batas laju, pencegahan eskalasi hak, pencatatan audit pada semua jalur tulis.
- Aksesibilitas (fokus keyboard, kontras, label), uji di ponsel nyata, PWA opsional.
- Uji beban sesuai skala data yang disepakati.

**Selesai bila:** cadangan harian terisi; tidak ada temuan keamanan tinggi yang terbuka; semua halaman lulus uji lebar 360–1440 px. Usaha: **M**.

---

## Tahap 10 — v1.0.0 Rilis resmi

- Migrasi data nyata: anak perusahaan, proyek, akun, katalog, saldo awal.
- Pelatihan singkat per role, panduan pengguna, runbook (reset, pemulihan dari cadangan).
- Pembekuan fitur satu periode, perbaikan temuan, tag rilis v1.0.0.

---

## Urutan dan ketergantungan

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
          └─ 3 butuh Worker dari 2
                    └─ 5 butuh katalog dan saldo awal dari 4
                              └─ 6 dan 7 butuh ledger dari 5
```
Tahap 8 dapat dikerjakan sejajar dengan tahap 6 atau 7.

## Aturan kerja tiap tahap

1. Kerjakan di branch kerja, commit kecil dan sering.
2. Naikkan versi dan perbarui `CHANGELOG.md` setiap rilis (patch: perbaikan, minor: fitur, major: perubahan besar).
3. Uji Rules dan Worker di emulator sebelum deploy.
4. Deploy ke Hosting hanya setelah kriteria selesai terpenuhi.
5. Setiap fitur tulis wajib mencatat pelaku dan waktu.

## Risiko utama

| Risiko | Penanganan |
|--------|------------|
| Kuota harian Spark habis (baca 50 rb, tulis 20 rb) | Dashboard dari ringkasan, impor berbatch, pemantau kuota di tahap 9 |
| Kebocoran service account | Hanya di secret Wrangler, rotasi bila perlu, akses minimum |
| Password lemah (hanya min. 6 karakter) | Keputusan pemilik; batas laju login dan Turnstile di reset |
| Cloudflare tidak bisa di depan `web.app` | Dipakai untuk Worker, Turnstile, KV; WAF baru mungkin bila punya domain sendiri |
| Perubahan kebijakan paket gratis | Cek ulang batas sebelum tahap 5 dan tahap 9 |

## Yang dibutuhkan dari pemilik, per tahap

- **Sebelum tahap 1:** tahap 0.1–0.5.
- **Sebelum tahap 4:** daftar anak perusahaan, proyek, anggota.
- **Sebelum tahap 5:** katalog barang dan saldo awal per proyek (Excel).
- **Sebelum tahap 9:** Google Sheet cadangan.
- **Sebelum tahap 10:** data karyawan dan akun awal.
