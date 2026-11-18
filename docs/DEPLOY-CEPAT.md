# Deploy Cepat (satu perintah)

Menggantikan deretan perintah manual di panduan penerapan. Dari folder repo di PowerShell:

```powershell
.\deploy.cmd
```
Atau klik dua kali `deploy.cmd` di File Explorer. Skrip akan:
1. memeriksa prasyarat (Git, Node, Firebase CLI) dan bahwa `public-config.json` sudah berisi nilai asli,
2. menampilkan versi yang akan di-deploy dan meminta konfirmasi,
3. **Worker** (`npm install` + `wrangler deploy`) → **aturan Firestore** → **aplikasi** (`npm install` + `npm run build` + Hosting),
4. memeriksa `/health` Worker sampai versinya sesuai, lalu mengingatkan memeriksa footer aplikasi.
Berhenti dengan pesan jelas di langkah pertama yang gagal.

## Opsi
| Perintah | Fungsi |
|---|---|
| `.\deploy.cmd -Pull` | ambil kode terbaru dulu (`git stash`, `git pull`, `git stash pop`), lalu deploy |
| `.\deploy.cmd -Test` | jalankan tes Worker dan aplikasi sebelum deploy |
| `.\deploy.cmd -OnlyHosting` | hanya aplikasi (juga `-OnlyWorker`, `-OnlyFirestore`) |
| `.\deploy.cmd -SkipFirestore` | lewati satu langkah (juga `-SkipWorker`, `-SkipHosting`) |
| `.\deploy.cmd -Yes` | tanpa pertanyaan konfirmasi |
| `.\deploy.cmd -Pull -Test -Yes` | kombinasi |

## Yang perlu sekali saja (bukan bagian skrip)
- `firebase login` dan `npx wrangler login` (sesi tersimpan di komputer Anda).
- Rahasia Worker: `npx wrangler secret put ...` (`FIREBASE_SERVICE_ACCOUNT`, `TURNSTILE_SECRET`, `BACKUP_WEBHOOK_URL`, `BACKUP_SECRET`). Skrip tidak pernah meminta atau menyimpan rahasia.
- Memperbarui **Apps Script** (`apps-script/Code.gs`) tetap manual di Google (tidak bisa dari skrip ini); lihat panduan tahap terkait.
- Nilai asli di `app/src/config/public-config.json` dan `turnstile.json` (jangan di-commit).

## Bila gagal
| Pesan | Perbaikan |
|---|---|
| `'firebase' tidak ditemukan` | `npm install -g firebase-tools`, lalu `firebase login` |
| `public-config.json masih berisi GANTI` | isi nilai asli (docs/TAHAP-2-PENERAPAN.md) |
| `git stash pop bentrok` | selesaikan konflik di berkas yang disebut, lalu jalankan lagi tanpa `-Pull` |
| Wrangler minta login | `npx wrangler login` lalu ulangi |
| Versi Worker belum sesuai | tunggu satu menit dan jalankan `.\deploy.cmd -OnlyWorker`, atau cek dashboard Cloudflare |
| Versi lama di footer | `Ctrl+F5` (cache browser) |
