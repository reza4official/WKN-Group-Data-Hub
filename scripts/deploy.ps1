<#
  Deploy WKN Group Data Hub dalam satu perintah: Worker -> aturan Firestore -> aplikasi (Hosting), lalu memeriksa /health.
  Dijalankan dari mana saja; skrip pindah sendiri ke folder repo.

  Contoh:
    .\deploy.cmd                      semua langkah (paling sering)
    .\deploy.cmd -Pull                ambil kode terbaru dulu (git stash, pull, stash pop)
    .\deploy.cmd -SkipFirestore       lewati aturan Firestore
    .\deploy.cmd -OnlyHosting         hanya aplikasi
    .\deploy.cmd -Test                jalankan tes dulu
    .\deploy.cmd -Yes                 tanpa pertanyaan konfirmasi

  Skrip ini TIDAK meminta atau menyimpan rahasia. Login Firebase/Cloudflare memakai sesi yang sudah ada
  (firebase login, npx wrangler login). Rahasia Worker (wrangler secret put ...) dipasang terpisah, sekali saja.
#>
param(
  [switch]$Pull,
  [switch]$Test,
  [switch]$SkipWorker,
  [switch]$SkipFirestore,
  [switch]$SkipHosting,
  [switch]$OnlyWorker,
  [switch]$OnlyFirestore,
  [switch]$OnlyHosting,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step([string]$text) {
  Write-Host ''
  Write-Host "==> $text" -ForegroundColor Cyan
}
function Fail([string]$text) {
  Write-Host ''
  Write-Host "GAGAL: $text" -ForegroundColor Red
  exit 1
}
# Menjalankan perintah dan berhenti bila gagal (kode keluar bukan 0).
function Run([string]$label, [scriptblock]$cmd) {
  Step $label
  & $cmd
  if ($LASTEXITCODE -ne 0) { Fail "$label (kode keluar $LASTEXITCODE). Baca pesan di atas." }
}

# --- Pilihan langkah
$doWorker = -not $SkipWorker
$doFirestore = -not $SkipFirestore
$doHosting = -not $SkipHosting
if ($OnlyWorker -or $OnlyFirestore -or $OnlyHosting) {
  $doWorker = [bool]$OnlyWorker
  $doFirestore = [bool]$OnlyFirestore
  $doHosting = [bool]$OnlyHosting
}

# --- Prasyarat
Step 'Memeriksa prasyarat'
foreach ($tool in @('git', 'node', 'npm', 'npx')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "'$tool' tidak ditemukan. Pasang Node.js dan Git lebih dulu." }
}
if (($doFirestore -or $doHosting) -and -not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Fail "'firebase' tidak ditemukan. Pasang dengan:  npm install -g firebase-tools   lalu   firebase login"
}
$cfgPath = Join-Path $root 'app\src\config\public-config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
if ($doHosting -and ($cfg.apiUrl -like '*GANTI*' -or $cfg.firebase.apiKey -like '*GANTI*' -or $cfg.firebase.appId -like '*GANTI*')) {
  Fail "app\src\config\public-config.json masih berisi nilai GANTI. Isi dengan nilai asli Anda (lihat docs/TAHAP-2-PENERAPAN.md); berkas ini tidak untuk di-commit."
}
$apiUrl = ([string]$cfg.apiUrl).TrimEnd('/')
$expected = (Get-Content (Join-Path $root 'worker\package.json') -Raw | ConvertFrom-Json).version

# --- Ambil kode terbaru (opsional)
if ($Pull) {
  Step 'Mengambil kode terbaru (git stash, pull, stash pop)'
  $before = @(git stash list).Count
  git stash
  if ($LASTEXITCODE -ne 0) { Fail 'git stash gagal.' }
  $after = @(git stash list).Count
  git pull
  if ($LASTEXITCODE -ne 0) {
    if ($after -gt $before) { Write-Host 'Perubahan lokal Anda masih aman di stash. Pulihkan dengan: git stash pop' -ForegroundColor Yellow }
    Fail 'git pull gagal.'
  }
  if ($after -gt $before) {
    git stash pop
    if ($LASTEXITCODE -ne 0) { Fail 'git stash pop bentrok. Selesaikan konflik (lihat docs/TAHAP-8-9-PENERAPAN-GABUNGAN.md bagian A), lalu jalankan lagi tanpa -Pull.' }
  }
  $expected = (Get-Content (Join-Path $root 'worker\package.json') -Raw | ConvertFrom-Json).version
}

# --- Ringkasan dan konfirmasi
$plan = @()
if ($doWorker) { $plan += 'Worker (wrangler deploy)' }
if ($doFirestore) { $plan += 'Aturan Firestore' }
if ($doHosting) { $plan += 'Aplikasi (build + Hosting)' }
Write-Host ''
Write-Host "Versi yang akan di-deploy : v$expected" -ForegroundColor Green
Write-Host "Langkah                   : $($plan -join '  ->  ')"
if (-not $Yes) {
  $answer = Read-Host 'Lanjut? (y/n)'
  if ($answer -notin @('y', 'Y', 'ya', 'Ya')) { Write-Host 'Dibatalkan.'; exit 0 }
}

# --- Tes (opsional)
if ($Test) {
  Push-Location (Join-Path $root 'worker'); Run 'Tes Worker' { npm test }; Pop-Location
  Push-Location (Join-Path $root 'app'); Run 'Tes aplikasi' { npm test }; Pop-Location
}

# --- Deploy
if ($doWorker) {
  Push-Location (Join-Path $root 'worker')
  Run 'Worker: npm install' { npm install }
  Run 'Worker: wrangler deploy' { npx wrangler deploy }
  Pop-Location
}
if ($doFirestore) {
  Run 'Firestore: aturan dan indeks' { firebase deploy --only firestore }
}
if ($doHosting) {
  Push-Location (Join-Path $root 'app')
  Run 'Aplikasi: npm install' { npm install }
  Run 'Aplikasi: npm run build' { npm run build }
  Pop-Location
  Run 'Hosting: firebase deploy' { firebase deploy --only hosting }
}

# --- Pemeriksaan
if ($doWorker) {
  Step "Memeriksa Worker ($apiUrl/health)"
  $ok = $false
  for ($i = 1; $i -le 5 -and -not $ok; $i++) {
    try {
      $h = Invoke-RestMethod "$apiUrl/health" -TimeoutSec 15
      if ($h.version -eq $expected) { $ok = $true; Write-Host "OK: Worker versi $($h.version)" -ForegroundColor Green }
      else { Write-Host "Percobaan ${i}: versi Worker $($h.version), diharapkan $expected. Menunggu..." -ForegroundColor Yellow; Start-Sleep -Seconds 4 }
    } catch {
      Write-Host "Percobaan ${i}: belum dapat dihubungi. Menunggu..." -ForegroundColor Yellow
      Start-Sleep -Seconds 4
    }
  }
  if (-not $ok) { Write-Host "PERINGATAN: versi Worker belum sesuai v$expected. Periksa dashboard Cloudflare." -ForegroundColor Yellow }
}

Write-Host ''
Write-Host "SELESAI. Buka https://wkngroup-datahub.web.app dan periksa footer: v$expected (muat ulang dengan Ctrl+F5 bila masih versi lama)." -ForegroundColor Green
