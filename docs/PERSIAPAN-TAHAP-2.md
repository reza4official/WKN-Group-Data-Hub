# Persiapan Sebelum Tahap 2

Panduan langkah demi langkah untuk **Tahap 0** (dikerjakan pemilik). Semua langkah memakai paket gratis dan **tidak memerlukan kartu kredit**. Tampilan situs Google dan Cloudflare bisa sedikit berbeda dari uraian di bawah; nama menunya yang jadi acuan.

Perkiraan waktu: 45–60 menit.

> **Aturan keamanan:** jangan pernah mengirim ke chat atau menaruh di repo: berkas JSON service account, Secret Key Turnstile, token API, atau password. Yang boleh dikirim hanya nilai bertanda **(aman dibagikan)**.

---

## Ringkasan: apa yang perlu dikirim kembali

| Nilai | Dari langkah | Boleh dikirim? |
|-------|--------------|----------------|
| Konfirmasi Project ID `wkngroup-datahub` berhasil dibuat | A1 | Ya |
| Objek `firebaseConfig` | A2 | Ya (kunci web memang publik) |
| Lokasi Firestore yang dipilih | A5 | Ya |
| Subdomain `workers.dev` | C2 | Ya |
| Account ID Cloudflare | C1 | Ya |
| ID namespace KV | C3 | Ya |
| Turnstile **Site Key** | C4 | Ya |
| Username, nama, dan email Google untuk akun Developer pertama | D | Ya |
| Berkas JSON service account | B | **Tidak** |
| Turnstile **Secret Key** | C4 | **Tidak** |
| Password apa pun | D | **Tidak** |

---

## A. Firebase (Google)

### A1. Buat proyek
1. Buka https://console.firebase.google.com dan masuk dengan akun Google milik perusahaan.
2. Klik **Create a project** (Buat proyek).
3. Nama: `WKN Group Data Hub`.
4. Pada **Project ID**, klik ikon pensil dan isi **`wkngroup-datahub`**. ID **tidak bisa diubah** setelah dibuat.
   - Jika `wkngroup-datahub` sudah dipakai orang lain, kabari saya sebelum memilih ID lain.
   - Alamat aplikasi otomatis menjadi `https://wkngroup-datahub.web.app`.
5. Google Analytics: matikan (tidak dibutuhkan).
6. Klik **Create project**.
7. **Tetap di paket Spark (gratis).** Jika ada tawaran upgrade ke Blaze, abaikan.

**Cek:** halaman utama proyek terbuka, tertulis paket **Spark** di sudut kiri bawah.

### A2. Daftarkan aplikasi web
1. Di halaman proyek, klik ikon **`</>` (Web)**.
2. Nama aplikasi: `WKN Data Hub Web`. **Jangan** centang Firebase Hosting di langkah ini.
3. Klik **Register app**.
4. Salin blok `firebaseConfig` (berisi `apiKey`, `authDomain`, `projectId`, `appId`, dan sejenisnya). Ini aman dibagikan.

### A3. Aktifkan Authentication
1. Menu **Build → Authentication → Get started**.
2. Tab **Sign-in method**, aktifkan:
   - **Email/Password** (aktifkan hanya yang atas; Email link tidak perlu).
   - **Google**: isi *Project support email* dengan email Anda, lalu **Save**.
3. Tab **Settings → Authorized domains**. Pastikan ada `wkngroup-datahub.web.app`. Jika belum, klik **Add domain** dan tambahkan. Tambahkan juga `localhost` untuk pengembangan (biasanya sudah ada).

### A4. Aktifkan Hosting
1. Menu **Build → Hosting → Get started**, lalu ikuti sampai selesai (perintahnya dijalankan di A6).

### A5. Buat database Firestore
1. Menu **Build → Firestore Database → Create database**.
2. Edition: **Standard**.
3. Lokasi: **`asia-southeast2` (Jakarta)**. Lokasi **tidak bisa diubah** setelah dibuat.
4. Mode: **Production mode** (kunci rapat; aturan akses saya yang menulis).
5. Klik **Create**.

**Cek:** tab **Data** terbuka dan kosong.

### A6. Pasang alat bantu dan deploy v0.1.0 (opsional, tetapi disarankan)
Di komputer Anda, butuh Node.js 22.12 atau lebih baru (https://nodejs.org).

```bash
npm install -g firebase-tools
firebase login
```

Ambil kode ini dari GitHub (`.firebaserc` sudah berisi `wkngroup-datahub`, dan `firebase.json` memakai situs bawaan proyek). Kemudian:

```bash
cd app
npm install
npm run build
cd ..
firebase deploy --only hosting
```

**Cek:** https://wkngroup-datahub.web.app menampilkan aplikasi dengan logo WKN, dan footer berakhir `v0.1.0`.

---

## B. Service account untuk Worker

Worker memakai service account untuk membuat akun, mereset password, dan menulis data. Dibuat khusus dengan izin seminimal mungkin.

1. Buka https://console.cloud.google.com, pilih proyek Firebase Anda di bagian atas.
2. Menu **IAM & Admin → Service Accounts → Create service account**.
3. Nama: `wkn-worker`. Klik **Create and continue**.
4. Beri dua peran:
   - **Firebase Authentication Admin**
   - **Cloud Datastore User**
5. Klik **Done**.
6. Klik akun `wkn-worker` → tab **Keys → Add key → Create new key → JSON → Create**. Berkas JSON terunduh.
7. **Simpan berkas itu di tempat aman** (misal pengelola password). Jangan unggah ke GitHub, chat, atau email.
8. Pastikan dua API aktif di **APIs & Services → Library**: **Identity Toolkit API** dan **Cloud Firestore API** (keduanya biasanya sudah aktif otomatis).

**Jika tombol Create key diblokir** (pesan "Service account key creation is disabled"): proyek Anda berada di organisasi dengan kebijakan ketat. Kabari saya; ada jalur alternatif.

Berkas JSON ini nanti dipasang sebagai secret Worker di langkah E, tidak pernah masuk repo.

---

## C. Cloudflare

### C1. Akun
1. Daftar di https://dash.cloudflare.com/sign-up (paket **Free**), verifikasi email.
2. Buka **Workers & Pages**. Catat **Account ID** (tampil di sisi kanan halaman). Aman dibagikan.

### C2. Subdomain workers.dev
1. Pada **Workers & Pages**, jika diminta, pilih subdomain akun, misal `wkngroup`.
2. Alamat API nanti: `https://wkn-data-hub-api.<subdomain>.workers.dev`. Catat `<subdomain>`.

### C3. KV (untuk pembatas laju)
1. **Workers & Pages → KV → Create a namespace**.
2. Nama: `wkn-ratelimit`. Salin **Namespace ID**.

### C4. Turnstile (anti-bot untuk permintaan reset password)
1. Menu **Turnstile → Add widget**.
2. Nama: `WKN Data Hub`.
3. Hostname: tambahkan `wkngroup-datahub.web.app` dan `localhost`.
4. Mode widget: **Managed**.
5. Klik **Create**, lalu catat dua nilai:
   - **Site Key**: aman dibagikan.
   - **Secret Key**: **rahasia**, simpan di pengelola password.

---

## D. Data akun Developer pertama

Siapkan untuk dikirim ke saya (tanpa password):
- **Username** yang diinginkan (bebas, tanpa aturan format).
- **Nama lengkap**.
- **Email Google** yang akan dipakai untuk Login Google. Harus sama dengan email yang didaftarkan di akun.

Password awal tidak pernah lewat chat. Anda akan mengetiknya sendiri langsung di terminal saat skrip pembuat akun dijalankan di Tahap 2.

---

## E. Alat Cloudflare di komputer Anda

```bash
npm install -g wrangler
wrangler login
```

Browser terbuka untuk memberi izin. Pasang rahasia Worker nanti (diarahkan saya pada Tahap 2) dengan perintah seperti ini, ditempel isi berkas JSON saat diminta:

```bash
cd worker
wrangler secret put FIREBASE_SERVICE_ACCOUNT
wrangler secret put TURNSTILE_SECRET
```

Jangan jalankan dulu sebelum saya beri nama dan format persisnya.

---

## Daftar periksa akhir

- [ ] Proyek Firebase `wkngroup-datahub` di paket Spark
- [ ] `firebaseConfig` tersalin
- [ ] Authentication: Email/Password dan Google aktif, `wkngroup-datahub.web.app` ada di Authorized domains
- [ ] Firestore dibuat di `asia-southeast2`, mode Production
- [ ] `wkngroup-datahub.web.app` bisa dibuka (halaman default atau v0.1.0)
- [ ] Service account `wkn-worker` dibuat, dua peran, kunci JSON tersimpan aman
- [ ] Akun Cloudflare, Account ID, subdomain workers.dev, KV `wkn-ratelimit`, Turnstile (Site Key dan Secret Key)
- [ ] Data akun Developer (username, nama, email Google) siap
- [ ] (Opsional) v0.1.0 sudah dideploy

## Masalah yang sering muncul

| Gejala | Penyebab dan solusi |
|--------|---------------------|
| Project ID `wkngroup-datahub` tidak tersedia | Kabari saya sebelum memilih ID lain |
| Firebase meminta upgrade ke Blaze | Jangan upgrade. Fitur yang dibutuhkan sudah tersedia di Spark |
| Tidak bisa membuat key service account | Kebijakan organisasi memblokir; kabari saya |
| `firebase deploy` menolak izin | Jalankan `firebase login` ulang dengan akun yang memiliki proyek |
| Login Google gagal "unauthorized domain" | Tambahkan `wkngroup-datahub.web.app` di Authentication → Settings → Authorized domains |
| Turnstile menolak hostname | Pastikan `wkngroup-datahub.web.app` ada di daftar hostname widget |

## Setelah semua selesai

Kirimkan nilai-nilai bertanda "Ya" dari tabel ringkasan di atas, lalu perintahkan: **"mulai Tahap 2"**.
