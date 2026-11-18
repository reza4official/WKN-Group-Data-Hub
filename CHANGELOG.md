# Riwayat Perubahan

Format versi: vX.X.X (major.minor.patch). Patch untuk perbaikan, minor untuk fitur, major untuk perubahan besar.

## v0.4.0 — Tahap 4: Perusahaan, proyek, katalog, saldo awal, lingkup proyek (+ login biometrik)

- **Perusahaan & Proyek**: tambah dan ubah perusahaan (induk/anak) dan proyek (status, lokasi, tanggal mulai); nonaktifkan, bukan hapus.
- **Katalog Barang**: daftar baku satu grup; nama unik (tanpa membedakan huruf besar/kecil dan spasi tepi); barang yang sudah dipakai proyek tidak bisa dinonaktifkan atau diganti satuannya.
- **Barang & saldo awal per proyek**: jumlah dan tanggal saldo awal, batas minimum per proyek; barang tanpa saldo awal ditandai dan belum bisa menerima transaksi. Saldo awal terkunci setelah ada transaksi (Tahap 5).
- **Lingkup proyek**: Manajer Proyek dan Admin Logistik hanya melihat dan mengelola proyek serta akun yang ditugaskan kepadanya. Akun baru oleh pelaku berlingkup wajib menugaskan minimal satu proyek miliknya, dan proyek target di luar lingkup pelaku tidak ikut hilang saat diubah. Izin "projects" kini berarti melihat dan mengelola SEMUA proyek.
- **Penugasan proyek** saat membuat dan mengubah akun; kolom Proyek di daftar akun.
- Validasi jumlah (tidak negatif, maksimal 3 desimal, bukan NaN) dan tanggal "tidak di masa depan" menurut WITA (bukan UTC).
- `firestore.rules` dan indeks: daftar akun dan permintaan reset dibatasi lingkup proyek (butuh indeks komposit; deploy dengan `firebase deploy --only firestore`).
- Tes: Worker 79, aplikasi 59, aturan Firestore 20, end-to-end Tahap 4 (29 skenario, aturan aktif).

## v0.3.0 — Tahap 3: Role, akun bawahan, reset password, log audit

- Halaman **Akun Pengguna**: tambah, ubah, nonaktifkan/aktifkan, hapus, dan reset password akun, hanya untuk level di bawah pelaku.
- Halaman **Role & Akses**: hirarki role, matriks izin yang dapat diedit, role baru, hapus role. Role sistem (Developer) terkunci; level role tidak berubah setelah dibuat.
- Halaman **Permintaan Reset**: daftar permintaan, eksekusi oleh atasan dengan pencatatan pelaku dan waktu (WITA).
- Halaman **Log Audit**: catatan permanen siapa melakukan apa dan kapan, dapat dicari.
- Permintaan reset dari halaman login (Cloudflare Turnstile + pembatas laju KV); jawabannya selalu seragam agar daftar username tidak dapat ditebak.
- Worker: endpoint `/users/*`, `/roles/*`, `/resets/execute`, `/auth/reset-request`. Pelaku dimuat ulang dari Firestore pada setiap permintaan; level dan izin tidak pernah dipercaya dari klien.
- Pencegahan eskalasi hak: target dan role harus berlevel di bawah pelaku, role yang diberikan hanya boleh berizin subset dari izin pelaku, hanya izin milik pelaku yang boleh diubah di matriks.
- Setiap perubahan ditulis atomik bersama entri audit (waktu dari server). Reset password memakai klaim berprasyarat sehingga dua atasan tidak bisa sama-sama mengeksekusi; kegagalan di Auth dibatalkan dan dicatat.
- Reset password mencabut sesi lama akun tersebut.
- `firestore.rules`: daftar akun, permintaan reset, dan log audit hanya dapat dibaca sesuai level dan izin; semua penulisan hanya lewat Worker.
- Daftar izin dan role bawaan kini satu sumber: `shared/permissions.json`.
- Tes: Worker (56 + skenario hirarki), aplikasi (46), aturan Firestore (13), end-to-end 25 skenario.

## v0.2.2

- Worker menyertakan ringkasan langkah yang gagal pada `server_error` (tanpa rahasia); aplikasi menampilkannya di pesan gagal Login Google.

## v0.2.1

- Pesan gagal Login Google kini menyertakan kode kesalahan dari server untuk memudahkan penelusuran.

## v0.2.0 — Tahap 2: Autentikasi dan Worker dasar

- Login username + password. Username bebas (spasi, simbol, Unicode); satu-satunya aturan password: minimal 6 karakter (batas Firebase).
- Login Google hanya untuk akun yang sudah didaftarkan atasan (dicocokkan lewat email); akun Google yang tidak terdaftar ditolak dan dibuang.
- Sesi permanen (tanpa auto logout); gangguan jaringan tidak mengeluarkan pengguna.
- Akun nonaktif atau tanpa profil ditolak dengan pesan jelas.
- Menu dan halaman dibatasi menurut izin role (penjaga rute dasar); kartu pengguna dan tombol Keluar di sidebar.
- Cloudflare Worker: verifikasi ID token Firebase (JWKS), CORS terkunci ke origin aplikasi, penukaran login Google (`/auth/google-link`).
- `firestore.rules` awal: tolak semua, kecuali baca profil sendiri dan daftar role oleh akun aktif.
- Skrip `scripts/bootstrap-developer.mjs`: akun Developer pertama dan role bawaan (aman diulang, tidak menimpa).
- Konfigurasi publik di `app/src/config/public-config.json`; build produksi gagal bila belum diisi.
- Header keamanan dibatasi ke halaman aplikasi agar jalur `/__/` milik Firebase (login Google) tidak terblokir.
- Perbaikan: input password tidak lagi memaksa `autocomplete="off"` sehingga pengelola password dapat mengisi form login.
- Tes: Worker (17), aplikasi (27), aturan Firestore (7) dan uji end-to-end terhadap emulator.

## v0.1.0 — Tahap 1: Fondasi dan tampilan

- Kerangka aplikasi Vite + React + TypeScript di `app/`.
- Tema terang dan gelap berbasis warna logo (biru, kuning, putih), pilihan tema tersimpan.
- Layout responsif: sidebar (menu seluler dengan scrim), bilah atas, footer berversi.
- Komponen dasar: tombol, input, input password dengan ikon mata, kartu, pill, tabel dengan penanda geser, keadaan kosong, modal dan panel samping, toast.
- Halaman kerangka untuk semua menu, dengan keterangan versi kehadiran fitur.
- Versi aplikasi satu sumber (`app/package.json`), tampil di footer.
- Logo (latar transparan), favicon, ikon PWA, manifest.
- Konfigurasi Firebase Hosting (`firebase.json`) dengan header keamanan dan cache.
- Kerangka Cloudflare Worker (`worker/`) dengan titik `/health`.
- Tes dasar (Vitest), ESLint, Prettier.
