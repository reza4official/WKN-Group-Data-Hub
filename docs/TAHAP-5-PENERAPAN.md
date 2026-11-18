# Tahap 5 (v0.5.0): Menerapkan ke Proyek Asli

Berisi: **Transaksi Stok** (barang masuk, keluar, koreksi), total bulanan, dan aturan stok tidak boleh negatif.
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.4.x sudah tayang dan data Tahap 4 (proyek, katalog, barang + saldo awal) sudah ada.

## 1. Ambil kode terbaru
```powershell
git pull
```

## 2. Deploy Worker (ada rute baru `/ledger/add` dan `/ledger/correct`)
```powershell
cd worker
npm install
npx wrangler deploy
```
Rahasia dan binding tidak berubah. Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.5.0`.

## 3. Terapkan aturan Firestore
```powershell
cd ..
firebase deploy --only firestore
```
Hanya aturan yang berubah (baca buku transaksi dan total bulanan). **Tidak ada indeks baru** di tahap ini. Dua indeks Tahap 4 (`users`, `resetRequests`) tetap harus berstatus *Enabled* di Firebase Console → Firestore Database → Indexes.

## 4. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Uji di produksi
Gunakan satu barang uji dengan saldo awal 100 (mis. di proyek percobaan).

1. Masuk sebagai Admin Logistik yang ditugaskan ke proyek itu → menu **Transaksi Stok**. Pilih bulan saldo awal: baris **Saldo awal** tampil dengan Tersisa 100.
2. **Catat transaksi** → Barang masuk 40: baris baru, Tersisa 140, kolom **Dicatat oleh** berisi nama Anda dan waktu **WITA**.
3. Barang keluar 30: Tersisa 110. Total bulan di kaki tabel: masuk 40, keluar 30.
4. Barang keluar 5000: ditolak "Stok tidak cukup". Tidak ada baris baru.
5. Admin Logistik tidak melihat tombol **Koreksi**. Masuk sebagai Manajer Proyek di proyek yang sama: tombol **Koreksi** ada. Koreksi tanpa alasan ditolak; dengan alasan, baris koreksi muncul, asli bertanda *Sudah dikoreksi*, dan Tersisa mengikuti.
6. Log Audit (Developer/Owner/Direktur): **Barang masuk**, **Barang keluar**, **Koreksi transaksi** beserta pelaku dan alasan.
7. Admin Logistik proyek lain tidak melihat proyek ini di pilihan proyek.
8. Di bulan berikutnya, Tersisa awal harus melanjutkan saldo bulan sebelumnya.

## Catatan kuota (paket gratis)
Satu transaksi menulis sekitar 5 dokumen (buku, barang, total harian, total bulanan, audit). Batas gratis Firestore Spark: 20.000 penulisan per hari, jadi sekitar 4.000 transaksi per hari. Pembacaan: tabel satu bulan membaca entri bulan itu ditambah satu dokumen total per bulan per barang.

## Perilaku penting
- **Tidak ada ubah atau hapus.** Kesalahan diperbaiki dengan koreksi (entri pembalik) yang tercatat bersama alasan. Setiap transaksi hanya bisa dikoreksi satu kali.
- **Dalam satu hari barang masuk dihitung lebih dulu daripada keluar**, sehingga urutan input dalam satu hari tidak memengaruhi Tersisa.
- **Transaksi bertanggal mundur** diperiksa terhadap saldo terendah sesudah tanggalnya; bila ada tanggal yang menjadi negatif, ditolak dengan batas maksimal yang diperbolehkan.
- **Membalik barang masuk** ditolak bila stok sesudah tanggal itu sudah terpakai dan akan negatif.
- Saldo awal terkunci setelah barang punya transaksi.
- Kirim ulang karena jaringan putus aman: satu formulir memakai satu ID permintaan, sehingga tidak tercatat dua kali.
- Bila terlalu banyak pencatatan bersamaan pada satu barang, server menjawab `busy`; ulangi beberapa detik kemudian.

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
End-to-end dan uji konkurensi dengan emulator (aturan aktif): `e2e/tahap5.mjs` dan `e2e/ledger-concurrency.mjs` (prasyarat sama seperti `tahap4.mjs`; konkurensi hanya butuh emulator Auth+Firestore, Worker dev di :8787, dan akun Developer dari `scripts/bootstrap-developer.mjs --emulator`).
