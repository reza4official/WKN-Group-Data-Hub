# Tahap 2 (v0.2.0): Menerapkan ke Proyek Asli

Panduan untuk Windows PowerShell. Jalankan di folder repo (jalur yang mengandung spasi harus diberi tanda kutip).
Prasyarat: semua langkah di [`PERSIAPAN-TAHAP-2.md`](PERSIAPAN-TAHAP-2.md) bagian A, B, C1–C2 sudah selesai (Turnstile dan KV baru dipakai di Tahap 3).

> Kode sudah diuji lengkap di emulator. Yang **belum bisa diuji tanpa proyek asli**: pop-up Login Google yang sesungguhnya dan penayangan di `wkngroup-datahub.web.app`. Lihat langkah 8.

## 1. Ambil kode terbaru
```powershell
git pull
```

## 2. Deploy Worker lebih dulu (alamatnya dibutuhkan aplikasi)
```powershell
cd worker
npm install
npx wrangler login
```
Pasang service account sebagai secret (isi berkas dikirim lewat pipa, tidak perlu ditempel manual dan tidak masuk repo):
```powershell
Get-Content 'D:\jalur\ke\service-account.json' -Raw | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
npx wrangler deploy
```
Salin alamat yang tercetak, bentuknya `https://wkn-data-hub-api.<subdomain>.workers.dev`. Cek:
```powershell
Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health
```
Hasil yang benar: `ok: True`, `version: 0.2.0`.

## 3. Isi konfigurasi aplikasi
Buka `app/src/config/public-config.json`, ganti tiga nilai bertanda GANTI:
- `firebase.apiKey` dan `firebase.appId` dari blok `firebaseConfig` (Firebase Console → Project settings → Your apps).
- `apiUrl` dengan alamat Worker dari langkah 2.

Nilai ini publik dan aman masuk repo. Build produksi **sengaja gagal** selama masih ada GANTI, supaya v0.1.0 yang sedang berjalan tidak tergantikan oleh halaman login yang tidak berfungsi.

## 4. Terapkan aturan Firestore
```powershell
cd ..
firebase deploy --only firestore:rules
```

## 5. Buat akun Developer pertama (sekali saja)
```powershell
node scripts/bootstrap-developer.mjs --key 'D:\jalur\ke\service-account.json'
```
Skrip menanyakan username, nama, email Google, lalu password (tidak tampil di layar, minimal 6 karakter). Skrip menolak berjalan jika akun Developer sudah ada dan tidak menimpa apa pun.

## 6. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 7. Uji
Buka https://wkngroup-datahub.web.app dan periksa:
- Footer berakhir `v0.2.0`.
- Masuk dengan username dan password dari langkah 5. Menu Developer lengkap (11 menu).
- Tutup tab, buka lagi: tetap masuk (tidak ada auto logout).
- Salah password: pesan "Username atau password salah."
- Keluar, lalu masuk dengan **Login Google** memakai email dari langkah 5: berhasil masuk sebagai akun yang sama.
- Login Google dengan email lain (belum terdaftar): ditolak dengan pesan jelas.

## Alternatif: service account dari proyek Google Cloud lain (mis. `wkn-worker`)
Disarankan membuat service account **di dalam** `wkngroup-datahub`. Jika tetap ingin memakai akun yang dibuat di proyek lain, lakukan semua ini:

1. **Beri izin di proyek target.** Google Cloud Console, pilih proyek `wkngroup-datahub` → IAM & Admin → IAM → **Grant access**. Principal: email service account (mis. `firebase-authentication-admin@wkn-worker.iam.gserviceaccount.com`). Peran: **Firebase Authentication Admin** dan **Cloud Datastore User**.
2. **Aktifkan API di proyek pemilik kunci.** Pilih proyek `wkn-worker` → APIs & Services → Library: aktifkan **Cloud Firestore API** dan **Identity Toolkit API**. (Pemanggilan dihitung ke proyek pemilik kunci.)
3. **Bootstrap** dengan proyek target eksplisit:
```powershell
node scripts/bootstrap-developer.mjs --key 'D:\jalur\kunci.json' --allow-other-project --project wkngroup-datahub
```
4. Worker tidak perlu diubah: `FIREBASE_PROJECT_ID` sudah `wkngroup-datahub`.

**Risiko yang belum teruji:** Login Google memakai *custom token* yang ditandatangani service account ini. Untuk akun dari proyek lain, Firebase mungkin menolak token itu. Jika Login Google gagal dengan pesan "Login Google gagal" padahal username dan password berhasil, penyebabnya ini, dan solusinya membuat service account di dalam `wkngroup-datahub`.

## 8. Bila Login Google gagal
| Gejala | Penyebab dan solusi |
|--------|---------------------|
| Pesan `server_error - Firestore get gagal (403)` | Secret Worker masih berisi kunci dari proyek lain. Pasang ulang dengan kunci yang `project_id`-nya `wkngroup-datahub`, lalu `npx wrangler deploy`. Setiap kali kunci diganti, secret Worker harus dipasang ulang |
| Pop-up tidak terbuka | Izinkan pop-up untuk situs ini |
| `auth/unauthorized-domain` | Firebase Console → Authentication → Settings → Authorized domains, tambahkan `wkngroup-datahub.web.app` |
| Pesan "Tidak dapat terhubung ke server" | `apiUrl` salah, atau `ALLOWED_ORIGINS` di `worker/wrangler.toml` belum memuat origin Anda. Ubah lalu `npx wrangler deploy` ulang |
| Pop-up terbuka tetapi kosong atau diblokir | Kabari saya dengan pesan kesalahan dari Console browser (F12) |
| "Email Google ini belum terdaftar" padahal sudah | Email di akun harus sama dengan email Google yang dipilih (huruf besar/kecil tidak berpengaruh) |

## Menjalankan dan menguji secara lokal (tanpa menyentuh proyek asli)
Butuh Java 21 untuk emulator Firestore.
```powershell
npm install -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-wkn
```
Pengujian otomatis:
```powershell
cd worker; npm test            # Worker: token, CORS, alur Google
cd ..\app; npm test            # Aplikasi: komponen, identitas username, login
cd ..\rules-tests; npm install; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
Uji end-to-end (login sungguhan terhadap emulator) ada di folder `e2e/`.
