# Tahap 4 (v0.4.0): Menerapkan ke Proyek Asli

Berisi: perusahaan, proyek, katalog, barang + saldo awal, lingkup proyek, dan **login biometrik**.
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.3.0 sudah tayang (Worker, rahasia, Turnstile/KV bila dipakai).

## 1. Ambil kode terbaru
```powershell
git pull
```

## 2. Deploy Worker (ada rute baru)
```powershell
cd worker
npm install
npx wrangler deploy
```
Rahasia dan binding yang ada tidak berubah. Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.4.0`.

**Origin harus tepat.** `ALLOWED_ORIGINS` di `worker/wrangler.toml` sudah memuat `https://wkngroup-datahub.web.app`. Login biometrik menolak origin yang tidak ada di daftar itu.

## 3. Terapkan aturan dan **indeks** Firestore
```powershell
cd ..
firebase deploy --only firestore
```
Perintah ini memasang aturan **dan** dua indeks komposit baru (daftar akun dan permintaan reset berlingkup proyek). **Indeks butuh beberapa menit sampai siap.** Periksa di Firebase Console → Firestore Database → **Indexes**: kedua indeks (`users` dan `resetRequests`) harus berstatus *Enabled*.

> Selama indeks belum siap, halaman **Akun Pengguna** dan **Permintaan Reset** milik Manajer Proyek menampilkan galat "The query requires an index". Itu normal dan hilang sendiri setelah *Enabled*. Pengguna dengan izin "projects" (Owner, Direktur) tidak terpengaruh.

## 3b. Pembuatan data awal (lewat aplikasi, bukan skrip)
Skrip bootstrap tidak dijalankan ulang. Masuk sebagai Developer, lalu:
1. **Proyek & Perusahaan → Tambah perusahaan**: buat induk `PT. Wiratama Karya Nugraha` (jenis Induk), lalu anak perusahaan bila ada.
2. **Tambah proyek** untuk tiap proyek.
3. **Katalog Barang → Tambah barang**: nama, satuan, batas minimum bawaan.
4. Buka sebuah proyek (**Barang & saldo awal**) → **Tambah barang**, isi saldo awal dan tanggalnya.
5. **Akun Pengguna**: akun Manajer Proyek dan Admin Logistik kini harus **ditugaskan ke proyek** (pilih di formulir).

## 4. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Uji di produksi

**Lingkup proyek (penting, jangan dilewati)**
1. Masuk sebagai Manajer Proyek yang ditugaskan ke satu proyek. **Buka halaman Akun Pengguna**: harus tampil (bukan galat indeks) dan hanya berisi akun yang berbagi proyek dengannya. Ini satu-satunya hal yang tidak dapat diuji di emulator (indeks komposit).
2. Menu **Proyek & Perusahaan** hanya menampilkan proyeknya. Membuka alamat proyek lain (`#projects/<id>`) menampilkan "Proyek tidak dapat dibuka".
3. Buat akun Admin Logistik dari akun Manajer Proyek: pilihan proyek hanya proyek miliknya, dan minimal satu wajib dipilih.
4. Admin Logistik yang ditugaskan dapat menambah barang dan mengisi saldo awal di proyeknya.

**Login biometrik (uji di ponsel dan di laptop yang berbeda)**
1. Buka https://wkngroup-datahub.web.app di ponsel. Di halaman login, tombol ikon (sidik jari atau wajah) muncul **di samping tombol Masuk** bila perangkat mendukung.
2. Masuk dengan username dan password. Pop-up **Aktifkan login biometrik?** muncul. Tekan **Aktifkan sekarang**, lalu verifikasi dengan sidik jari, wajah, atau kunci layar.
3. Keluar, lalu ketuk tombol ikon: masuk tanpa mengetik password. Pop-up tidak muncul lagi setelah login biometrik.
4. **Lewati** pada pop-up: ditutup. Pop-up muncul lagi pada login password berikutnya selama belum diaktifkan.
5. **Profil Saya → Login biometrik**: daftar perangkat, tombol Hapus, dan tombol aktifkan ulang.
6. Minta atasan mereset password akun uji: login biometrik lama harus ditolak dan perangkatnya terhapus dari daftar.

## Batas login biometrik (jujur, bukan cacat)
- **Ikon hanyalah tebakan.** Tidak ada API web yang menyebutkan apakah perangkat memakai sidik jari atau Face ID. Aplikasi menebak dari jenis perangkat: iPhone dengan layar panjang ≥ 812 piksel dan iPad Pro → wajah (Face ID); iPhone tombol Home, iPad lain, Android, Mac, dan Windows → sidik jari (Windows Hello bisa berupa wajah, tidak dapat dibedakan). Jenis yang tampil saat diaktifkan dipakai terus di perangkat itu.
- **Browser tidak bisa memaksa biometrik.** "Didukung" berarti perangkat punya autentikator dengan verifikasi pengguna: sidik jari, wajah, **atau PIN/kunci layar/Windows Hello PIN**. Pop-up bisa muncul di perangkat tanpa sensor biometrik, dan sistem operasi boleh menerima PIN.
- **Passkey bisa tersinkron** lewat iCloud Keychain atau Google Password Manager ke perangkat lain pada akun Apple/Google yang sama. Karena itu penanda "aktif di perangkat ini" bersifat perkiraan.
- **Terikat pada satu alamat situs.** Passkey yang dibuat di `wkngroup-datahub.web.app` tidak berlaku di `wkngroup-datahub.firebaseapp.com`.
- Maksimal 5 perangkat per akun. Reset password atau penghapusan akun otomatis mencabut semua perangkat. Akun nonaktif tidak bisa masuk dengan biometrik.
- Hanya algoritma ES256 dan RS256 yang didukung (mencakup Apple, Android, Windows Hello, dan Chrome).

## Bila ada masalah
| Gejala | Penyebab dan solusi |
|--------|---------------------|
| Akun Pengguna atau Permintaan Reset gagal: "requires an index" | Indeks belum *Enabled*. Tunggu, atau jalankan `firebase deploy --only firestore` |
| Manajer Proyek tidak melihat menu Proyek & Perusahaan | Role belum memiliki izin `inventory.read`. Atur di Role & Akses |
| Tidak bisa membuat akun: "Pilih minimal satu proyek Anda" | Pelaku berlingkup proyek wajib menugaskan akun baru ke proyeknya sendiri |
| Tombol biometrik tidak tampil | Perangkat/browser tidak mendukung, atau situs tidak dibuka lewat HTTPS |
| Aktifkan biometrik: "Origin tidak diizinkan untuk biometrik" | Origin tidak ada di `ALLOWED_ORIGINS` Worker. Tambahkan lalu `npx wrangler deploy` |
| "Browser menolak karena alamat situs tidak cocok" (SecurityError) | Dibuka lewat alamat selain yang terdaftar (mis. alamat IP atau domain lain) |
| Login biometrik: "tidak berlaku lagi di perangkat ini" | Passkey dicabut (mis. setelah reset password). Masuk dengan password lalu aktifkan ulang |
| Ketuk tombol biometrik: "Ketuk sekali lagi" | Tantangan keamanan sedang diperbarui (berlaku ±2 menit). Ketuk sekali lagi |

## Pengujian lokal
```powershell
cd worker; npm test               # Worker: hirarki, lingkup proyek, WebAuthn (ES256/RS256)
cd ..\app; npm test               # Aplikasi
cd ..\rules-tests; npm install; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
End-to-end dengan emulator (aturan aktif): `e2e/` (`admin.mjs`, `tahap4.mjs`, `biometric.mjs`). Uji biometrik memakai autentikator virtual Chromium dan membuka `http://localhost:4173` (rpId WebAuthn tidak boleh berupa alamat IP).
