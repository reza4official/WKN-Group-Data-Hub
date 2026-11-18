# Tahap 7 (v0.7.0): Menerapkan ke Proyek Asli

Berisi: **ekspor Excel dan PDF** (transaksi dan ringkasan per barang) serta **impor transaksi dari Excel** dengan pratinjau validasi.
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.6.x sudah tayang.

## 1. Ambil kode terbaru dan pasang paket
```powershell
git pull
cd app
npm install
cd ..
```
`npm install` memasang `exceljs`, `jspdf`, dan `jspdf-autotable` (semuanya dari npm; tidak ada unduhan dari CDN). Pustaka ini dimuat hanya saat halaman Impor/Ekspor dipakai, jadi halaman lain tidak menjadi lebih berat.

## 2. Deploy Worker (rute baru `/ledger/import`)
```powershell
cd worker
npm install
npx wrangler deploy
```
Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.7.0`.

## 3. Aturan Firestore
Tidak berubah di tahap ini (impor ditulis Worker seperti transaksi biasa). Tidak ada indeks baru.

## 4. Build dan deploy aplikasi
```powershell
cd app
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Uji di produksi (gunakan proyek percobaan)
**Ekspor**
1. Menu **Impor / Ekspor** → pilih proyek dan bulan → **Excel (.xlsx)**. Buka di Excel: lembar *Transaksi* dan *Ringkasan*, kop berisi proyek, periode, pembuat, dan waktu cetak (WITA). Angka berformat angka (bukan teks).
2. **PDF**: kop berlogo, tabel, nomor halaman. Cocokkan beberapa angka dengan halaman Transaksi Stok dan Dashboard bulan yang sama.

**Impor**
1. **Unduh template Excel** (proyek yang dipilih). Lembar *Barang* berisi nama barang yang sah; salin persis.
2. Isi lembar *Transaksi* (Tanggal `YYYY-MM-DD`, Nama Barang, Jenis `Masuk`/`Keluar`, Jumlah, Keterangan). Sertakan sengaja satu baris salah (nama barang ngawur) dan satu keluar yang melebihi stok.
3. Unggah. **Pratinjau** menandai baris salah beserta alasannya dan memberi perkiraan jumlah penulisan.
4. **Impor N baris valid**. Hasil: berapa diimpor, berapa ditolak server (dengan nomor baris Excel dan alasan).
5. Buka **Transaksi Stok**: baris masuk atas nama Anda dengan waktu catat; Tersisa benar. Catatan di **Log Audit**: *Impor transaksi* (berkas, jumlah diterima/ditolak).

## Cara kerja dan batasannya
- **Berkas tidak dikirim ke server.** Excel dibaca di perangkat; yang dikirim hanya baris valid (tanggal, barang, jenis, jumlah, keterangan). Maks. 2 MB dan 3.000 baris per berkas; hanya `.xlsx`.
- **Penulisan lewat Worker**, dipecah per 150 baris dan 10 barang berbeda per permintaan (menjaga batas 50 sub-permintaan Worker paket gratis dan 500 penulisan per commit). Tiap permintaan satu commit atomik: transaksi, stok, total harian, total bulanan, dan satu catatan audit.
- **Aturan stok sama seperti Transaksi Stok:** tanggal tidak sebelum saldo awal dan tidak di masa depan; stok tidak boleh negatif pada titik waktu mana pun. Di dalam berkas, **barang masuk diproses lebih dulu, lalu barang keluar menurut tanggal**; keluar yang membuat saldo negatif ditolak, baris lain tetap masuk.
- **Aman diulang:** kegagalan jaringan menyisakan pratinjau; menekan Impor lagi memakai sesi yang sama sehingga baris yang sudah masuk dilewati (tidak ganda). Mengunggah ulang berkas yang sama sebagai berkas baru akan mencatat ulang (itu dianggap impor baru).
- **Izin:** impor butuh `import` + `inventory.write` + penugasan ke proyek. Bawaan: Manajer Proyek, Owner, Direktur, Developer. Admin Logistik secara bawaan hanya boleh ekspor; atur di Role & Akses bila perlu.
- **Keamanan berkas:** sel teks yang diawali `=`, `+`, `-`, `@` diberi awalan saat ekspor/template agar tidak dibaca Excel sebagai rumus.
- **Kuota tulis (gratis 20.000/hari):** perkiraan tampil di pratinjau (≈ 1 per transaksi + total harian/bulanan). Impor besar memakai kuota yang sama dengan pencatatan harian.

## Penyimpangan dari rencana
- Rencana memakai SheetJS dari cdn.sheetjs.com. Diganti **ExcelJS dari npm** karena SheetJS tidak dapat dipasang dari lingkungan pengembangan dan agar `npm install` cukup satu langkah; fungsinya setara untuk kebutuhan ini.

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
```
End-to-end dengan emulator: `e2e/tahap7.mjs` (membuat dan membaca berkas Excel sungguhan, unduhan PDF, dan impor lewat Worker).
