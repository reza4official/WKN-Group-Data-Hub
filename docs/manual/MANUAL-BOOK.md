# Manual Book WKN Group Data Hub

**Panduan lengkap penggunaan aplikasi, dari masuk pertama kali sampai impor dan ekspor data**

PT. Wiratama Karya Nugraha · Versi aplikasi **v1.0.0** · Alamat aplikasi: https://wkngroup-datahub.web.app

<!--pagebreak-->

{{toc}}

<!--pagebreak-->

# Bab 1. Pendahuluan

## 1.1 Untuk apa aplikasi ini

WKN Group Data Hub adalah pusat data stok bahan dan material seluruh proyek di PT. Wiratama Karya Nugraha dan anak perusahaannya. Setiap barang yang masuk dan keluar dicatat per proyek, lengkap dengan **siapa yang mencatat dan kapan**. Dari catatan itu aplikasi menghitung sisa stok, memberi peringatan stok kritis, dan menyiapkan laporan Excel/PDF.

Aplikasi dibuka lewat peramban (Chrome, Edge, Safari, Firefox) di komputer, tablet, atau ponsel. Tidak ada yang perlu dipasang.

## 1.2 Cara membaca manual ini

- Setiap gambar adalah **tangkapan layar aplikasi sungguhan** dengan data contoh. Lingkaran oranye bernomor ① ② ③ menunjuk bagian layar yang dijelaskan; **legenda di bawah gambar** menerangkan tiap nomor.
- Tulisan **tebal** adalah nama tombol, menu, atau kolom persis seperti tampil di layar.
- Kotak **Tips** berisi saran praktis, **Perhatian** berisi hal yang dapat menimbulkan kesalahan, dan **Catatan** berisi penjelasan tambahan.
- Tampilan di akun Anda dapat berbeda dengan gambar: **menu dan tombol hanya muncul bila role Anda berizin**. Bab 3 menjelaskan siapa boleh apa.
- Di dalam aplikasi ada menu **Panduan** yang isinya menyesuaikan role dan izin akun Anda, dengan tombol **Tunjukkan** yang menandai tombol yang dimaksud di layar (Bab 16).

## 1.3 Istilah penting

| Istilah | Arti |
|---|---|
| **Perusahaan** | Badan usaha dalam grup. Ada **Induk** dan **Anak perusahaan**. |
| **Proyek** | Pekerjaan konstruksi milik sebuah perusahaan. Stok dicatat per proyek. |
| **Katalog barang** | Daftar baku semua barang beserta satuannya, dipakai bersama oleh semua proyek. Satu nama barang hanya ada satu kali. |
| **Barang proyek** | Barang katalog yang dimasukkan ke sebuah proyek. Tiap barang proyek punya **saldo awal**, **tanggal saldo awal**, dan **batas minimum**. |
| **Saldo awal** | Jumlah stok barang pada tanggal mulai pencatatan. Semua hitungan stok berjalan dari angka ini. |
| **Batas minimum** | Jumlah stok yang dianggap mulai berbahaya. Di bawah atau sama dengan angka ini, barang berstatus **Kritis**. |
| **Transaksi** | Satu catatan **barang masuk** atau **barang keluar**: tanggal, barang, jumlah, keterangan. Tidak dapat diubah atau dihapus. |
| **Koreksi** | Cara memperbaiki salah catat: aplikasi membuat transaksi pembalik, transaksi asli tetap ada. |
| **Role** | Kelompok hak akses (mis. Admin Logistik, Manajer Proyek). |
| **Level** | Angka tingkatan role (makin besar makin tinggi). Anda hanya dapat mengelola akun dan role yang levelnya **di bawah** level Anda. |
| **Izin** | Satu hak khusus pada role (mis. "Catat barang masuk/keluar"). |
| **WITA** | Waktu Indonesia Tengah. Semua tanggal dan jam di aplikasi memakai WITA. |

<!--pagebreak-->

# Bab 2. Memulai: masuk dan mengenal tampilan

## 2.1 Masuk dengan username dan password

1. Buka https://wkngroup-datahub.web.app di peramban.
2. Isi **Username** (tidak membedakan huruf besar/kecil) dan **Password**, lalu tekan **Masuk**. Ikon mata di kolom password menampilkan atau menyembunyikan isinya.
3. Akun dibuatkan oleh atasan Anda. Aplikasi **tidak punya pendaftaran sendiri**.

{{fig:login}}

> **Catatan:** Aplikasi tidak keluar sendiri (tidak ada auto-logout). Bila memakai komputer atau ponsel bersama, selalu tekan tombol **Keluar** di sudut kiri bawah setelah selesai.

## 2.2 Cara masuk lainnya

- **Masuk dengan Google** (tombol ④): berhasil bila email Google Anda sama dengan **email kontak** yang tercatat di akun Anda. Isi email kontak di Profil Saya (Bab 4).
- **Sidik jari / wajah** (tombol ⑥): tampil di perangkat yang mendukung. Harus diaktifkan dulu satu kali di perangkat itu (Bab 4.3). Bila belum aktif, aplikasi menjelaskan cara mengaktifkannya.

## 2.3 Lupa password

1. Di halaman masuk tekan **Lupa password? Minta reset ke atasan** (⑤).
2. Isi username Anda lalu kirim. Permintaan masuk ke atasan Anda.
3. Atasan mengeksekusi reset dan **memberikan password baru langsung kepada Anda** (Bab 12.3). Setelah masuk, segera ganti di Profil Saya.

{{fig:login-lupa}}

> **Perhatian:** Aplikasi tidak pernah mengirim password lewat email atau pesan. Password baru hanya diberikan oleh atasan.

## 2.4 Mengenal tampilan utama

Setelah masuk, Anda tiba di halaman pertama yang boleh Anda buka (biasanya **Dashboard**).

{{fig:mulai}}

- **Menu samping (①):** hanya memuat halaman yang boleh Anda buka. Menu dikelompokkan: Ringkasan, Inventory, Administrasi, Akun.
- **Nama dan role (②):** menunjukkan Anda masuk sebagai siapa. Tombol di kanannya adalah **Keluar**.
- **Tema (③):** ganti tema terang/gelap dari bilah atas. Pilihan diingat di perangkat.
- **Footer:** menampilkan nomor versi aplikasi (mis. v1.0.0). Sebutkan versi ini saat melapor masalah.

### Di ponsel

Menu samping disembunyikan. Tekan ikon garis tiga (①) di kiri atas untuk membukanya. Tabel yang lebar dapat digeser ke samping.

{{fig:mobile}}

<!--pagebreak-->

# Bab 3. Role, level, dan hak akses

Apa yang tampil dan dapat Anda lakukan ditentukan oleh **role** akun Anda. Role bawaan:

| Level | Role | Izin bawaan |
|---|---|---|
| 100 | **Developer** | Semua izin. Role ini terkunci. |
| 90 | **Owner / Direktur Utama** | Semua izin. |
| 80 | **Direktur** | Semua izin. |
| 50 | **Manajer Proyek** | Dashboard, lihat transaksi, catat transaksi, koreksi, kelola akun di bawahnya, menangani permintaan reset, ekspor, impor. |
| 20 | **Admin Logistik / Gudang** | Dashboard, lihat transaksi, catat transaksi, ekspor. |

Role dapat ditambah dan izinnya diubah oleh Owner/Direktur/Developer (Bab 12.4). Karena itu isi akun Anda bisa berbeda dari tabel di atas.

## 3.1 Daftar izin dan akibatnya di layar

| Izin | Yang terbuka |
|---|---|
| Lihat dashboard ringkasan (`dashboard`) | Menu **Dashboard**. |
| Lihat transaksi inventory (`inventory.read`) | Menu **Transaksi Stok** (hanya melihat). |
| Catat barang masuk/keluar (`inventory.write`) | Tombol **Catat transaksi**; menyiapkan saldo awal di proyek yang ditugaskan. |
| Koreksi transaksi (`inventory.correct`) | Tombol **Koreksi** pada tiap transaksi. |
| Kelola katalog barang (`catalog`) | Menu **Katalog Barang**; impor katalog. |
| Kelola & lihat SEMUA perusahaan dan proyek (`projects`) | Menu **Proyek & Perusahaan**; melihat semua proyek, bukan hanya yang ditugaskan. |
| Kelola akun di bawahnya (`users`) | Menu **Akun Pengguna**. |
| Kelola role & akses (`roles`) | Menu **Role & Akses**. |
| Menangani permintaan reset (`resets`) | Menu **Permintaan Reset**. |
| Lihat database karyawan (`employees`) | Menu **Database Karyawan**. |
| Lihat log audit (`audit`) | Menu **Log Audit** dan **Cadangan & Kuota**. |
| Ekspor Excel/PDF (`export`) | Tombol ekspor di **Impor / Ekspor**. |
| Impor Excel (`import`) | Bagian impor di **Impor / Ekspor** (butuh izin lain sesuai jenis impor, Bab 11). |

## 3.2 Aturan level

- Anda hanya dapat membuat, mengubah, menonaktifkan, atau mereset akun yang **levelnya di bawah** level Anda.
- Anda hanya dapat memberikan role yang levelnya di bawah Anda, dan hanya izin yang **Anda sendiri miliki**.
- Akun yang ditugaskan ke proyek tertentu hanya melihat dan bekerja di proyek itu. Pemegang izin **proyek** melihat semuanya.
- Bila izin role Anda diubah, **buka ulang halaman Panduan atau muat ulang aplikasi** agar menu dan tombol menyesuaikan.

> **Tips:** Tidak melihat menu atau tombol yang seharusnya ada? Buka menu **Panduan**: bagian "Tidak tersedia untuk akun Anda" menyebut izin apa yang kurang dan siapa yang dapat memberikannya.

<!--pagebreak-->

# Bab 4. Profil Saya

Menu **Profil Saya** ada di bagian bawah menu samping dan tersedia untuk semua akun.

{{fig:profil}}

## 4.1 Mengubah data diri

1. Ubah **Nama lengkap** (①), **No. HP** (②), atau **Email kontak** (③).
2. Tombol **Simpan perubahan** (④) aktif setelah ada perubahan. Tekan untuk menyimpan.

> **Catatan:** Email kontak juga dipakai untuk **Masuk dengan Google** dan harus unik: email yang sudah dipakai akun lain ditolak. Username dan role tidak dapat diubah di sini; hubungi atasan. Nama, HP, dan email Anda langsung tampil di Database Karyawan.

## 4.2 Mengganti password

1. Di bagian ganti password isi **password lama**, **password baru**, dan ulangi password baru.
2. Tekan **Ganti password** (⑤). Anda tetap masuk di perangkat ini.

Satu-satunya aturan password: **minimal 6 karakter**. Gunakan kombinasi yang sulit ditebak.

## 4.3 Mengaktifkan login sidik jari atau wajah

Fitur ini hanya tampil di perangkat dan peramban yang mendukung (ponsel dengan sidik jari/Face ID, laptop dengan Windows Hello/Touch ID).

1. Di Profil Saya, pada bagian login biometrik tekan **Aktifkan di perangkat ini**.
2. Jendela konfirmasi muncul. Tekan **Aktifkan sekarang**, lalu verifikasi dengan sidik jari, wajah, atau kunci layar perangkat.
3. Mulai saat itu, halaman masuk menampilkan tombol sidik jari/wajah di samping **Masuk**.

{{fig:profil-bio}}

- Aplikasi **tidak menyimpan sidik jari atau wajah Anda**. Yang tersimpan hanya kunci yang dibuat perangkat.
- Perangkat yang terdaftar tampil di daftar Profil Saya dan dapat dihapus kapan saja.
- Jika muncul pesan bahwa perangkat sudah memegang kunci (misalnya didaftarkan lewat peramban lain), tekan **Kenali perangkat ini** lalu verifikasi.
- Bila atasan mereset password Anda, semua perangkat biometrik dicabut. Aktifkan ulang setelah masuk dengan password baru.

<!--pagebreak-->

# Bab 5. Urutan menyiapkan data (untuk pertama kali)

Agar transaksi dapat dicatat, data harus disiapkan **berurutan**. Tiap langkah dijelaskan rinci di bab berikutnya.

| Urutan | Langkah | Siapa | Bab |
|---|---|---|---|
| 1 | Tambah **perusahaan** (induk dulu, lalu anak) | Pemegang izin proyek | 7.1 |
| 2 | Tambah **proyek** | Pemegang izin proyek | 7.2 |
| 3 | Isi **katalog barang** (satu per satu atau impor Excel) | Pemegang izin katalog | 6, 11.4 |
| 4 | Masukkan barang ke proyek dan isi **saldo awal** (satu per satu atau impor Excel) | Pemegang izin proyek, atau pencatat di proyeknya | 7.3, 11.5 |
| 5 | Buat **akun** pengguna dan tugaskan ke proyek | Pemegang izin akun | 12.1 |
| 6 | **Catat transaksi** harian (atau impor riwayat lama dari Excel) | Pencatat (Admin Logistik, Manajer Proyek) | 8, 11.3 |
| 7 | Pantau **Dashboard**, unduh **laporan** | Semua yang berizin | 9, 10 |

> **Perhatian:** Barang yang belum punya saldo awal **belum dapat menerima transaksi**. Karena itu tombol **Catat transaksi** nonaktif bila proyek belum punya barang bersaldo awal.

<!--pagebreak-->

# Bab 6. Katalog barang

Katalog adalah daftar baku barang. Satu nama hanya boleh satu kali di seluruh grup, sehingga laporan antar-proyek bisa dibandingkan. Menu: **Katalog Barang** (izin `catalog`).

{{fig:catalog}}

## 6.1 Menambah barang

1. Tekan **Tambah barang** (②).
2. Isi kolom di jendela yang muncul, lalu **Simpan**.

{{fig:catalog-add}}

| Kolom | Wajib | Penjelasan | Contoh |
|---|---|---|---|
| **Nama** | Ya | Nama baku barang, unik (huruf besar/kecil tidak dibedakan), maksimal 160 karakter. | `Genteng Beton` |
| **Satuan** | Ya | Satuan hitung, maksimal 40 karakter. **Tidak dapat diganti setelah barang dipakai proyek.** | `Buah`, `Sak`, `m3`, `Batang` |
| **Kategori** | Tidak | Pengelompokan bebas, maksimal 80 karakter. | `Atap`, `Bahan Bangunan` |
| **Batas minimum** | Tidak | Angka 0 atau lebih (maksimal 3 desimal). Bawaan untuk proyek; kosong = 0. | `200` |

## 6.2 Mengubah dan menghapus

- Tekan **Ubah** (③) pada baris barang untuk memperbaiki data.
- Ikon **sampah** menghapus barang yang **tidak dipakai proyek mana pun**. Penghapusan permanen; namanya dapat dipakai lagi.
- Barang yang sudah dipakai proyek tidak dapat dinonaktifkan atau diganti satuannya.
- Cari barang dengan kotak pencarian (①).

> **Tips:** Untuk memasukkan puluhan barang sekaligus, pakai **impor katalog dari Excel** (Bab 11.4).

<!--pagebreak-->

# Bab 7. Perusahaan, proyek, dan saldo awal

Menu: **Proyek & Perusahaan** (izin `projects`).

{{fig:projects}}

## 7.1 Menambah perusahaan

1. Tekan **Tambah perusahaan** (①).
2. Isi **Nama perusahaan** dan pilih **Jenis**: **Induk** atau **Anak perusahaan**. Tambahkan perusahaan induk terlebih dulu.
3. Tekan **Simpan**.

{{fig:projects-add-company}}

Perusahaan dapat diubah (nama, jenis, aktif/nonaktif). Perusahaan yang masih punya proyek aktif tidak dapat dinonaktifkan.

## 7.2 Menambah proyek

1. Tekan **Tambah proyek** (②).
2. Pilih **Perusahaan**, isi **Nama proyek**, **Lokasi**, pilih **Status** (Berjalan, Ditunda, Selesai), dan isi **Tanggal mulai**.
3. Tekan **Simpan**.

{{fig:projects-add-project}}

## 7.3 Memasukkan barang ke proyek dan mengisi saldo awal

1. Pada kartu proyek tekan **Barang & saldo awal** (③). Halaman rincian proyek terbuka.
2. Tekan **Tambah barang** (①), pilih barang dari katalog, isi **Saldo awal** dan **Per tanggal**, lalu **Tambah**.

{{fig:project-detail}}

{{fig:project-add-item}}

- **Saldo awal** boleh dikosongkan dan diisi nanti, tetapi barang tanpa saldo awal belum dapat menerima transaksi.
- **Tanggal saldo awal** tidak boleh di masa depan, dan transaksi tidak boleh bertanggal sebelumnya.
- **Ubah saldo awal** (②) hanya aktif selama barang **belum punya transaksi**. Setelah ada transaksi, saldo awal terkunci (tombol abu-abu). Salah saldo awal? Perbaiki lewat transaksi **Koreksi**.
- **Batas minimum** (③) mengatur batas stok kritis barang itu khusus di proyek ini.
- Kolom **Stok saat ini** dihitung otomatis dari saldo awal dan semua transaksi.

> **Tips:** Untuk banyak barang sekaligus, pakai **impor Saldo awal proyek** (Bab 11.5): template sudah terisi nama barang katalog yang belum ada di proyek.

<!--pagebreak-->

# Bab 8. Mencatat dan mengoreksi transaksi

Menu: **Transaksi Stok** (izin `inventory.read` untuk melihat, `inventory.write` untuk mencatat).

{{fig:inventory}}

## 8.1 Membaca buku transaksi

- Pilih **Proyek** (①), **Bulan** (②), dan, bila perlu, **Barang** (③).
- Tabel (⑤) memuat: hari dan tanggal, nama barang, satuan, **Masuk**, **Keluar**, **Tersisa**, keterangan, dan **Dicatat oleh** beserta waktunya (WITA).
- Kolom **Tersisa** berjalan dari saldo awal dan dihitung otomatis; Anda tidak mengisinya.
- Baris di kaki tabel, **Total bulan ini (setelah koreksi)**, menjumlah masuk dan keluar bulan itu.
- Anda hanya melihat proyek yang ditugaskan kepada Anda (kecuali berizin proyek).

## 8.2 Mencatat transaksi

1. Tekan **Catat transaksi** (④).
2. Isi jendela yang muncul, lalu tekan **Catat** (⑥).

{{fig:inventory-catat}}

| Kolom | Penjelasan |
|---|---|
| **Barang** (①) | Hanya barang yang sudah bersaldo awal. Stok saat ini tampil di samping nama. |
| **Jenis** (②) | **Barang masuk** (menambah stok) atau **Barang keluar** (mengurangi stok). |
| **Jumlah** (③) | Angka lebih dari 0, maksimal 3 angka desimal. Satuan tampil di judul kolom. |
| **Tanggal** (④) | Tanggal kejadian. Bawaan: hari ini (WITA). |
| **Keterangan** (⑤) | Opsional, maksimal 200 karakter. Isi tujuan atau sumber, mis. "Pengecoran pondasi blok A". |

Baris baru langsung muncul di tabel dengan nama Anda pada kolom **Dicatat oleh**.

### Aturan yang ditegakkan aplikasi

- **Stok tidak boleh negatif pada tanggal mana pun.** Bila jumlah keluar melebihi stok, aplikasi menolak dan menyebut batas maksimal yang bisa dicatat.
- Tanggal **tidak boleh sebelum tanggal saldo awal** barang dan **tidak boleh di masa depan** (menurut WITA).
- Dalam **satu hari, barang masuk dihitung lebih dulu** daripada barang keluar.
- Transaksi **tidak dapat diubah atau dihapus**. Kesalahan diperbaiki dengan **Koreksi**.
- **Jaringan putus** saat menekan Catat? Tekan **Catat** lagi: transaksi **tidak tercatat dua kali**.
- Pesan "sedang dicatat pengguna lain" berarti barang yang sama dicatat bersamaan. Tunggu beberapa detik, lalu ulangi.

## 8.3 Mengoreksi transaksi

Koreksi memerlukan izin `inventory.correct` (bawaan: Manajer Proyek ke atas).

1. Di **Transaksi Stok**, cari barisnya lalu tekan **Koreksi** (⑥ pada gambar bab 8.1).
2. Isi **alasan koreksi** (wajib, minimal 3 karakter), lalu tekan **Buat koreksi**.

{{fig:inventory-koreksi}}

Hasilnya: muncul baris baru bertanda **Koreksi** yang membalik transaksi yang salah, sedangkan transaksi asli tetap tampil dan diberi tanda **Sudah dikoreksi**.

{{fig:inventory-koreksi-hasil}}

- Satu transaksi hanya dapat dikoreksi **sekali**; baris koreksi tidak dapat dikoreksi lagi.
- Membalik barang **masuk** ditolak bila stok sesudah tanggal itu sudah terpakai (stok akan menjadi negatif).
- Alasan dan pelakunya tercatat permanen di Log Audit.
- Setelah dikoreksi, catat transaksi yang **benar** sebagai transaksi baru.

> **Tips:** Bila Anda tidak punya tombol Koreksi, minta Manajer Proyek atau atasan yang berizin untuk mengoreksi.

<!--pagebreak-->

# Bab 9. Dashboard ringkasan

Menu: **Dashboard** (izin `dashboard`). Menampilkan kondisi stok per proyek atau seluruh proyek.

{{fig:dashboard}}

## 9.1 Mengatur tampilan

- **Cakupan (①):** pilih satu proyek atau **Semua proyek** (bila Anda berizin proyek).
- **Bulan (②):** bulan yang dilihat.
- **Segarkan (③):** memuat ulang data sekarang. Data disimpan 5 menit untuk menghemat kuota baca gratis.

## 9.2 Kartu ringkasan (④)

| Kartu | Arti |
|---|---|
| **Jenis barang aktif** | Jumlah jenis barang dan proyek dalam tampilan. |
| **Transaksi (bulan)** | Banyaknya transaksi masuk + keluar bulan itu, tidak termasuk saldo awal. |
| **Stok kritis** | Barang yang sisanya di bawah atau sama dengan batas minimum. |
| **Tidak bergerak** | Barang tanpa transaksi 14 hari atau lebih (pada bulan berjalan). |

## 9.3 Tabel ringkasan per barang (⑤)

| Kolom | Arti |
|---|---|
| **Awal** | Stok di awal bulan (dihitung dari stok kini dan transaksi, sudah memperhitungkan koreksi). |
| **Masuk / Keluar** | Total masuk dan keluar bulan itu setelah koreksi. |
| **Sisa** | Stok akhir. |
| **Laju harian vs bln lalu** | Pemakaian per hari dibanding bulan lalu (laju per hari agar adil antara bulan berjalan dan bulan penuh). |
| **Pemakaian** | Persentase `keluar ÷ (awal + masuk)`. Garis penanda di 75%. |
| **Cukup (hari)** | Perkiraan berapa hari stok cukup dengan laju pemakaian saat ini. |
| **Status** | **Kritis**: sisa ≤ batas minimum. **Menipis**: sisa ≤ 1,5 × batas minimum. **Aman**: di atas itu. |

Di bawah tabel ada daftar **Pemakaian tertinggi** dan **Perlu perhatian** (barang kritis, menipis, atau tidak bergerak).

## 9.4 Rincian dan grafik

Klik **nama barang** di tabel untuk membuka grafik **sisa stok** 30 hari terakhir dan 6 bulan.

{{fig:dashboard-rincian}}

<!--pagebreak-->

# Bab 10. Ekspor laporan Excel dan PDF

Menu: **Impor / Ekspor**, bagian **Ekspor data** (izin `export`). Berkas dibuat **di perangkat Anda**; tidak ada data yang dikirim ke luar.

{{fig:io}}

## 10.1 Langkah ekspor

1. Pilih **Proyek** (①) di kanan atas kartu.
2. Pilih **Bulan** (②).
3. Pada **Isi berkas** centang **Transaksi** dan/atau **Ringkasan per barang**.
4. Tekan **Excel (.xlsx)** (③) atau **PDF** (④). Berkas langsung terunduh.

## 10.2 Isi berkas Excel

Berkas Excel berisi lembar **Transaksi** dan **Ringkasan** (sesuai centang). Bagian atas memuat kop: nama perusahaan, proyek, periode, **nama pembuat beserta jabatan**, dan **waktu cetak (WITA)**.

{{fig:ekspor-transaksi}}

{{fig:ekspor-ringkasan}}

## 10.3 Isi berkas PDF

PDF memuat logo, kop yang sama, tabel Transaksi dan Ringkasan, serta nomor halaman di kaki.

{{fig:ekspor-pdf}}

> **Tips:** Berkas Excel hasil ekspor **bukan** template impor. Untuk impor, selalu unduh template dari aplikasi (Bab 11).

<!--pagebreak-->

# Bab 11. Impor data dari Excel

Impor memasukkan banyak data sekaligus dari berkas Excel. Ada **tiga jenis impor**, dipilih pada **Jenis impor** (⑤ pada gambar di bab 10):

| Jenis | Fungsi | Izin yang dibutuhkan |
|---|---|---|
| **Katalog barang** | Mengisi katalog baku. | `import` + `catalog` |
| **Saldo awal proyek** | Memasukkan barang katalog ke proyek beserta saldo awalnya. | `import` + (`projects`, atau `inventory.write` di proyek yang ditugaskan) |
| **Transaksi stok** | Memasukkan riwayat transaksi (mis. data lama). | `import` + `inventory.write` |

> **Urutan penyiapan:** 1) Katalog barang → 2) Saldo awal proyek → 3) Transaksi stok. Aplikasi mengingatkan urutan ini di bawah tombol template.

## 11.1 Alur umum semua jenis impor

1. Buka **Impor / Ekspor**, pilih **Proyek** (untuk saldo awal dan transaksi) dan **Jenis impor**.
2. Tekan **Unduh template Excel** (⑥). Template **selalu dibuat khusus** untuk proyek dan data Anda saat ini.
3. Isi lembar utama template (aturan tiap kolom di 11.3 sampai 11.5), jangan mengubah judul kolom di baris 1.
4. Simpan sebagai **.xlsx**.
5. Tarik berkas ke kotak putus-putus atau tekan **Pilih berkas** (⑦). Maksimal **2 MB** dan **3.000 baris**; hanya format .xlsx.
6. Periksa **pratinjau** (11.2). Baris merah tidak akan diimpor.
7. Tekan **Impor N baris valid**. Aplikasi menampilkan **Hasil impor**.

## 11.2 Membaca pratinjau

{{fig:preview-trx}}

- **Ringkasan (①):** jumlah baris valid dan baris yang perlu diperbaiki. Perkiraan jumlah penulisan ke database dan sisa kuota harian tampil di bawahnya.
- **Tabel (②):** tiap baris berstatus **Valid** (hijau) atau berisi **alasan penolakan** (merah). Nomor baris sama dengan nomor baris di Excel Anda, jadi mudah dicari.
- **Impor (③):** hanya baris valid yang dikirim. Baris merah dilewati; perbaiki di Excel lalu unggah lagi bila ingin memasukkannya.
- **Batal (④):** membatalkan tanpa mengimpor apa pun.

> **Catatan:** Pratinjau memeriksa isi berkas di perangkat Anda. Server memeriksa ulang saat impor (mis. stok yang tidak boleh negatif). Baris yang ditolak server ditampilkan di **Hasil impor** beserta alasannya.

## 11.3 Impor transaksi stok

**Template:** lembar **Transaksi** (diisi), **Contoh Pengisian** (tidak diimpor), **Barang** (daftar nama yang sah), **Petunjuk**.

{{fig:tpl-trx-isi}}

| Kolom | Wajib | Format dan aturan | Contoh |
|---|---|---|---|
| **A. Tanggal** (①) | Ya | `YYYY-MM-DD`. Tidak boleh sebelum tanggal saldo awal barang dan tidak boleh di masa depan. | `2026-11-17` |
| **B. Nama Barang** (②) | Ya | **Salin persis** dari lembar **Barang**. Huruf besar/kecil tidak dibedakan. Barang harus sudah ada di proyek dan bersaldo awal. | `Semen Portland 50 kg` |
| **C. Jenis** (③) | Ya | `Masuk` atau `Keluar` (pilih dari daftar). | `Keluar` |
| **D. Jumlah** (④) | Ya | Angka lebih dari 0, maksimal 3 desimal. Koma atau titik boleh (`1,5` atau `1.5`). | `15,5` |
| **E. Keterangan** (⑤) | Tidak | Maksimal 200 karakter. | `Pengecoran pondasi` |

Lembar **Contoh Pengisian** memperlihatkan isian yang **benar** (hijau) dan **salah** (merah) beserta penjelasannya. Lembar ini **tidak ikut diimpor**.

{{fig:tpl-trx-contoh}}

Lembar **Barang** memuat nama barang yang sah di proyek terpilih. Salin nama dari sini agar tidak salah ketik.

{{fig:tpl-trx-barang}}

**Aturan pemrosesan:** dalam berkas, barang **masuk diproses lebih dulu**, lalu **keluar menurut tanggal**. Baris keluar yang membuat stok negatif ditolak server dengan alasan, **baris lain tetap masuk**. Mengulang impor yang sama tidak menggandakan transaksi: baris yang sudah masuk dilewati.

Contoh pratinjau di atas memuat 7 baris: 4 valid, 3 bermasalah (tanggal 31-02 yang tidak ada di kalender, barang yang belum ditambahkan ke proyek, dan jenis "Pinjam").

## 11.4 Impor katalog barang

**Template:** lembar **Katalog** (diisi), **Contoh Pengisian**, **Barang di Katalog** (nama yang sudah ada, agar tidak kembar), **Petunjuk**.

{{fig:tpl-kat-isi}}

| Kolom | Wajib | Format dan aturan | Contoh |
|---|---|---|---|
| **A. Nama Barang** (①) | Ya | Unik di seluruh grup (tidak membedakan huruf besar/kecil), maksimal 160 karakter. | `Seng Gelombang BJLS 0,30` |
| **B. Satuan** (②) | Ya | Maksimal 40 karakter. Tidak dapat diganti setelah dipakai proyek. | `Lembar` |
| **C. Kategori** (③) | Tidak | Maksimal 80 karakter. | `Atap` |
| **D. Batas Minimum** (④) | Tidak | Angka 0 atau lebih (maksimal 3 desimal). Kosong = 0. | `25` |

{{fig:tpl-kat-contoh}}

Pratinjau menolak baris dengan: nama kosong, satuan kosong, batas minimum bukan angka atau negatif, **nama sudah ada di katalog**, atau **nama kembar di berkas yang sama**. Baris lain tetap diimpor.

{{fig:preview-katalog}}

Setelah impor, aplikasi menampilkan **Hasil impor** dan tombol menuju langkah berikutnya.

{{fig:impor-selesai}}

## 11.5 Impor saldo awal proyek

Pilih **proyek** yang dituju, lalu **Jenis impor: Saldo awal proyek**.

**Template:** lembar **Saldo Awal** (diisi), **Contoh Pengisian**, **Sudah di Proyek** (barang yang sudah ada, tidak ditimpa), **Petunjuk**. Kolom **Nama Barang sudah terisi otomatis** dengan barang katalog yang **belum** ada di proyek.

{{fig:tpl-saldo-isi}}

| Kolom | Wajib | Format dan aturan | Contoh |
|---|---|---|---|
| **A. Nama Barang** (①) | Terisi otomatis | **Jangan diubah ejaannya.** Harus ada di katalog. | `Batu Split 2/3` |
| **B. Saldo Awal** (②) | Ya, untuk barang yang ingin dimasukkan | Angka 0 atau lebih (maksimal 3 desimal). **Kosongkan baris yang tidak ingin dimasukkan** ke proyek. | `35` |
| **C. Tanggal Saldo Awal** (③) | Ya, bila saldo diisi | `YYYY-MM-DD`. Tidak boleh di masa depan; transaksi tidak bisa bertanggal sebelumnya. | `2026-09-01` |
| **D. Batas Minimum** (④) | Tidak | Kosong = memakai batas bawaan katalog. | `8` |

{{fig:tpl-saldo-contoh}}

- Baris tanpa saldo dan tanggal **dilewati** (barang tidak dimasukkan ke proyek).
- Barang yang **sudah ada di proyek tidak ditimpa**; saldo awal yang sudah berjalan tidak berubah.
- Barang yang belum ada di katalog harus diimpor ke katalog dulu.
- Baris ditolak bila: nama tidak ada di katalog, saldo negatif, tanggal kosong/tidak dikenali, tanggal di masa depan, atau batas minimum tidak valid.

{{fig:preview-saldo}}

## 11.6 Pesan pratinjau dan cara memperbaikinya

| Pesan | Penyebab | Perbaikan |
|---|---|---|
| Tanggal kosong atau formatnya tidak dikenali | Tanggal tidak ditulis `YYYY-MM-DD`, kosong, atau tidak ada di kalender (mis. 31-02). | Tulis ulang sebagai `2026-11-17`. Pastikan sel berformat tanggal atau teks. |
| Barang tidak ada di proyek ini | Ejaan nama berbeda dari lembar Barang. | Salin nama dari lembar **Barang**. |
| Barang ada di katalog tetapi belum ditambahkan ke proyek ini | Barang belum dimasukkan ke proyek. | Impor **Saldo awal proyek** dulu, atau **Tambah barang** di rincian proyek. |
| Barang belum punya saldo awal | Barang di proyek belum diberi saldo awal. | Isi saldo awal di rincian proyek. |
| Barang nonaktif di proyek ini | Barang dinonaktifkan. | Aktifkan di rincian proyek atau pilih barang lain. |
| Jenis harus "Masuk" atau "Keluar" | Kolom Jenis berisi hal lain (mis. "Pinjam"). | Pilih Masuk atau Keluar dari daftar. |
| Jumlah bukan angka / harus lebih dari 0 / maksimal 3 angka desimal | Isian jumlah tidak valid. | Isi angka positif, maksimal 3 desimal. |
| Tanggal sebelum saldo awal (…) | Transaksi lebih awal dari tanggal saldo awal barang. | Gunakan tanggal pada atau setelah tanggal yang disebut. |
| Tanggal tidak boleh di masa depan | Tanggal lebih dari hari ini (WITA). | Perbaiki tanggal. |
| Keterangan maksimal 200 karakter | Keterangan terlalu panjang. | Persingkat. |
| Nama barang sudah ada di katalog | Nama kembar dengan katalog (impor katalog). | Hapus baris itu atau ganti nama. |
| Nama barang kembar dengan baris N di berkas ini | Nama sama muncul dua kali di berkas. | Hapus salah satu. |
| Barang tidak ada di katalog | (Impor saldo awal) nama tidak ada di katalog. | Impor ke katalog dulu atau perbaiki ejaan. |
| Barang sudah ada di proyek ini | (Impor saldo awal) barang sudah ada; tidak ditimpa. | Tidak perlu dilakukan; hapus barisnya. |
| Saldo awal tidak boleh negatif | Saldo kurang dari 0. | Isi 0 atau lebih. |
| Stok tidak cukup (ditolak server) | Keluar melebihi stok pada tanggal itu atau sesudahnya. | Periksa jumlah dan tanggal; catat barang masuk lebih dulu. |

> **Perhatian:** Sel yang berawalan tanda `=`, `+`, `-`, atau `@` dapat dianggap rumus oleh Excel. Aplikasi menetralkan nilai seperti itu pada berkas yang dibuatnya, tetapi hindari mengawali nama barang dengan karakter tersebut.

## 11.7 Tips mengisi template

- **Selalu unduh template baru** setiap kali impor (daftar barang di lembar pendukung ikut diperbarui).
- Isi mulai **baris 2**. Jangan menambah, menghapus, atau mengganti nama kolom dan lembar.
- Salin-tempel nama dari lembar **Barang**/**Katalog** agar ejaan persis.
- Untuk tanggal, ketik `2026-11-17`; bila Excel mengubahnya menjadi tanggal lokal, tidak masalah selama berupa tanggal yang valid.
- Impor dalam kelompok kecil dulu (±20 baris) untuk memastikan format benar, baru sisanya.
- Kuota gratis database terbatas 20.000 penulisan per hari (dipakai bersama semua pengguna). Aplikasi menampilkan perkiraan penulisan di pratinjau; untuk impor sangat besar, bagi ke beberapa hari.
- Berkas contoh siap pakai ada di folder `docs/manual/contoh/` (lihat Lampiran C).

<!--pagebreak-->

# Bab 12. Administrasi akun dan role

## 12.1 Akun Pengguna

Menu: **Akun Pengguna** (izin `users`). Anda melihat akun **di bawah level Anda** (dan, bila tidak berizin proyek, yang berbagi proyek dengan Anda).

{{fig:users}}

- **Cari (①):** cari nama atau username.
- **Tambah akun (②):** membuat akun baru.
- **Ubah (③):** ubah data, role, atau proyek.
- **Reset password (④):** atur password baru langsung.
- **Nonaktifkan (⑤):** menonaktifkan akun (sesinya dicabut); dapat diaktifkan lagi.
- Ikon **sampah:** menghapus akun (tidak dapat dibatalkan).

### Membuat akun baru

{{fig:users-add}}

| Kolom | Penjelasan |
|---|---|
| **Username** (①) | Nama masuk, unik. Tidak membedakan huruf besar/kecil. |
| **Nama lengkap** (②) | Nama yang tampil di catatan dan laporan. |
| **Password awal** (③) | Minimal 6 karakter. Berikan langsung kepada orangnya dan minta menggantinya di Profil Saya. |
| **Role** (④) | Hanya role di bawah level Anda dan izinnya tidak melebihi izin Anda. |
| **No. HP**, **Email** | Opsional. Email dipakai untuk Masuk dengan Google dan harus unik. |
| **Proyek yang dapat diakses** (⑤) | Centang proyek yang ditugaskan. Bagi pemegang izin proyek, opsional; selain itu wajib minimal satu proyek Anda sendiri. |

Tekan **Buat akun** (⑥).

## 12.2 Reset password dari daftar akun

Tekan **Reset password** pada baris akun, ketik password baru (minimal 6 karakter), lalu simpan. Sesi lama dan perangkat biometrik akun itu dicabut.

{{fig:users-reset}}

## 12.3 Permintaan Reset

Menu: **Permintaan Reset** (izin `resets`). Berisi permintaan dari bawahan yang lupa password (Bab 2.3).

{{fig:resets}}

1. Pada permintaan yang menunggu tekan **Eksekusi reset** (①).
2. Ketik **password baru** (minimal 6 karakter), lalu **Simpan password baru**.
3. **Berikan password baru langsung** kepada orangnya.

{{fig:resets-eksekusi}}

Pelaku dan waktu eksekusi tercatat permanen. Sesi lama dan biometrik akun itu dicabut; orangnya perlu mengaktifkan ulang biometrik.

## 12.4 Role & Akses

Menu: **Role & Akses** (izin `roles`).

{{fig:roles}}

1. Pilih role di **Hirarki role** (②). Izin role tampil di matriks (⑤).
2. Centang atau cabut izin pada matriks. Anda hanya dapat mengubah izin yang **Anda sendiri miliki**.
3. Ubah **Nama role** (③) atau **Level** (④) bila perlu. Level baru harus di bawah level Anda dan belum dipakai role lain; akun pemegang role ikut berubah levelnya.
4. Tekan **Simpan perubahan** (⑥). Perubahan berlaku pada akun role itu saat berikutnya mereka membuka aplikasi.
5. **Hapus role** hanya untuk role yang tidak dipakai akun. Role Developer terkunci.

### Membuat role baru

Tekan **Role baru** (①).

{{fig:roles-new}}

Isi **Nama role**, **Level** (belum dipakai role lain), dan pilih **Salin izin dari** role yang ada (opsional) untuk menghemat waktu. Atur izinnya di matriks setelah role dibuat.

## 12.5 Database Karyawan

Menu: **Database Karyawan** (izin `employees`). Data semua akun beserta siapa yang terakhir mengubahnya.

{{fig:employees}}

- Cari berdasarkan nama, username, HP, atau email (①); saring menurut **role** (②), **status** (③), dan **proyek** (④).
- Kolom **Terakhir diperbarui** menunjukkan pengubah dan waktunya (WITA).
- Tombol **Excel** dan **PDF** (⑤, bila Anda berizin ekspor) mengunduh data yang sedang tersaring.

<!--pagebreak-->

# Bab 13. Log audit, cadangan, dan kuota

## 13.1 Log Audit

Menu: **Log Audit** (izin `audit`). Catatan permanen siapa melakukan apa dan kapan.

{{fig:audit}}

- Cari pelaku, aksi, atau target (①).
- Tiap baris (②): waktu (WITA), pelaku, aksi, target, dan rincian (sebelum/sesudah untuk perubahan).
- Catatan **hanya bisa bertambah**: tidak ada yang dapat mengubah atau menghapusnya, termasuk saat data proyek dihapus. **Password tidak pernah tercatat.**

## 13.2 Cadangan Sheets dan kuota harian

Menu: **Cadangan & Kuota** (izin `audit`).

{{fig:backup}}

- Aplikasi mencadangkan data ke **Google Sheets** otomatis tiap hari pukul **03:00 WITA**. Cadangan satu arah dan bukan sumber kebenaran; tidak memuat password.
- **Cadangkan sekarang** (①) menjalankan cadangan segera (jeda 5 menit antar-permintaan). Status terakhir, waktu berhasil, dan jumlah baris per lembar tampil di halaman.
- **Kuota Firestore hari ini** menampilkan persentase baca/tulis/hapus dari paket gratis. Bilah peringatan muncul di atas halaman pada **80%** dan **95%**.
- Hari kuota berganti tengah malam waktu **Pasifik**, bukan WITA.

<!--pagebreak-->

# Bab 14. Membersihkan data uji (hapus permanen)

Hanya **Owner dan Developer** (level 90 ke atas) yang dapat menghapus proyek atau perusahaan secara permanen. Gunakan untuk membersihkan data percobaan sebelum aplikasi dipakai sungguhan.

1. Di **Proyek & Perusahaan**, tekan **Hapus** pada proyek atau perusahaan (④ pada gambar bab 7).
2. Baca akibatnya: jumlah barang, transaksi, akun terdampak, dan status cadangan terakhir.
3. **Ketik nama persis** untuk mengonfirmasi, lalu tekan **Hapus permanen**.

{{fig:projects-hapus}}

> **Perhatian:** Penghapusan **tidak dapat dibatalkan**. Menghapus perusahaan ikut menghapus **semua proyeknya**. Log Audit dan isi Google Sheet cadangan **tidak** ikut terhapus. Bila itu data nyata, jalankan **Cadangkan sekarang** (Bab 13.2) lebih dulu.

Proyek besar dihapus bertahap dengan indikator kemajuan. Bila terputus di tengah jalan, proyek tampil **Sedang dihapus** dengan tombol **Lanjutkan hapus**. Kuota hapus harian gratis sekitar 20.000 dokumen.

<!--pagebreak-->

# Bab 15. Alur kerja harian ringkas

| Peran | Kegiatan harian |
|---|---|
| **Admin Logistik / Gudang** | Masuk → **Transaksi Stok** → **Catat transaksi** untuk tiap barang masuk/keluar hari itu → cek kolom **Tersisa**. Salah catat? Beritahu Manajer Proyek. |
| **Manajer Proyek** | Tinjau **Transaksi Stok** dan **Dashboard**; **Koreksi** salah catat; tangani **Permintaan Reset** bawahan; unduh laporan bulanan lewat **Impor / Ekspor**. |
| **Direktur / Owner** | **Dashboard** semua proyek; periksa barang **Kritis**; kelola akun dan role; tinjau **Log Audit**; pastikan **Cadangan** berhasil. |

**Awal bulan:** unduh laporan **Excel** dan **PDF** bulan lalu untuk arsip. **Saat proyek baru:** ikuti urutan di Bab 5.

<!--pagebreak-->

# Bab 16. Menu Panduan di dalam aplikasi

Di menu **Akun** ada **Panduan**, bacaan singkat yang **menyesuaikan diri dengan role dan izin akun Anda**.

{{fig:panduan}}

- **Cari di panduan (①)** menyaring bagian menurut kata kunci.
- **Daftar isi (②)** melompat ke bagian yang diinginkan.
- **Izin Anda (③):** daftar izin dari role akun Anda. Bagian panduan muncul atau hilang mengikutinya. Bila izin role diubah, panduan membaca izin terbaru dari server saat dibuka.
- Tombol **Tunjukkan** pada langkah membuka halaman terkait dan **menandai tombol yang dimaksud** dengan cincin dan balon petunjuk. Tekan Esc atau klik di mana saja untuk menutupnya.
- Bagian **Tidak tersedia untuk akun Anda** menyebut izin yang kurang dan siapa yang dapat memberikannya.
- **Cetak / simpan PDF** mencetak panduan sesuai akun Anda.

<!--pagebreak-->

# Bab 17. Pemecahan masalah

| Gejala | Penyebab dan cara mengatasi |
|---|---|
| **Tidak bisa masuk** | Periksa username dan password. Lupa password: **Lupa password?** di halaman masuk, atasan akan mereset. Akun mungkin dinonaktifkan; hubungi atasan. |
| **Masuk dengan Google gagal** | Email Google harus sama dengan **email kontak** akun (Profil Saya). |
| **Tombol sidik jari/wajah tidak ada** | Perangkat atau peramban belum mendukung, atau belum diaktifkan di Profil Saya (Bab 4.3). |
| **"Perangkat ini sudah memegang kunci…"** saat mengaktifkan biometrik | Tekan **Kenali perangkat ini** lalu verifikasi. Bila gagal, hapus perangkat lama di Profil Saya dan daftar ulang. |
| **Menu atau tombol tidak ada** | Role Anda belum berizin. Buka **Panduan** → "Tidak tersedia untuk akun Anda". Setelah izin diubah, muat ulang aplikasi. |
| **"Akses ditolak"** | Akun tidak berizin untuk halaman itu. Minta atasan menambah izin. |
| **Proyek tidak tampil** | Anda belum ditugaskan ke proyek itu. Minta atasan menugaskan lewat **Akun Pengguna**. |
| **Tombol Catat transaksi nonaktif** | Proyek belum punya barang bersaldo awal (Bab 7.3). |
| **"Stok tidak cukup"** | Jumlah keluar melebihi stok pada tanggal itu atau sesudahnya. Periksa jumlah dan tanggal; catat barang masuk lebih dulu bila perlu. |
| **"Tanggal sebelum saldo awal"** | Transaksi tidak boleh lebih awal dari tanggal saldo awal barang di proyek itu. |
| **"Sedang dicatat pengguna lain"** | Barang yang sama dicatat bersamaan. Tunggu beberapa detik, ulangi. |
| **Salah catat transaksi** | Gunakan **Koreksi** (Bab 8.3), lalu catat yang benar. Transaksi tidak dapat diubah atau dihapus. |
| **Saldo awal salah dan terkunci** | Saldo awal terkunci setelah ada transaksi. Perbaiki dengan transaksi koreksi. |
| **Impor gagal sebagian** | Tekan **Impor** lagi pada pratinjau: baris yang sudah masuk dilewati, tidak ganda. |
| **Tampilan lama setelah pembaruan** | Muat ulang dengan **Ctrl+F5** (Windows) atau **Cmd+Shift+R** (Mac). Periksa versi di footer. |
| **Data dashboard belum terbaru** | Dashboard menyimpan data 5 menit. Tekan **Segarkan**. |
| **Peringatan kuota 80% / 95%** | Pemakaian harian gratis hampir habis. Tunda impor besar sampai hari berikutnya (hari kuota berganti tengah malam waktu Pasifik). |

<!--pagebreak-->

# Lampiran A. Batas dan aturan angka

| Hal | Batas |
|---|---|
| Panjang password | Minimal 6 karakter |
| Jumlah dan batas minimum | Maksimal 3 angka desimal; jumlah transaksi harus lebih dari 0 |
| Nama barang / satuan / kategori | Maksimal 160 / 40 / 80 karakter |
| Keterangan transaksi | Maksimal 200 karakter |
| Berkas impor | Maksimal 2 MB, 3.000 baris, format .xlsx |
| Impor per permintaan ke server | Dikirim bertahap otomatis (±150 baris atau 10 barang per permintaan) |
| Jeda cadangan manual | 5 menit |
| Cache dashboard | 5 menit |
| Stok negatif | Tidak diizinkan pada tanggal mana pun |
| Tanggal transaksi | Tidak sebelum saldo awal, tidak di masa depan (WITA) |
| Perangkat biometrik per akun | Dibatasi (aplikasi menyebut batasnya bila tercapai) |

# Lampiran B. Glosarium status

| Status | Arti |
|---|---|
| **Aman** | Sisa stok di atas 1,5 × batas minimum. |
| **Menipis** | Sisa ≤ 1,5 × batas minimum. |
| **Kritis** | Sisa ≤ batas minimum. |
| **Tidak bergerak** | Tanpa transaksi 14 hari atau lebih. |
| **Siap menerima transaksi** | Barang proyek sudah bersaldo awal. |
| **Sudah dikoreksi** | Transaksi asli yang sudah dibalik oleh baris Koreksi. |
| **Sedang dihapus** | Proyek dalam proses hapus permanen yang belum selesai. |

# Lampiran C. Berkas contoh siap pakai

Folder `docs/manual/contoh/` di repositori memuat berkas yang dipakai pada gambar manual ini, hasil unduhan dan pengisian di aplikasi sungguhan:

| Berkas | Isi |
|---|---|
| `template-transaksi.xlsx`, `template-katalog.xlsx`, `template-saldo-awal.xlsx` | Template asli hasil unduhan, dengan lembar **Contoh Pengisian** dan **Petunjuk**. |
| `contoh-transaksi-terisi.xlsx`, `contoh-katalog-terisi.xlsx`, `contoh-saldo-awal-terisi.xlsx` | Template yang sudah diisi, termasuk beberapa baris salah dengan sengaja untuk memperlihatkan pratinjau. |
| `contoh-ekspor-transaksi.xlsx` | Contoh hasil ekspor Excel. |

> **Perhatian:** Template berisi daftar barang milik proyek saat diunduh. Untuk impor sungguhan, **unduh template baru dari aplikasi** Anda sendiri.

# Lampiran D. Bantuan lebih lanjut

- Menu **Panduan** di dalam aplikasi (isinya mengikuti role Anda).
- Atasan Anda: Manajer Proyek, Direktur, atau Owner.
- Pengelola teknis (Developer): untuk deploy, rahasia, dan pemulihan data, lihat `docs/RUNBOOK.md`.
