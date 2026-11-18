# Riwayat Perubahan

Format versi: vX.X.X (major.minor.patch). Patch untuk perbaikan, minor untuk fitur, major untuk perubahan besar.

## v0.8.1

- Pratinjau impor: bila nama barang ada di katalog tetapi belum ditambahkan ke proyek, pesannya kini menjelaskan hal itu dan langkah perbaikannya (sebelumnya hanya "tidak ada di proyek ini").

## v0.8.0 — Tahap 8: Profil dan Database Karyawan

- **Profil Saya**: ubah nama, no. HP, email kontak, dan **ganti password** (meminta password lama; semua isian password memakai ikon mata; sesi tetap masuk). Email kontak terpisah dari email sintetis login username dan harus unik (dipakai Login Google).
- Rute Worker `/profile/update` (hanya data diri sendiri; role, level, proyek, status, username tidak dapat diubah) dan `/profile/change-password` (bukti password lama = token login password yang baru, maks. 5 menit; audit ditulis lebih dulu, entri pembatalan bila gagal).
- **Database Karyawan** (izin `employees`: Developer, Owner, Direktur): semua akun dengan nama, username, HP, email, role, status, dan pengubah beserta waktu terakhir (WITA). Cari, filter role/status/proyek, ekspor Excel dan PDF. Perubahan profil langsung tampil (satu sumber data). Manajer Proyek dan Admin Logistik tidak dapat membukanya (menu, alamat, dan aturan Firestore).
- `firestore.rules`: pemegang `employees` boleh membaca semua akun; tulis tetap hanya Worker. Log Audit: *Ubah data diri*, *Ganti password sendiri*, *Impor transaksi*.
- **Template impor** kini memuat lembar **Contoh Pengisian** (contoh benar dan salah memakai nama barang proyek; tidak ikut diimpor) dan catatan format pada judul kolom.
- Tes: Worker 163, aplikasi 198, aturan Firestore 22; end-to-end Tahap 8 (35), Tahap 7 (24), Tahap 3 (25).

## v0.7.0 — Tahap 7: Ekspor dan impor

- **Ekspor** (menu Impor / Ekspor): Excel (.xlsx) dan PDF berkop logo, memuat proyek, periode, pembuat (nama dan role), dan waktu cetak WITA. Isi: Transaksi (termasuk saldo awal, koreksi, pencatat, waktu catat) dan/atau Ringkasan per barang.
- **Impor transaksi dari Excel**: unduh template (daftar barang proyek, pilihan Jenis), unggah, **pratinjau validasi per baris** (alasan jelas, perkiraan penulisan), konfirmasi. Hanya baris valid yang dikirim; server memeriksa ulang (stok tidak boleh negatif, tanggal, saldo awal) dan menolak baris yang salah dengan alasan.
- Worker `/ledger/import`: satu commit atomik per permintaan (maks. 150 baris, 10 barang), idempoten per sesi impor, satu catatan audit "Impor transaksi", pencatat tiap baris = pengimpor. Barang masuk diproses lebih dulu, lalu keluar menurut tanggal. Hasil identik dengan pencatatan satu per satu (diuji pembanding).
- Berkas dibaca dan dibuat di perangkat; pustaka ExcelJS dan jsPDF dimuat hanya saat dibutuhkan. Batas 2 MB, 3.000 baris, `.xlsx`. Perlindungan rumus (sel berawalan `=+-@`).
- Pemuat data dashboard dipindah ke `lib/dashboardData` (dipakai bersama ekspor).
- Tes: Worker 152, aplikasi 180, aturan Firestore 20; end-to-end Tahap 7 (24), Tahap 6 (22).

## v0.6.0 — Tahap 6: Dashboard

- **Dashboard**: KPI (jenis barang, transaksi bulan, stok kritis, tidak bergerak), tabel ringkasan per barang (awal, masuk, keluar, sisa), perbandingan laju pemakaian harian dengan bulan lalu, persentase pemakaian, estimasi hari stok, status (Aman, Menipis, Kritis, Tidak bergerak), pencarian dan pengurutan.
- Filter proyek (satu atau **Semua proyek**, barang sama dijumlahkan) dan bulan. **Perbandingan antar proyek**, daftar **Perlu perhatian**, dan **Pemakaian tertinggi**.
- **Rincian barang**: grafik sisa stok 30 hari dengan garis batas minimum, dan masuk/keluar 6 bulan.
- Angka dari dokumen total bulanan (bukan transaksi mentah), koreksi sudah diperhitungkan (masuk efektif = masuk − pembalik masuk; keluar efektif = keluar − pembalik keluar). Awal bulan dihitung mundur dari stok saat ini.
- Worker mencatat `lastTxDate` pada barang untuk status "tidak bergerak". Aturan Firestore: total harian dapat dibaca (lingkup sama dengan barang proyek).
- Tes: Worker 139, aplikasi 134 (termasuk uji acak yang mencocokkan dashboard dengan hitungan manual dari buku), aturan Firestore 20; end-to-end Tahap 6 (22), Tahap 5 (26).

## v0.5.0 — Tahap 5: Transaksi stok (ledger)

- **Transaksi Stok**: catat barang masuk dan keluar per proyek (tanggal, jumlah, keterangan). Tabel Hari/Tanggal, Nama Barang, Satuan, Masuk, Keluar, Tersisa, Keterangan, Dicatat oleh beserta waktu WITA. Filter proyek, bulan, dan barang; total bulan di kaki tabel. Kolom Tersisa dihitung saat tampil, mundur dari stok saat ini dan total bulan yang dilihat dan sesudahnya (riwayat lama tidak dibaca, hemat kuota). Total di kaki tabel adalah setelah koreksi.
- **Penulisan hanya lewat Worker**, satu commit atomik: entri buku + stok barang + total harian + total bulanan + audit. Klien tidak dapat menulis (aturan Firestore menolak).
- **Aturan stok**: saldo awal wajib, tanggal tidak sebelum saldo awal dan tidak di masa depan (WITA), stok tidak boleh negatif pada titik waktu mana pun. Transaksi bertanggal mundur diperiksa terhadap saldo terendah sesudah tanggalnya. Dalam satu hari, barang masuk dihitung lebih dulu daripada keluar.
- **Angka tepat**: hitungan dalam bilangan bulat milli (0,1 + 0,2 = 0,3), maksimal 3 desimal.
- **Idempoten**: ID permintaan dibuat per pembukaan formulir; kirim ulang saat jaringan putus tidak mencatat dua kali.
- **Konkurensi**: pembaruan bersyarat (updateTime) dengan percobaan ulang; bila terlalu sibuk, galat `busy` yang jelas. Teruji pada emulator Firestore asli.
- **Koreksi**: entri pembalik yang merujuk transaksi asli, alasan wajib, satu koreksi per transaksi (ID deterministik), tidak ada ubah/hapus. Membalik barang masuk ditolak bila membuat stok negatif. Izin `inventory.correct`.
- Saldo awal terkunci setelah ada transaksi. Log audit: Barang masuk, Barang keluar, Koreksi transaksi.
- `firestore.rules`: baca buku dan total bulanan dengan lingkup yang sama seperti barang proyek; tidak ada indeks baru.
- Tes: Worker 138, aplikasi 104, aturan Firestore 20; end-to-end: Tahap 3 (25), Tahap 4 (29), Tahap 5 (25), konkurensi emulator asli (13).

## v0.4.1

- Pesan keadaan kosong untuk akun berlingkup proyek kini menjelaskan penyebabnya (belum ditugaskan ke proyek) dan cara mengatasinya, bukan "Belum ada akun di bawah level Anda".
- Panduan: akun yang dibuat sebelum Tahap 4 belum punya proyek dan perlu ditugaskan oleh Owner/Direktur.

## v0.4.0 — Tahap 4: Perusahaan, proyek, katalog, saldo awal, lingkup proyek (+ login biometrik)

- **Perusahaan & Proyek**: tambah dan ubah perusahaan (induk/anak) dan proyek (status, lokasi, tanggal mulai); nonaktifkan, bukan hapus.
- **Katalog Barang**: daftar baku satu grup; nama unik (tanpa membedakan huruf besar/kecil dan spasi tepi); barang yang sudah dipakai proyek tidak bisa dinonaktifkan atau diganti satuannya.
- **Barang & saldo awal per proyek**: jumlah dan tanggal saldo awal, batas minimum per proyek; barang tanpa saldo awal ditandai dan belum bisa menerima transaksi. Saldo awal terkunci setelah ada transaksi (Tahap 5).
- **Lingkup proyek**: Manajer Proyek dan Admin Logistik hanya melihat dan mengelola proyek serta akun yang ditugaskan kepadanya. Akun baru oleh pelaku berlingkup wajib menugaskan minimal satu proyek miliknya, dan proyek target di luar lingkup pelaku tidak ikut hilang saat diubah. Izin "projects" kini berarti melihat dan mengelola SEMUA proyek.
- **Penugasan proyek** saat membuat dan mengubah akun; kolom Proyek di daftar akun.
- Validasi jumlah (tidak negatif, maksimal 3 desimal, bukan NaN) dan tanggal "tidak di masa depan" menurut WITA (bukan UTC).
- `firestore.rules` dan indeks: daftar akun dan permintaan reset dibatasi lingkup proyek (butuh indeks komposit; deploy dengan `firebase deploy --only firestore`).
- **Login biometrik (WebAuthn/passkey)**: tombol ikon di samping tombol Masuk pada perangkat yang mendukung; ikon sidik jari atau Face ID menurut tebakan perangkat (disimpan dan konsisten). Pop-up ajakan mengaktifkan setelah login password/Google, dapat dilewati, muncul lagi di login berikutnya selama belum aktif (tidak muncul setelah login biometrik, muat ulang, atau di perangkat tanpa dukungan).
- Verifikasi WebAuthn di Worker: tantangan bertanda sekali pakai, origin dan rpId tepat, UP+UV wajib, ES256/RS256, penghitung (0 diterima, mundur ditolak), jawaban kegagalan seragam, pembatas laju. Passkey dicabut otomatis saat reset password dan hapus akun; akun nonaktif ditolak.
- **Profil Saya**: daftar perangkat biometrik, hapus, aktifkan di perangkat ini. Penyimpanan lokal per akun (satu perangkat bisa dipakai beberapa akun).
- Tes: Worker 106, aplikasi 79, aturan Firestore 20; end-to-end: Tahap 3 (25), Tahap 4 (29), biometrik (29, autentikator virtual Chromium).

## v0.3.0 — Tahap 3: Role, akun bawahan, reset password, log audit

- Halaman **Akun Pengguna**: tambah, ubah, nonaktifkan/aktifkan, hapus, dan reset password akun, hanya untuk level di bawah pelaku.
- Halaman **Role & Akses**: hirarki role, matriks izin yang dapat diedit, role baru, hapus role. Role sistem (Developer) terkunci; level role tidak berubah setelah dibuat.
- Halaman **Permintaan Reset**: daftar permintaan, eksekusi oleh atasan dengan pencatatan pelaku dan waktu (WITA).
- Halaman **Log Audit**: catatan permanen siapa melakukan apa dan kapan, dapat dicari.
- Permintaan reset dari halaman login (Cloudflare Turnstile + pembatas laju KV); jawabannya selalu seragam agar daftar username tidak dapat ditebak.
- Worker: endpoint `/users/*`, `/roles/*`, `/resets/execute`, `/auth/reset-request`. Pelaku dimuat ulang dari Firestore pada setiap permintaan; level dan izin tidak pernah dipercaya dari klien.
- Pencegahan eskalasi hak: target dan role harus berlevel di bawah pelaku, role yang diberikan hanya boleh berizin subset dari izin pelaku, hanya izin milik pelaku yang boleh diubah di matriks.
- Setiap perubahan ditulis atomik bersama entri audit (waktu dari server). Reset password memakai klaim berprasyarat sehingga dua atasan tidak bisa sama-sama mengeksekusi; kegagalan di Auth dibatalkan dan dicatat.
- Reset password mencabut sesi lama akun tersebut.
- `firestore.rules`: daftar akun, permintaan reset, dan log audit hanya dapat dibaca sesuai level dan izin; semua penulisan hanya lewat Worker.
- Daftar izin dan role bawaan kini satu sumber: `shared/permissions.json`.
- Tes: Worker (56 + skenario hirarki), aplikasi (46), aturan Firestore (13), end-to-end 25 skenario.

## v0.2.2

- Worker menyertakan ringkasan langkah yang gagal pada `server_error` (tanpa rahasia); aplikasi menampilkannya di pesan gagal Login Google.

## v0.2.1

- Pesan gagal Login Google kini menyertakan kode kesalahan dari server untuk memudahkan penelusuran.

## v0.2.0 — Tahap 2: Autentikasi dan Worker dasar

- Login username + password. Username bebas (spasi, simbol, Unicode); satu-satunya aturan password: minimal 6 karakter (batas Firebase).
- Login Google hanya untuk akun yang sudah didaftarkan atasan (dicocokkan lewat email); akun Google yang tidak terdaftar ditolak dan dibuang.
- Sesi permanen (tanpa auto logout); gangguan jaringan tidak mengeluarkan pengguna.
- Akun nonaktif atau tanpa profil ditolak dengan pesan jelas.
- Menu dan halaman dibatasi menurut izin role (penjaga rute dasar); kartu pengguna dan tombol Keluar di sidebar.
- Cloudflare Worker: verifikasi ID token Firebase (JWKS), CORS terkunci ke origin aplikasi, penukaran login Google (`/auth/google-link`).
- `firestore.rules` awal: tolak semua, kecuali baca profil sendiri dan daftar role oleh akun aktif.
- Skrip `scripts/bootstrap-developer.mjs`: akun Developer pertama dan role bawaan (aman diulang, tidak menimpa).
- Konfigurasi publik di `app/src/config/public-config.json`; build produksi gagal bila belum diisi.
- Header keamanan dibatasi ke halaman aplikasi agar jalur `/__/` milik Firebase (login Google) tidak terblokir.
- Perbaikan: input password tidak lagi memaksa `autocomplete="off"` sehingga pengelola password dapat mengisi form login.
- Tes: Worker (17), aplikasi (27), aturan Firestore (7) dan uji end-to-end terhadap emulator.

## v0.1.0 — Tahap 1: Fondasi dan tampilan

- Kerangka aplikasi Vite + React + TypeScript di `app/`.
- Tema terang dan gelap berbasis warna logo (biru, kuning, putih), pilihan tema tersimpan.
- Layout responsif: sidebar (menu seluler dengan scrim), bilah atas, footer berversi.
- Komponen dasar: tombol, input, input password dengan ikon mata, kartu, pill, tabel dengan penanda geser, keadaan kosong, modal dan panel samping, toast.
- Halaman kerangka untuk semua menu, dengan keterangan versi kehadiran fitur.
- Versi aplikasi satu sumber (`app/package.json`), tampil di footer.
- Logo (latar transparan), favicon, ikon PWA, manifest.
- Konfigurasi Firebase Hosting (`firebase.json`) dengan header keamanan dan cache.
- Kerangka Cloudflare Worker (`worker/`) dengan titik `/health`.
- Tes dasar (Vitest), ESLint, Prettier.
