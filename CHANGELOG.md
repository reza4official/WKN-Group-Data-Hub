# Riwayat Perubahan

Format versi: vX.X.X (major.minor.patch). Patch untuk perbaikan, minor untuk fitur, major untuk perubahan besar.

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
