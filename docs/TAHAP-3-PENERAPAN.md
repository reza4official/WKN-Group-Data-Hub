# Tahap 3 (v0.3.0): Menerapkan ke Proyek Asli

Panduan untuk Windows PowerShell, dijalankan di folder repo (jalur berspasi diberi tanda kutip).
Kode sudah lulus uji lokal dengan emulator, **termasuk Firestore Rules yang aktif**. Yang baru bisa dibuktikan setelah penerapan: Turnstile asli dan perilaku sesi setelah reset password (langkah 7).

## 1. Ambil kode terbaru
```powershell
git pull
```

## 2. Siapkan Turnstile dan KV (Cloudflare, gratis)
Jika belum, ikuti `PERSIAPAN-TAHAP-2.md` bagian C3 dan C4. Anda membutuhkan:
- **Site Key Turnstile** (publik) dan **Secret Key** (rahasia).
- **ID namespace KV** `wkn-ratelimit` (Cloudflare → Workers & Pages → KV).
- Hostname widget Turnstile harus memuat `wkngroup-datahub.web.app`.

## 3. Isi konfigurasi publik
1. `app/src/config/turnstile.json`: ganti `GANTI-turnstile-site-key` dengan Site Key. Bila dibiarkan, tombol permintaan reset di halaman login disembunyikan dan yang tampil hanya petunjuk menghubungi atasan.
2. `worker/wrangler.toml`: hapus tanda `#` pada blok `[[kv_namespaces]]` dan isi `id` dengan ID namespace KV. KV bersifat opsional; tanpa itu hanya pembatas laju sekunder yang tidak aktif (Turnstile tetap melindungi).

## 4. Pasang rahasia Turnstile dan deploy Worker
```powershell
cd worker
npm install
npx wrangler secret put TURNSTILE_SECRET
```
Tempel Secret Key saat diminta (tidak tampil di layar). Lalu:
```powershell
npx wrangler deploy
```
Cek: `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` harus menampilkan `version: 0.3.0`.
Tanpa `TURNSTILE_SECRET`, permintaan reset dari halaman login **ditolak** (gagal tertutup, kode `unavailable`).

## 5. Terapkan aturan Firestore
```powershell
cd ..
firebase deploy --only firestore
```

## 6. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 7. Uji di produksi
Masuk sebagai Developer, lalu:
1. **Akun Pengguna**: buat satu *Manajer Proyek* dan satu *Admin Logistik*.
2. Keluar, masuk sebagai Manajer Proyek: menu hanya Dashboard, Transaksi Stok, Akun Pengguna, Permintaan Reset, Impor/Ekspor, Profil. Role yang ditawarkan saat membuat akun hanya *Admin Logistik*. Alamat `#roles` dan `#audit` menampilkan "Akses ditolak".
3. Keluar, di halaman login klik **Lupa password? Minta reset ke atasan**, isi username Admin Logistik, selesaikan Turnstile, kirim.
4. Masuk sebagai Manajer Proyek → **Permintaan Reset** → Eksekusi reset dengan password baru. Pelaku dan waktu (WITA) tampil.
5. Masuk sebagai Admin Logistik dengan password baru: berhasil. Password lama: gagal.
6. Masuk sebagai Developer → **Log Audit**: terlihat tambah akun, minta reset, reset password (nama Manajer Proyek), lengkap dengan waktu WITA. Tidak ada password dalam catatan.
7. **Role & Akses**: ubah izin role Manajer Proyek, simpan, dan lihat entri "Ubah role" di Log Audit.

**Yang perlu Anda amati di langkah 5:** setelah reset, apakah Admin Logistik yang masih terbuka di perangkat lain keluar sendiri pada saat token barunya diminta (maksimal sekitar satu jam). Itu perilaku yang diharapkan karena sesi lama dicabut. Kabari saya bila ternyata tidak.

## Hal yang perlu diketahui
- **Developer tidak punya atasan.** Permintaan reset untuk Developer diabaikan; reset lewat Firebase Console (Authentication → Users → ⋮ → Reset password).
- **Cakupan Manajer Proyek.** Sampai Tahap 4, Manajer Proyek melihat dan mengelola **semua** akun berlevel di bawahnya, bukan hanya yang di proyeknya. Pembatasan per proyek hadir di Tahap 4 bersama data proyek.
- **Waktu** di Log Audit dan Permintaan Reset selalu WITA (Asia/Makassar), tidak bergantung jam perangkat.
- **Level role tidak bisa diubah** setelah dibuat. Jika butuh level lain, buat role baru lalu pindahkan akunnya.
- **Role sistem (Developer) terkunci.** Role bawaan lain dapat diubah izinnya oleh role di atasnya.
- KV gratis dibatasi sekitar 1.000 penulisan per hari. Pembatas ini hanya menulis satu kali per permintaan reset dan gangguannya tidak menggagalkan permintaan.

## Bila ada masalah
| Gejala | Penyebab dan solusi |
|--------|---------------------|
| Tombol "Lupa password" tidak tampil | `turnstile.json` belum diisi, atau build lama. Isi Site Key lalu build dan deploy ulang |
| Permintaan reset: `unavailable` | `TURNSTILE_SECRET` belum dipasang di Worker (langkah 4) |
| Permintaan reset: `turnstile` | Hostname widget Turnstile tidak memuat `wkngroup-datahub.web.app`, atau Site Key dan Secret Key tidak sepasang |
| Daftar akun/permintaan/audit gagal dimuat (`permission-denied`) | Aturan belum di-deploy (langkah 5), atau akun tidak punya izin untuk halaman itu |
| `forbidden` saat membuat akun | Role yang dipilih berizin lebih besar daripada izin Anda, atau levelnya tidak di bawah Anda |
| `conflict` atau `already_handled` | Data baru saja diubah orang lain. Muat ulang lalu coba lagi |
| `server_error - Firestore ... (403)` | Secret `FIREBASE_SERVICE_ACCOUNT` di Worker tidak sesuai proyek. Lihat `TAHAP-2-PENERAPAN.md` |

## Pengujian lokal
```powershell
cd worker; npm test                 # Worker: hirarki, eskalasi hak, balapan, Turnstile
cd ..\app; npm test                 # Aplikasi
cd ..\rules-tests; npm install; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
Uji end-to-end dengan emulator (aturan aktif): lihat folder `e2e/`.
