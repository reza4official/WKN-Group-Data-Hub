# WKN Group Data Hub

Pusat data PT. Wiratama Karya Nugraha (WKN) dan anak perusahaan. Tahap awal: manajemen inventory per proyek.

- Rencana dan rancangan: [`docs/RENCANA-PROYEK.md`](docs/RENCANA-PROYEK.md)
- Tahap pengerjaan: [`docs/TAHAP-PENGERJAAN.md`](docs/TAHAP-PENGERJAAN.md)
- Menerapkan Tahap 2 ke proyek asli: [`docs/TAHAP-2-PENERAPAN.md`](docs/TAHAP-2-PENERAPAN.md)
- Menerapkan Tahap 3 ke proyek asli: [`docs/TAHAP-3-PENERAPAN.md`](docs/TAHAP-3-PENERAPAN.md)
- Menerapkan Tahap 4 (dan login biometrik): [`docs/TAHAP-4-PENERAPAN.md`](docs/TAHAP-4-PENERAPAN.md)
- Menerapkan Tahap 5 (transaksi stok): [`docs/TAHAP-5-PENERAPAN.md`](docs/TAHAP-5-PENERAPAN.md)
- Menerapkan Tahap 6 (dashboard): [`docs/TAHAP-6-PENERAPAN.md`](docs/TAHAP-6-PENERAPAN.md)
- Menerapkan Tahap 7 (ekspor/impor): [`docs/TAHAP-7-PENERAPAN.md`](docs/TAHAP-7-PENERAPAN.md)
- Menerapkan Tahap 8 (profil, database karyawan): [`docs/TAHAP-8-PENERAPAN.md`](docs/TAHAP-8-PENERAPAN.md)
- Tutorial gabungan Tahap 8 dan 9: [`docs/TAHAP-8-9-PENERAPAN-GABUNGAN.md`](docs/TAHAP-8-9-PENERAPAN-GABUNGAN.md)
- Menerapkan Tahap 9 (cadangan Sheets, kuota, impor penyiapan): [`docs/TAHAP-9-PENERAPAN.md`](docs/TAHAP-9-PENERAPAN.md)
- Tinjauan keamanan dan aksesibilitas: [`docs/KEAMANAN-TAHAP-9.md`](docs/KEAMANAN-TAHAP-9.md)
- Deploy satu perintah: [`docs/DEPLOY-CEPAT.md`](docs/DEPLOY-CEPAT.md) (`.\deploy.cmd`)
- Tahap 10 (calon rilis, hapus data uji, checklist rilis): [`docs/TAHAP-10-PENERAPAN.md`](docs/TAHAP-10-PENERAPAN.md)
- Panduan pengguna per role: [`docs/PANDUAN-PENGGUNA.md`](docs/PANDUAN-PENGGUNA.md) · Runbook: [`docs/RUNBOOK.md`](docs/RUNBOOK.md) · Migrasi data nyata: [`docs/MIGRASI-DATA-NYATA.md`](docs/MIGRASI-DATA-NYATA.md)
- Mockup interaktif: [`mockup/index.html`](mockup/index.html)
- Riwayat perubahan: [`CHANGELOG.md`](CHANGELOG.md)

## Struktur

| Folder | Isi |
|--------|-----|
| `app/` | Aplikasi web (Vite + React + TypeScript) |
| `worker/` | Cloudflare Worker (API): login Google, akun, role, reset password, audit |
| `shared/` | Daftar izin dan role bawaan (sumber tunggal) |
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
