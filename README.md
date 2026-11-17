# WKN Group Data Hub

Pusat data PT. Wiratama Karya Nugraha (WKN) dan anak perusahaan. Tahap awal: manajemen inventory per proyek.

- Rencana dan rancangan: [`docs/RENCANA-PROYEK.md`](docs/RENCANA-PROYEK.md)
- Tahap pengerjaan: [`docs/TAHAP-PENGERJAAN.md`](docs/TAHAP-PENGERJAAN.md)
- Menerapkan Tahap 2 ke proyek asli: [`docs/TAHAP-2-PENERAPAN.md`](docs/TAHAP-2-PENERAPAN.md)
- Mockup interaktif: [`mockup/index.html`](mockup/index.html)
- Riwayat perubahan: [`CHANGELOG.md`](CHANGELOG.md)

## Struktur

| Folder | Isi |
|--------|-----|
| `app/` | Aplikasi web (Vite + React + TypeScript) |
| `worker/` | Cloudflare Worker (API): verifikasi token, login Google |
| `scripts/` | Skrip setup (akun Developer pertama) |
| `rules-tests/` | Uji aturan Firestore (emulator) |
| `e2e/` | Uji end-to-end terhadap emulator |
| `assets/` | Logo (latar transparan) |
| `docs/` | Dokumen rencana |
| `mockup/` | Mockup interaktif HTML |

## Menjalankan

Butuh Node.js 22.12 atau lebih baru.

```bash
cd app
npm install
npm run dev
```

Perintah lain di `app/`: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`.
Galeri komponen (hanya mode dev): buka `http://localhost:5173/#komponen`.

## Konfigurasi dan deploy

Isi `app/src/config/public-config.json` (apiKey, appId, alamat Worker). Build produksi gagal selama masih ada nilai GANTI.
Langkah lengkap: [`docs/TAHAP-2-PENERAPAN.md`](docs/TAHAP-2-PENERAPAN.md).

Versi aplikasi berasal dari `app/package.json` dan ditampilkan di footer. Naikkan versi dan perbarui `CHANGELOG.md` pada setiap pembaruan.
