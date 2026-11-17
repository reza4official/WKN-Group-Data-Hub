# Riwayat Perubahan

Format versi: vX.X.X (major.minor.patch). Patch untuk perbaikan, minor untuk fitur, major untuk perubahan besar.

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
