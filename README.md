# WKN Group Data Hub

Pusat data PT. Wiratama Karya Nugraha (WKN) dan anak perusahaan. Tahap awal: manajemen inventory per proyek.

- Rencana dan rancangan: [`docs/RENCANA-PROYEK.md`](docs/RENCANA-PROYEK.md)
- Tahap pengerjaan: [`docs/TAHAP-PENGERJAAN.md`](docs/TAHAP-PENGERJAAN.md)
- Mockup interaktif: [`mockup/index.html`](mockup/index.html)
- Riwayat perubahan: [`CHANGELOG.md`](CHANGELOG.md)

## Struktur

| Folder | Isi |
|--------|-----|
| `app/` | Aplikasi web (Vite + React + TypeScript) |
| `worker/` | Cloudflare Worker (API), kerangka |
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

## Deploy

Belum dikonfigurasi. Menunggu proyek Firebase (Tahap 0). Setelah itu ganti ID di `.firebaserc`, lalu:

```bash
cd app && npm run build && cd ..
firebase deploy --only hosting
```

Versi aplikasi berasal dari `app/package.json` dan ditampilkan di footer. Naikkan versi dan perbarui `CHANGELOG.md` pada setiap pembaruan.
