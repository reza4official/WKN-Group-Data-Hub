#!/usr/bin/env node
// Membuat akun Developer pertama (sekali saja) dan mengisi role bawaan.
//
//   node scripts/bootstrap-developer.mjs --key "C:\jalur\ke\service-account.json"
//
// Password diketik langsung di terminal (tidak tampil, tidak disimpan, tidak dikirim ke mana pun
// selain ke Firebase Authentication). Skrip menolak berjalan bila akun Developer sudah ada.
import { createHash, createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stdin, stdout, argv, env, exit } from 'node:process'
import { createInterface } from 'node:readline'

// ---------- Identitas (harus identik dengan app/src/lib/identity.ts) ----------
const normalizeUsername = (s) => s.trim().normalize('NFC').toLowerCase().normalize('NFC')
const digest = (s) => createHash('sha256').update(normalizeUsername(s)).digest('hex')
const SYNTH_DOMAIN = 'users.wkngroup.invalid'
const syntheticEmail = (u) => `${digest(u)}@${SYNTH_DOMAIN}`

// Vektor uji bersama: bila hasil berbeda dengan aplikasi, skrip berhenti agar akun tidak tak bisa login.
const VECTORS = [
  ['  Reza4Official_ ', '3ac12b9ebcb8be7da85219f3759ea8a4331ac48748618c766b3b19416b9b0d59'],
  ['Ünal ŞİMŞEK', 'ef38fc57201118457261e4a68325638faae56ee6cb0fd7e0915db6aacfdb68f1'],
]
for (const [input, want] of VECTORS) {
  if (digest(input) !== want) fatal('Pemeriksaan internal gagal: penurunan username tidak cocok dengan aplikasi.')
}

// ---------- Role bawaan (sumber tunggal: shared/permissions.json) ----------
const SHARED = JSON.parse(readFileSync(new URL('../shared/permissions.json', import.meta.url), 'utf8'))
const ALL = SHARED.keys
const ROLES = SHARED.defaultRoles.map((r) => ({ ...r, perms: r.perms === 'all' ? ALL : r.perms }))

// ---------- Argumen ----------
const args = parseArgs(argv.slice(2))
const emulator = args.has('emulator')
const keyPath = args.get('key') ?? env.GOOGLE_APPLICATION_CREDENTIALS
if (args.has('help')) usage(0)

let sa = null
let project = args.get('project')
if (!emulator) {
  if (!keyPath) usage(1, 'Berkas service account belum ditentukan (--key).')
  try {
    sa = JSON.parse(readFileSync(keyPath, 'utf8'))
  } catch (e) {
    fatal(`Tidak dapat membaca berkas service account: ${e.message}`)
  }
  if (!sa.client_email || !sa.private_key || !sa.project_id) fatal('Berkas service account tidak lengkap.')
  project = sa.project_id
  if (args.has('allow-other-project')) {
    // Kunci dari proyek Google Cloud lain, diberi izin di proyek Firebase target lewat IAM.
    project = args.get('project')
    if (!project || project === true) fatal('Dengan --allow-other-project, tentukan proyek target: --project wkngroup-datahub')
    console.log(`Catatan: kunci berasal dari proyek "${sa.project_id}", target data: "${project}".`)
  }
  // Pengaman: kunci harus berasal dari proyek yang sama dengan .firebaserc (kesalahan umum: membuat
  // service account di proyek Google Cloud lain, misalnya yang namanya sama dengan nama akun).
  try {
    const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
    const expected = rc?.projects?.default
    if (expected && expected !== project && !args.has('allow-other-project')) {
      fatal(
        `Berkas kunci berasal dari proyek "${project}", padahal proyek aplikasi ini "${expected}".\n` +
          'Jika sengaja memakai kunci dari proyek lain, tambahkan: --allow-other-project --project ' + expected + '\n' +
          `Buat ulang service account DI DALAM proyek "${expected}" (Google Cloud Console, pilih proyek itu di bagian atas halaman,\n` +
          'lalu IAM & Admin -> Service Accounts). Lihat docs/PERSIAPAN-TAHAP-2.md bagian B.',
      )
    }
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e
  }
} else if (!project?.startsWith('demo-')) {
  fatal('Mode --emulator hanya untuk proyek berawalan "demo-" (--project demo-xxx).')
}

const FS_HOST = env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
const AUTH_HOST = env.AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
const FS = emulator
  ? `http://${FS_HOST}/v1/projects/${project}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
const IDT = emulator
  ? `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${project}`
  : `https://identitytoolkit.googleapis.com/v1/projects/${project}`

// ---------- Akses ----------
const b64u = (b) => Buffer.from(b).toString('base64url')
async function accessToken() {
  if (emulator) return 'owner'
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64u(sig)}` }),
  })
  if (!res.ok) fatal(`Gagal masuk dengan service account (${res.status}). Periksa berkas kunci dan peran akunnya.`)
  return (await res.json()).access_token
}
let TOKEN = ''
const call = (url, init = {}) =>
  fetch(url, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })

const fv = (v) =>
  typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(fv) } }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : { stringValue: String(v) }
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fv(v)]))
const docName = (path) => `projects/${project}/databases/(default)/documents/${path}`

// ---------- Input ----------
async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout })
  return new Promise((r) => rl.question(question, (a) => (rl.close(), r(a.trim()))))
}
function askHidden(question) {
  return new Promise((resolve) => {
    if (!stdin.isTTY) return resolve('')
    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let buf = ''
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          return resolve(buf)
        }
        if (c === '\u0003') exit(130)
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1)
        else buf += c
      }
    }
    stdin.on('data', onData)
  })
}

// ---------- Proses ----------
console.log(`\nProyek Firebase: ${project}${emulator ? ' (emulator)' : ''}\n`)
TOKEN = await accessToken()

const existing = await call(`${FS}:runQuery`, {
  method: 'POST',
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'roleId' }, op: 'EQUAL', value: { stringValue: 'dev' } } }, limit: 1 } }),
})
if (!existing.ok) fatal(`Tidak dapat memeriksa akun Developer yang ada (${existing.status}). Pastikan Firestore sudah dibuat dan service account punya peran Cloud Datastore User.`)
if ((await existing.json()).some((r) => r.document)) fatal('Akun Developer sudah ada. Skrip ini hanya untuk setup awal dan tidak akan menimpa apa pun.')

const username = args.get('username') ?? (await ask('Username Developer (bebas, tanpa aturan format): '))
const name = args.get('name') ?? (await ask('Nama lengkap: '))
const email = (args.get('email') ?? (await ask('Email Google untuk Login Google: '))).toLowerCase()
let password = ''
if (emulator && args.has('password-env')) password = env[args.get('password-env')] ?? ''
else {
  password = await askHidden('Password (minimal 6 karakter, tidak tampil): ')
  const again = await askHidden('Ulangi password: ')
  if (password !== again) fatal('Password tidak sama.')
}
if (!normalizeUsername(username)) fatal('Username tidak boleh kosong.')
if (!name) fatal('Nama tidak boleh kosong.')
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fatal('Email tidak valid.')
if (password.length < 6) fatal('Password minimal 6 karakter (batas Firebase Authentication).')

// 1) Akun Authentication
const created = await call(`${IDT}/accounts`, {
  method: 'POST',
  body: JSON.stringify({ email: syntheticEmail(username), password, displayName: name, emailVerified: true }),
})
if (!created.ok) fatal(`Gagal membuat akun Authentication (${created.status}): ${await created.text()}`)
const uid = (await created.json()).localId

// 2) Profil + penjaga keunikan username (atomik; gagal bila sudah ada)
const now = new Date()
const commit = await call(`${FS}:commit`, {
  method: 'POST',
  body: JSON.stringify({
    writes: [
      { update: { name: docName(`users/${uid}`), fields: fields({ username: username.trim(), usernameKey: digest(username), name, phone: '', emailContact: email, roleId: 'dev', level: 100, companyIds: [], projectIds: [], disabled: false, createdBy: 'bootstrap', createdAt: now }) }, currentDocument: { exists: false } },
      { update: { name: docName(`usernames/${digest(username)}`), fields: fields({ uid }) }, currentDocument: { exists: false } },
    ],
  }),
})
if (!commit.ok) {
  await call(`${IDT}/accounts:delete`, { method: 'POST', body: JSON.stringify({ localId: uid }) })
  fatal(`Gagal menyimpan profil (${commit.status}); akun Authentication dibatalkan. ${await commit.text()}`)
}

// 3) Role bawaan (tidak menimpa yang sudah ada)
let seeded = 0
for (const r of ROLES) {
  const res = await call(`${FS}:commit`, {
    method: 'POST',
    body: JSON.stringify({ writes: [{ update: { name: docName(`roles/${r.id}`), fields: fields({ name: r.name, level: r.level, system: r.system, perms: r.perms }) }, currentDocument: { exists: false } }] }),
  })
  if (res.ok) seeded++
}

console.log(`\nSelesai.\n- Akun Developer dibuat: ${username.trim()} (${email})\n- Role bawaan ditambahkan: ${seeded} dari ${ROLES.length}\n\nSekarang Anda dapat masuk dengan username dan password tadi, atau dengan Login Google.`)

// ---------- Util ----------
function parseArgs(list) {
  const m = new Map()
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith('--')) continue
    const k = list[i].slice(2)
    const v = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true
    m.set(k, v)
  }
  return m
}
function fatal(msg) {
  console.error(`\nGAGAL: ${msg}`)
  exit(1)
}
function usage(code, msg) {
  if (msg) console.error(`${msg}\n`)
  console.log('Pemakaian:\n  node scripts/bootstrap-developer.mjs --key "<jalur ke service-account.json>"\n\nKunci dari proyek Google Cloud lain (sudah diberi izin di proyek target):\n  node scripts/bootstrap-developer.mjs --key "<jalur>" --allow-other-project --project wkngroup-datahub\n\nPilihan pengujian lokal:\n  --emulator --project demo-xxx [--username U --name N --email E --password-env NAMA_VAR]')
  exit(code)
}
