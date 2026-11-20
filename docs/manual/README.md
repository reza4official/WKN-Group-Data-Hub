# Manual Book

- **[MANUAL-BOOK.pdf](MANUAL-BOOK.pdf)**: buku siap baca/cetak (A4, bernomor halaman, daftar isi berhalaman).
- `MANUAL-BOOK.html` (tidak disimpan di repositori): versi satu berkas untuk peramban, dihasilkan oleh `npm run manual-build`.
- **[MANUAL-BOOK.md](MANUAL-BOOK.md)**: sumber teks (Markdown). Tanda `{{fig:nama}}` disisipi gambar bernomor.
- `img/`: tangkapan layar dari aplikasi sungguhan beserta penanda bernomor. `contoh/`: template dan contoh berkas Excel.
- `shots.json`: daftar penanda dan legenda tiap gambar (sumber tunggal untuk gambar dan keterangannya).

## Membuat ulang setelah tampilan aplikasi berubah

Gambar dan buku dibuat otomatis dari aplikasi di emulator (tanpa menyentuh data asli):

1. Jalankan emulator Auth+Firestore, Worker dev (`e2e/worker-dev.ts`), dan sajikan build emulator di `:4173` (cara yang sama dengan `e2e/a11y.mjs`).
2. `cd e2e && npm run manual-shots` membuat ulang `img/*.png` dan `contoh/*.xlsx`; skrip gagal bila ada penanda yang tidak lagi menemukan elemennya (tanda bahwa `shots.json` perlu disesuaikan).
3. `npm run manual-build` menyusun `MANUAL-BOOK.html` dan `MANUAL-BOOK.pdf` (butuh `pdftotext` dan `pdftoppm`).

Ubah teks di `MANUAL-BOOK.md`, lalu jalankan langkah 3 saja.
