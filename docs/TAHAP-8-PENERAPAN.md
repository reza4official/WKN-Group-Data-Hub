# Tahap 8 (v0.8.0): Menerapkan ke Proyek Asli

Berisi: **Profil Saya** (ubah nama, no. HP, email, password), **Database Karyawan** (Developer, Owner, Direktur), dan template impor yang kini memuat **lembar Contoh Pengisian**.
Panduan untuk Windows PowerShell di folder repo. Prasyarat: v0.7.x sudah tayang.

## 1. Ambil kode terbaru
```powershell
git checkout -- app/package-lock.json
git pull
```
(Baris pertama hanya perlu bila `git pull` mengeluh soal `package-lock.json`.) Tidak ada paket baru di tahap ini.

## 2. Deploy Worker (rute baru `/profile/update` dan `/profile/change-password`)
```powershell
cd worker
npm install
npx wrangler deploy
```
Cek `Invoke-RestMethod https://wkn-data-hub-api.<subdomain>.workers.dev/health` → `version: 0.8.0`.

## 3. Terapkan aturan Firestore (**wajib**)
```powershell
cd ..
firebase deploy --only firestore
```
Aturan berubah: pemegang izin `employees` (bawaan: Developer, Owner, Direktur) kini boleh membaca **semua** akun (untuk Database Karyawan). Tanpa langkah ini, halaman Database Karyawan menampilkan galat izin. Tidak ada indeks baru. Izin `users` saja tidak memberi akses ke database ini.

## 4. Build dan deploy aplikasi
```powershell
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Uji di produksi
**Profil Saya** (masuk sebagai Admin Logistik atau Manajer Proyek)
1. Menu **Profil Saya** → ubah nama, no. HP, dan email → **Simpan perubahan**. Nama di bilah atas ikut berubah.
2. Coba email yang dipakai akun lain → ditolak "sudah dipakai akun lain".
3. **Ganti password**: password lama salah → ditolak; benar → berhasil dan Anda tetap masuk. Keluar, lalu masuk dengan password baru. Setiap kolom password punya ikon mata.

**Database Karyawan** (masuk sebagai Developer/Owner/Direktur)
1. Menu **Database Karyawan**: daftar semua akun dengan nama, username, HP, email, role, status, dan **terakhir diperbarui oleh siapa dan kapan (WITA)**. Perubahan yang baru Anda lakukan di langkah sebelumnya sudah tampil.
2. Cari (nama/username/HP/email), filter role, status, proyek. **Excel** dan **PDF** mengekspor data yang sedang tersaring.
3. Masuk sebagai Manajer Proyek: menu tidak ada, dan membuka `#employees` menampilkan "Akses ditolak".
4. **Log Audit**: *Ubah data diri* (sebelum/sesudah) dan *Ganti password sendiri* (tanpa password).

**Template impor (Tahap 7)** → Unduh template: lembar **Contoh Pengisian** berisi contoh benar dan salah memakai nama barang proyek Anda; lembar ini tidak diimpor. Arahkan kursor ke judul kolom di lembar Transaksi untuk catatan format.

## Cara kerja dan batasannya
- **Perubahan data diri hanya lewat Worker.** Klien tidak bisa menulis dokumen akun (aturan menolak). Rute ini hanya mengubah nama, HP, dan email milik pelaku sendiri; role, level, proyek, status, dan username tidak bisa diubah dari sini apa pun isi permintaannya.
- **Email kontak** juga dipakai untuk Login Google dan harus unik. Mengubah email memindahkan hak Login Google ke email baru; email yang kosong berarti akun itu tidak bisa Login Google.
- **Ganti password** meminta password lama: aplikasi memasukkan ulang password lama ke Firebase (reautentikasi), lalu Worker hanya menerima bila token berasal dari login password dalam 5 menit terakhir. Catatan audit ditulis lebih dulu. Sesi dan passkey tidak dicabut (berbeda dari reset oleh atasan, yang mencabut keduanya).
- **Database Karyawan** membaca langsung dokumen akun, jadi tidak ada salinan data yang bisa tidak sinkron. "Terakhir diperbarui" memakai pengubah/waktu terakhir pada akun (profil, pengubahan oleh atasan, atau status); akun yang belum pernah diubah menampilkan pembuat dan waktu dibuat. Reset password oleh atasan dicatat di Log Audit, bukan di kolom ini.
- Satu muat membaca satu dokumen per akun ditambah role dan proyek (puluhan hingga ratusan dokumen).

## Pengujian lokal
```powershell
cd worker; npm test; cd ..
cd app; npm test; cd ..
firebase emulators:exec --only firestore --project demo-wkn "npm --prefix rules-tests test"
```
End-to-end dengan emulator (aturan aktif): `e2e/tahap8.mjs` (reautentikasi password nyata, ekspor Excel, akses per role).
