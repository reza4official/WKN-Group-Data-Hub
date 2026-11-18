# Tahap 6 (v0.6.0): Menerapkan ke Proyek Asli

Berisi: **Dashboard** (KPI, ringkasan per barang, perbandingan bulan lalu, pemakaian, estimasi hari stok, status, grafik per barang, perbandingan antar proyek).
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.5.x sudah tayang.

## 1. Ambil kode terbaru
```powershell
git pull
```

## 2. Deploy Worker (mencatat `lastTxDate` pada barang)
```powershell
cd worker
npm install
npx wrangler deploy
```
Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.6.0`.

## 3. Terapkan aturan Firestore
```powershell
cd ..
firebase deploy --only firestore
```
Hanya aturan yang berubah: total harian (`days`) kini dapat **dibaca** akun yang boleh membaca barang proyek itu (untuk grafik sisa stok 30 hari). Tulis tetap hanya Worker. Tidak ada indeks baru.

## 4. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Uji di produksi
1. Masuk sebagai Developer/Owner → menu **Dashboard**. Pilihan proyek: **Semua proyek** (bawaan bila lebih dari satu) atau satu proyek; pilih bulan (tidak bisa melewati bulan berjalan).
2. Ambil satu barang yang transaksinya Anda ketahui. Cocokkan dengan hitungan manual dari halaman **Transaksi Stok** bulan itu: **Awal** = Tersisa terakhir bulan lalu, **Masuk/Keluar** = jumlah kolom (setelah koreksi), **Sisa** = Awal + Masuk − Keluar, **Pemakaian** = Keluar ÷ (Awal + Masuk).
3. Klik nama barang: grafik **Sisa stok 30 hari** (garis merah = batas minimum) dan **Masuk dan keluar 6 bulan**.
4. Koreksi satu transaksi masuk di Transaksi Stok → dashboard menurunkan Masuk dan Sisa sesuai (koreksi tidak dihitung ganda).
5. Masuk sebagai Manajer Proyek: pilihan proyek hanya proyek yang ditugaskan.

## Cara membaca angka
- **Laju harian** = Keluar ÷ jumlah hari berjalan (bulan berjalan: sampai hari ini; bulan lampau: hari penuh; bila saldo awal baru ada di tengah bulan, dihitung sejak tanggal itu). **Perubahan** dibanding bulan lalu memakai laju ini, bukan total, agar adil.
- **Cukup (hari)** = Sisa ÷ laju harian. Kosong bila belum ada pemakaian.
- **Status:** *Kritis* = sisa ≤ batas minimum; *Menipis* = sisa ≤ 1,5 × batas minimum; *Tidak bergerak* = tidak ada barang masuk/keluar 14 hari atau lebih (hanya dinilai untuk bulan berjalan); selain itu *Aman*. Koreksi tidak dianggap pergerakan.
- Pada **Semua proyek**, barang yang sama dijumlahkan lintas proyek (jumlah, batas minimum, laju) dan statusnya dihitung ulang dari jumlah itu.
- **Perbandingan antar proyek** memakai persentase pemakaian rata-rata (tanpa satuan), jumlah transaksi, dan jumlah barang kritis/menipis/tidak bergerak.

## Catatan kuota baca (paket gratis, 50.000 per hari)
Dashboard tidak membaca transaksi mentah. Satu muat membaca: katalog (1 dokumen per jenis barang) + per proyek: dokumen barang + paling banyak 2 dokumen total bulanan per barang (bulan ini dan lalu). Contoh satu proyek dengan 20 barang dan katalog 30 jenis: kurang dari 100 dokumen. **Semua proyek** mengalikan bagian per proyek dengan jumlah proyek. Rincian satu barang menambah paling banyak 30 total harian + 6 total bulanan per proyek, hanya saat barang dibuka.

## Batasan yang diketahui
- Barang yang transaksinya dicatat sebelum v0.6.0 belum punya tanggal transaksi terakhir; status *Tidak bergerak* baru dinilai setelah ada transaksi baru (barang tanpa transaksi sama sekali dinilai sejak tanggal saldo awal).
- Grafik "aktivitas 30 hari" di mockup digantikan grafik per barang (sisa stok 30 hari dan masuk/keluar 6 bulan), karena aktivitas harian seluruh proyek menuntut membaca banyak dokumen.

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
End-to-end dengan emulator (aturan aktif): `e2e/tahap6.mjs` (tanggal dihitung relatif terhadap hari ini).
