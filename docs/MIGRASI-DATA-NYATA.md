# Panduan Migrasi Data Nyata (Tahap 10)

Tujuan: memasukkan data perusahaan, proyek, akun, katalog, saldo awal, dan riwayat transaksi sungguhan, lalu **membersihkan data uji**, dengan urutan yang menjaga kebenaran saldo.
Semua langkah memakai fitur aplikasi (tanpa skrip khusus). Disarankan satu orang (Developer/Owner) memegang proses ini.

## 0. Sebelum mulai
- [ ] Cadangan Sheets berjalan (Cadangan & Kuota → "Berhasil").
- [ ] Data uji lama dibersihkan **sebelum** data nyata masuk (bagian 7), supaya tidak bercampur.
- [ ] Siapkan di Excel: daftar perusahaan/proyek, daftar karyawan (nama, username, HP, email, role, proyek), katalog barang (nama baku, satuan, kategori, batas minimum), saldo awal per proyek (barang, jumlah, tanggal), dan transaksi lama bila ada.
- [ ] Putuskan **tanggal saldo awal** per proyek. Transaksi tidak bisa bertanggal sebelumnya.

## 1. Perusahaan dan proyek
**Proyek & Perusahaan → Tambah perusahaan** (induk dulu, lalu anak) → **Tambah proyek** (nama, lokasi, tanggal mulai). Nama perusahaan unik; nama proyek unik per perusahaan.

## 2. Katalog barang (impor)
**Impor / Ekspor → Jenis impor: Katalog barang → Unduh template** → isi (lihat lembar *Contoh Pengisian*) → unggah → periksa pratinjau → impor. Nama harus unik (huruf besar/kecil tidak dibedakan). Satuan tidak bisa diganti setelah dipakai proyek, jadi pastikan benar.

## 3. Saldo awal per proyek (impor)
Pilih proyek → **Jenis impor: Saldo awal proyek → Unduh template** (terisi nama semua barang katalog; isi Saldo Awal dan Tanggal untuk yang dipakai proyek itu; baris kosong dilewati) → unggah → impor. Ulangi per proyek.

## 4. Akun
**Akun Pengguna → Tambah akun** (username, nama, password awal, role, proyek, HP, email). Manajer Proyek dan Admin Logistik **wajib** ditugaskan ke proyek. Email kontak diisi bila orangnya akan memakai Login Google. Berikan password awal langsung ke orangnya; minta menggantinya di *Profil Saya*.

## 5. Riwayat transaksi (opsional, impor)
Pilih proyek → **Jenis impor: Transaksi stok** → unduh template (hanya barang bersaldo awal) → isi → unggah → impor.
- Barang masuk dalam berkas diproses lebih dulu, lalu keluar menurut tanggal; keluar yang membuat stok negatif ditolak dengan alasan.
- Berkas besar dipecah otomatis per 150 baris dan aman diulang (tidak tercatat ganda dalam sesi yang sama).
- Hati-hati kuota tulis harian gratis (±20.000 dokumen; satu transaksi ±5). Impor ribuan baris sebaiknya dibagi beberapa hari; pratinjau menampilkan perkiraan.

## 6. Rekonsiliasi (wajib sebelum dipakai)
Untuk tiap proyek:
- [ ] **Dashboard** → *Awal, Masuk, Keluar, Sisa* tiap barang cocok dengan hitungan manual Anda untuk bulan berjalan.
- [ ] **Transaksi Stok** bulan terakhir: kolom *Tersisa* terakhir = stok fisik/buku Anda.
- [ ] Jumlah baris yang berhasil diimpor = jumlah baris valid di Excel (hasil impor menampilkan diimpor, ditolak, dilewati).
- [ ] Ekspor Excel Transaksi + Ringkasan, simpan sebagai arsip serah terima.
- [ ] **Cadangkan sekarang**, lalu periksa Sheet.

## 7. Membersihkan data uji
1. **Cadangkan sekarang** (opsional, bila ada yang ingin disimpan).
2. **Proyek & Perusahaan → Hapus** untuk proyek/perusahaan uji (ketik nama untuk konfirmasi). Perusahaan menghapus semua proyeknya.
3. **Katalog Barang → ikon sampah** untuk barang uji yang tidak terpakai (barang yang masih dipakai proyek harus dilepas dengan menghapus proyeknya dulu).
4. **Akun Pengguna → Hapus** untuk akun uji.
5. Yang **tidak** terhapus (sengaja): **Log Audit** dan **isi Google Sheet cadangan**. Bersihkan lembar Sheet secara manual bila ingin Sheet bebas data uji, atau biarkan sebagai arsip (lembar *Audit* mencatat penghapusannya).

## 8. Pembekuan fitur dan serah terima
- Setelah rekonsiliasi lulus: **bekukan fitur** selama satu periode (disarankan 1 bulan kalender): hanya perbaikan kesalahan, tanpa fitur baru.
- Latih tiap role dengan [`PANDUAN-PENGGUNA.md`](PANDUAN-PENGGUNA.md) (sesi 30–45 menit per role: masuk, profil, tugas harian role itu, apa yang dilakukan bila salah catat atau lupa password).
- Simpan [`RUNBOOK.md`](RUNBOOK.md) di tempat yang bisa diakses Developer cadangan.
