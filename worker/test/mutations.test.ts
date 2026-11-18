import { beforeEach, describe, expect, it } from 'vitest'
import shared from '../../shared/permissions.json'
import worker from '../src/index'
import { resetJwksCache } from '../src/lib/idToken'
import { usernameDigest, syntheticEmail } from '../src/lib/identity'
import { resetAccessTokenCache } from '../src/lib/serviceAccount'
import { verifyTurnstile } from '../src/lib/turnstile'
import { FakeBackend, makeEnv, rsa } from './fakeBackend'
import type { Env } from '../src/env'

const ORIGIN = 'https://wkngroup-datahub.web.app'
const sa = rsa()
let be: FakeBackend
let env: Env

const ALL = shared.keys
const roleDocs = shared.defaultRoles.map((r) => ({ ...r, perms: r.perms === 'all' ? ALL : r.perms }))

async function seedUser(uid: string, username: string, roleId: string, over: Record<string, unknown> = {}) {
  const role = be.getData(`roles/${roleId}`) as { level: number }
  const key = await usernameDigest(username)
  be.seedDoc(`users/${uid}`, { username, usernameKey: key, name: `Nama ${username}`, phone: '', emailContact: `${username}@x.com`, roleId, level: role.level, disabled: false, companyIds: [], projectIds: [], ...over })
  be.seedDoc(`usernames/${key}`, { uid })
  be.seedAuth(uid, await syntheticEmail(username), 'pw-awal-123')
}

beforeEach(async () => {
  resetJwksCache()
  resetAccessTokenCache()
  be = new FakeBackend()
  be.install()
  env = makeEnv(sa)
  for (const r of roleDocs) be.seedDoc(`roles/${r.id}`, { name: r.name, level: r.level, system: r.system, perms: r.perms })
  await seedUser('u-dev', 'dev1', 'dev')
  await seedUser('u-own', 'own1', 'owner')
  await seedUser('u-dir', 'dir1', 'dir')
  await seedUser('u-pm1', 'pm1', 'pm')
  await seedUser('u-pm2', 'pm2', 'pm')
  await seedUser('u-log', 'log1', 'log')
})

async function post(path: string, body: unknown, as: string | null = null, e: Env = env) {
  const headers: Record<string, string> = { Origin: ORIGIN, 'Content-Type': 'application/json' }
  if (as) headers.Authorization = `Bearer ${be.idToken(as)}`
  const r = await worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) }), e)
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}

const audits = () => be.list('auditLog').map((a) => a.data)
const lastAudit = (action: string) => audits().filter((a) => a.action === action).pop()

describe('autentikasi pelaku', () => {
  it('tanpa token, token palsu, akun tanpa profil, dan akun nonaktif ditolak', async () => {
    expect((await post('/users/create', {})).status).toBe(401)
    const bad = await worker.fetch(new Request('https://api.test/users/create', { method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer a.b.c' }, body: '{}' }), env)
    expect(bad.status).toBe(401)
    expect((await post('/users/create', {}, 'u-tidak-terdaftar')).status).toBe(403)
    be.getData('users/u-own')!.disabled = true
    expect((await post('/users/create', {}, 'u-own')).body.error).toBe('disabled')
  })

  it('level dan izin dibaca dari Firestore, bukan dari token/klien', async () => {
    // klien mengaku level tinggi lewat badan permintaan: diabaikan
    const r = await post('/users/create', { username: 'x', name: 'x', roleId: 'dir', password: 'abcdef', level: 999, perms: ALL }, 'u-pm1')
    expect(r.status).toBe(403)
  })
})

describe('buat akun', () => {
  const base = { username: 'Siti Baru', name: 'Siti', roleId: 'log', password: 'rahasia1', emailContact: 'Siti@Contoh.com', phone: '0812' }

  it('Owner membuat Manajer Proyek: profil, username, akun Auth, dan audit tercatat', async () => {
    const r = await post('/users/create', { ...base, roleId: 'pm' }, 'u-own')
    expect(r.status).toBe(200)
    const uid = r.body.uid as string
    const u = be.getData(`users/${uid}`)!
    expect(u).toMatchObject({ username: 'Siti Baru', roleId: 'pm', level: 50, disabled: false, emailContact: 'siti@contoh.com', createdBy: 'u-own' })
    expect(be.getData(`usernames/${await usernameDigest('siti baru')}`)).toEqual({ uid })
    expect(be.auth.get(uid)!.email).toBe(await syntheticEmail('SITI BARU'))
    const a = lastAudit('user.create')!
    expect(a).toMatchObject({ actorUid: 'u-own', actorName: 'Nama own1', actorRole: 'Owner / Direktur Utama', actorLevel: 90, targetId: uid })
    expect(typeof a.at).toBe('string') // waktu dari server (REQUEST_TIME)
    expect(JSON.stringify(audits())).not.toContain('rahasia1')
  })

  it('tidak bisa membuat akun setara atau di atas level sendiri', async () => {
    expect((await post('/users/create', { ...base, roleId: 'pm' }, 'u-pm1')).status).toBe(403) // setara
    expect((await post('/users/create', { ...base, roleId: 'dir' }, 'u-pm1')).status).toBe(403) // di atas
    expect((await post('/users/create', { ...base, roleId: 'dev' }, 'u-dir')).status).toBe(403)
    expect((await post('/users/create', { ...base, roleId: 'dir' }, 'u-dir')).status).toBe(403) // setara
    expect((await post('/users/create', { ...base, roleId: 'log' }, 'u-pm1')).status).toBe(200) // di bawah
  })

  it('role dengan izin yang tidak dimiliki pelaku tidak bisa diberikan (cegah eskalasi lewat akun baru)', async () => {
    const r = await post('/roles/create', { name: 'Auditor', level: 40, perms: ['audit', 'users'] }, 'u-own')
    expect(r.status).toBe(200)
    const roleId = r.body.id as string
    // Manajer Proyek tidak punya izin 'audit' sehingga tidak boleh memberi role Auditor
    expect((await post('/users/create', { ...base, roleId }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/create', { ...base, roleId }, 'u-own')).status).toBe(200)
  })

  it('pelaku tanpa izin users ditolak', async () => {
    expect((await post('/users/create', base, 'u-log')).status).toBe(403)
  })

  it('username kembar (tanpa membedakan huruf besar/kecil dan spasi tepi) ditolak tanpa akun Auth yatim', async () => {
    const before = be.auth.size
    const r = await post('/users/create', { ...base, username: '  PM1 ' }, 'u-own')
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('username_taken')
    expect(be.auth.size).toBe(before)
  })

  it('email kontak kembar ditolak', async () => {
    const r = await post('/users/create', { ...base, emailContact: 'PM1@x.com' }, 'u-own')
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('email_taken')
  })

  it('password minimal 6 karakter dan tidak ada aturan lain', async () => {
    expect((await post('/users/create', { ...base, password: '12345' }, 'u-own')).status).toBe(400)
    expect((await post('/users/create', { ...base, password: 'a b' + 'c'.repeat(3) }, 'u-own')).status).toBe(200)
  })

  it('kegagalan commit membatalkan akun Auth (tidak ada akun yatim)', async () => {
    // Penjaga username sudah ada tanpa profil: Auth berhasil dibuat, commit gagal (ALREADY_EXISTS).
    be.seedDoc(`usernames/${await usernameDigest('yatim')}`, { uid: 'x' })
    const before = be.auth.size
    const r = await post('/users/create', { ...base, username: 'yatim' }, 'u-own')
    expect(r.status).toBe(409)
    expect(be.auth.size).toBe(before)
    expect(be.getData('users/auth-1')).toBeUndefined()
  })
})

describe('ubah akun', () => {
  it('atasan mengubah nama dan no. HP bawahan; perubahan tercatat sebelum/sesudah', async () => {
    const r = await post('/users/update', { uid: 'u-log', name: 'Nama Baru', phone: '0899' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(be.getData('users/u-log')).toMatchObject({ name: 'Nama Baru', phone: '0899', updatedBy: 'u-pm1' })
    const a = lastAudit('user.update')!
    expect(a.detail).toMatchObject({ before: { name: 'Nama log1' }, after: { name: 'Nama Baru' } })
  })

  it('tidak bisa mengubah akun setara atau di atasnya', async () => {
    expect((await post('/users/update', { uid: 'u-pm2', name: 'x' }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/update', { uid: 'u-own', name: 'x' }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/update', { uid: 'u-pm1', name: 'x' }, 'u-pm1')).status).toBe(403) // diri sendiri
    expect((await post('/users/update', { uid: 'u-dev', name: 'x' }, 'u-own')).status).toBe(403)
  })

  it('mengubah role hanya ke role di bawah pelaku; level ikut berubah', async () => {
    expect((await post('/users/update', { uid: 'u-log', roleId: 'dir' }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/update', { uid: 'u-log', roleId: 'pm' }, 'u-pm1')).status).toBe(403) // setara pelaku
    const r = await post('/users/update', { uid: 'u-pm1', roleId: 'log' }, 'u-own')
    expect(r.status).toBe(200)
    expect(be.getData('users/u-pm1')).toMatchObject({ roleId: 'log', level: 20 })
  })

  it('email kontak yang sudah dipakai akun lain ditolak; huruf besar disimpan kecil', async () => {
    expect((await post('/users/update', { uid: 'u-log', emailContact: 'pm2@x.com' }, 'u-pm1')).status).toBe(409)
    await post('/users/update', { uid: 'u-log', emailContact: 'Baru@X.com' }, 'u-pm1')
    expect(be.getData('users/u-log')!.emailContact).toBe('baru@x.com')
  })

  it('akun tidak ditemukan -> 404', async () => {
    expect((await post('/users/update', { uid: 'tidak-ada', name: 'x' }, 'u-own')).status).toBe(404)
  })
})

describe('nonaktifkan, hapus, reset password langsung', () => {
  it('menonaktifkan mencabut sesi dan memutus akun Auth; dapat diaktifkan lagi', async () => {
    expect((await post('/users/set-disabled', { uid: 'u-log', disabled: true }, 'u-pm1')).status).toBe(200)
    expect(be.auth.get('u-log')).toMatchObject({ disabled: true })
    expect(be.auth.get('u-log')!.validSince).toBeTruthy()
    expect(be.getData('users/u-log')!.disabled).toBe(true)
    expect(lastAudit('user.disable')).toBeTruthy()
    await post('/users/set-disabled', { uid: 'u-log', disabled: false }, 'u-pm1')
    expect(be.auth.get('u-log')!.disabled).toBe(false)
    expect(lastAudit('user.enable')).toBeTruthy()
  })

  it('tidak bisa menonaktifkan diri sendiri, setara, atau atasan', async () => {
    expect((await post('/users/set-disabled', { uid: 'u-pm1', disabled: true }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/set-disabled', { uid: 'u-pm2', disabled: true }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/set-disabled', { uid: 'u-own', disabled: true }, 'u-dir')).status).toBe(403)
  })

  it('menghapus akun membuang profil, username, dan akun Auth; atasan tidak bisa dihapus', async () => {
    const key = await usernameDigest('pm1')
    expect((await post('/users/delete', { uid: 'u-pm1' }, 'u-dir')).status).toBe(200)
    expect(be.getData('users/u-pm1')).toBeUndefined()
    expect(be.getData(`usernames/${key}`)).toBeUndefined()
    expect(be.auth.has('u-pm1')).toBe(false)
    expect(lastAudit('user.delete')).toMatchObject({ targetId: 'u-pm1' })
    expect((await post('/users/delete', { uid: 'u-own' }, 'u-dir')).status).toBe(403)
    expect((await post('/users/delete', { uid: 'u-dev' }, 'u-own')).status).toBe(403)
  })

  it('reset password langsung: password berubah, sesi lama dicabut, audit tanpa password', async () => {
    const r = await post('/users/reset-password', { uid: 'u-log', password: 'baru-rahasia-9' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(be.auth.get('u-log')).toMatchObject({ password: 'baru-rahasia-9' })
    expect(be.auth.get('u-log')!.validSince).toBeTruthy()
    expect(lastAudit('user.reset_password')).toMatchObject({ actorUid: 'u-pm1', targetId: 'u-log' })
    expect(JSON.stringify(audits())).not.toContain('baru-rahasia-9')
    expect((await post('/users/reset-password', { uid: 'u-pm2', password: 'abcdef' }, 'u-pm1')).status).toBe(403)
    expect((await post('/users/reset-password', { uid: 'u-log', password: '123' }, 'u-pm1')).status).toBe(400)
  })

  it('bila perubahan password di Auth gagal, tercatat entri pembatalan (tidak ada perubahan tanpa jejak)', async () => {
    be.failAuthUpdate = true
    const r = await post('/users/reset-password', { uid: 'u-log', password: 'abcdef12' }, 'u-pm1')
    expect(r.status).toBe(500)
    expect(be.auth.get('u-log')!.password).toBe('pw-awal-123')
    expect(lastAudit('user.reset_password_failed')).toBeTruthy()
  })
})

describe('role', () => {
  it('membuat role baru: level di bawah pelaku, izin subset, level dan nama unik', async () => {
    const ok = await post('/roles/create', { name: 'Supervisor', level: 40, perms: ['dashboard', 'users'] }, 'u-own')
    expect(ok.status).toBe(200)
    expect(be.getData(`roles/${ok.body.id}`)).toMatchObject({ name: 'Supervisor', level: 40, system: false })
    expect(lastAudit('role.create')).toBeTruthy()
    expect((await post('/roles/create', { name: 'X', level: 90, perms: [] }, 'u-own')).status).toBe(403) // setara
    expect((await post('/roles/create', { name: 'X', level: 95, perms: [] }, 'u-own')).status).toBe(403) // di atas
    expect((await post('/roles/create', { name: 'X', level: 40, perms: [] }, 'u-own')).status).toBe(409) // level kembar
    expect((await post('/roles/create', { name: 'supervisor', level: 41, perms: [] }, 'u-own')).status).toBe(409) // nama kembar
    expect((await post('/roles/create', { name: 'X', level: 41, perms: ['sudo'] }, 'u-own')).status).toBe(400) // izin tak dikenal
    expect((await post('/roles/create', { name: 'X', level: 4.5, perms: [] }, 'u-own')).status).toBe(400)
    expect((await post('/roles/create', { name: 'X', level: 41, perms: [] }, 'u-pm1')).status).toBe(403) // tanpa izin roles
  })

  it('pemegang izin roles tidak bisa memberi izin yang tidak dimilikinya', async () => {
    // Role "Admin Sistem" hanya berizin roles + users + dashboard
    const r = await post('/roles/create', { name: 'Admin Sistem', level: 60, perms: ['roles', 'users', 'dashboard'] }, 'u-own')
    await seedUser('u-adm', 'adm', r.body.id as string)
    expect((await post('/roles/create', { name: 'Y', level: 30, perms: ['audit'] }, 'u-adm')).status).toBe(403)
    expect((await post('/roles/create', { name: 'Y', level: 30, perms: ['users'] }, 'u-adm')).status).toBe(200)
    expect((await post('/roles/create', { name: 'Z', level: 60, perms: [] }, 'u-adm')).status).toBe(403) // setara
  })

  it('mengubah izin: hanya role di bawah pelaku, hanya izin yang dimiliki pelaku, role sistem terkunci', async () => {
    const add = await post('/roles/update', { id: 'pm', perms: [...(roleDocs.find((r) => r.id === 'pm')!.perms), 'catalog'] }, 'u-dir')
    expect(add.status).toBe(200)
    expect(be.getData('roles/pm')!.perms).toContain('catalog')
    expect(lastAudit('role.update')!.detail).toMatchObject({ izinBerubah: ['catalog'] })

    expect((await post('/roles/update', { id: 'dev', name: 'x' }, 'u-own')).status).toBe(403) // sistem
    expect((await post('/roles/update', { id: 'owner', name: 'x' }, 'u-dir')).status).toBe(403) // di atas
    expect((await post('/roles/update', { id: 'dir', name: 'x' }, 'u-dir')).status).toBe(403) // setara

    const r = await post('/roles/create', { name: 'Admin Sistem', level: 60, perms: ['roles', 'users', 'dashboard'] }, 'u-own')
    await seedUser('u-adm', 'adm', r.body.id as string)
    // log memiliki ['dashboard','inventory.read','inventory.write','export']; menambah 'audit' (tidak dimiliki Admin Sistem) ditolak
    const logPerms = roleDocs.find((x) => x.id === 'log')!.perms
    expect((await post('/roles/update', { id: 'log', perms: [...logPerms, 'audit'] }, 'u-adm')).status).toBe(403)
    // mencabut izin yang tidak dimiliki pelaku juga ditolak ('export' tidak dimiliki Admin Sistem)
    expect((await post('/roles/update', { id: 'log', perms: logPerms.filter((p) => p !== 'export') }, 'u-adm')).status).toBe(403)
  })

  it('level role tidak bisa diubah (level akun terdenormalisasi tetap sinkron)', async () => {
    await post('/roles/update', { id: 'pm', level: 70 }, 'u-dir')
    expect(be.getData('roles/pm')!.level).toBe(50)
  })

  it('menghapus role: ditolak bila masih dipakai atau role sistem; berhasil bila kosong', async () => {
    expect((await post('/roles/delete', { id: 'pm' }, 'u-dir')).status).toBe(409)
    expect((await post('/roles/delete', { id: 'dev' }, 'u-own')).status).toBe(403)
    const r = await post('/roles/create', { name: 'Sementara', level: 30, perms: [] }, 'u-own')
    expect((await post('/roles/delete', { id: r.body.id }, 'u-own')).status).toBe(200)
    expect(be.getData(`roles/${r.body.id}`)).toBeUndefined()
    expect(lastAudit('role.delete')).toBeTruthy()
  })
})

describe('permintaan reset password (publik)', () => {
  const demo = () => makeEnv(sa, { USE_EMULATOR: 'true', FIREBASE_PROJECT_ID: 'demo-wkn' })
  const req = (username: string, token = 'XXXX.DUMMY.TOKEN', e: Env = env, ip = '1.2.3.4') =>
    worker.fetch(
      new Request('https://api.test/auth/reset-request', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip }, body: JSON.stringify({ username, turnstileToken: token }) }),
      e,
    ).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }))

  const withTurnstile = () => makeEnv(sa, { TURNSTILE_SECRET: 'rahasia-turnstile' })

  it('akun ada: permintaan dibuat dengan level pemohon; jawaban seragam', async () => {
    const r = await req('LOG1', 'token-ok', withTurnstile())
    expect(r).toEqual({ status: 200, body: { ok: true } })
    const rr = be.list('resetRequests')
    expect(rr).toHaveLength(1)
    expect(rr[0].data).toMatchObject({ targetUid: 'u-log', requesterLevel: 20, status: 'pending' })
    expect(typeof rr[0].data.requestedAt).toBe('string')
    expect(lastAudit('reset.request')).toMatchObject({ actorUid: 'u-log' })
  })

  it('jawaban sama untuk akun tidak ada, Developer, dan permintaan ganda (tanpa enumerasi, tanpa duplikat)', async () => {
    const e = withTurnstile()
    const a = await req('tidak-ada-sama-sekali', 't', e)
    const b = await req('dev1', 't', e)
    const c = await req('pm1', 't', e)
    const d = await req('pm1', 't', e)
    for (const r of [a, b, c, d]) expect(r).toEqual({ status: 200, body: { ok: true } })
    expect(be.list('resetRequests')).toHaveLength(1)
  })

  it('akun nonaktif tidak menghasilkan permintaan', async () => {
    be.getData('users/u-log')!.disabled = true
    await req('log1', 't', withTurnstile())
    expect(be.list('resetRequests')).toHaveLength(0)
  })

  it('produksi tanpa TURNSTILE_SECRET gagal tertutup, dan token palsu emulator tidak berlaku di produksi', async () => {
    expect((await req('log1', 'XXXX.DUMMY.TOKEN', env)).status).toBe(503)
    expect((await req('log1', 'XXXX.DUMMY.TOKEN', makeEnv(sa, { USE_EMULATOR: 'true' }))).status).toBe(503) // proyek bukan demo-
    expect(be.list('resetRequests')).toHaveLength(0)
  })

  it('token dummy hanya diterima pada mode emulator proyek demo-', async () => {
    await expect(verifyTurnstile('XXXX.DUMMY.TOKEN', null, demo())).resolves.toBeUndefined()
    await expect(verifyTurnstile('XXXX.DUMMY.TOKEN', null, env)).rejects.toThrow()
    await expect(verifyTurnstile('lain', null, demo())).rejects.toThrow() // tanpa rahasia -> tertutup
  })

  it('verifikasi Turnstile: gagal, hostname salah, dan sukses', async () => {
    const e = withTurnstile()
    be.turnstile = { success: false, hostname: 'wkngroup-datahub.web.app' }
    expect((await req('log1', 't', e)).status).toBe(403)
    be.turnstile = { success: true, hostname: 'jahat.example' }
    expect((await req('log1', 't', e)).status).toBe(403)
    be.turnstile = { success: true, hostname: 'wkngroup-datahub.web.app' }
    expect((await req('log1', 't', e)).status).toBe(200)
  })

  it('pembatas laju per IP menolak setelah batas; gangguan KV tidak menggagalkan permintaan', async () => {
    const store = new Map<string, string>()
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) }
    const e = makeEnv(sa, { TURNSTILE_SECRET: 's', RATE: kv })
    for (let i = 0; i < 10; i++) expect((await req('tidak-ada', 't', e, '9.9.9.9')).status).toBe(200)
    expect((await req('tidak-ada', 't', e, '9.9.9.9')).status).toBe(429)
    expect((await req('tidak-ada', 't', e, '8.8.8.8')).status).toBe(200) // IP lain tidak terdampak
    const broken = { get: async () => { throw new Error('KV down') }, put: async () => { throw new Error('KV down') } }
    expect((await req('tidak-ada', 't', makeEnv(sa, { TURNSTILE_SECRET: 's', RATE: broken }))).status).toBe(200)
  })
})

describe('eksekusi permintaan reset', () => {
  async function makeRequest(username: string) {
    await worker.fetch(
      new Request('https://api.test/auth/reset-request', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify({ username, turnstileToken: 't' }) }),
      makeEnv(sa, { TURNSTILE_SECRET: 's' }),
    )
    return be.list('resetRequests').find((r) => r.data.targetUsername === username && r.data.status === 'pending')!.id
  }

  it('atasan mengeksekusi: password berubah, sesi dicabut, pelaku dan waktu tercatat', async () => {
    const id = await makeRequest('log1')
    const r = await post('/resets/execute', { id, password: 'password-baru' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(be.auth.get('u-log')).toMatchObject({ password: 'password-baru' })
    expect(be.auth.get('u-log')!.validSince).toBeTruthy()
    const doc = be.getData(`resetRequests/${id}`)!
    expect(doc).toMatchObject({ status: 'done', handledBy: 'u-pm1', handledByName: 'Nama pm1', handledByRole: 'Manajer Proyek' })
    expect(typeof doc.handledAt).toBe('string')
    expect(lastAudit('user.reset_password')).toMatchObject({ actorUid: 'u-pm1', targetId: 'u-log' })
    expect(JSON.stringify(audits())).not.toContain('password-baru')
  })

  it('hanya role yang berlevel di atas pemohon dan berizin resets', async () => {
    const id = await makeRequest('pm2')
    expect((await post('/resets/execute', { id, password: 'abcdef' }, 'u-pm1')).status).toBe(403) // setara
    expect((await post('/resets/execute', { id, password: 'abcdef' }, 'u-log')).status).toBe(403) // di bawah dan tanpa izin
    expect((await post('/resets/execute', { id, password: 'abcdef' }, 'u-dir')).status).toBe(200) // di atas
  })

  it('permintaan yang sudah ditangani tidak bisa dieksekusi lagi', async () => {
    const id = await makeRequest('log1')
    await post('/resets/execute', { id, password: 'abcdef' }, 'u-pm1')
    const again = await post('/resets/execute', { id, password: 'ghijkl' }, 'u-dir')
    expect(again.status).toBe(409)
    expect(again.body.error).toBe('already_handled')
    expect(be.auth.get('u-log')!.password).toBe('abcdef')
  })

  it('dua atasan menekan bersamaan: hanya satu yang berhasil (klaim dengan prasyarat)', async () => {
    const id = await makeRequest('log1')
    const [a, b] = await Promise.all([post('/resets/execute', { id, password: 'milik-pm1' }, 'u-pm1'), post('/resets/execute', { id, password: 'milik-dir' }, 'u-dir')])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const winner = a.status === 200 ? 'milik-pm1' : 'milik-dir'
    expect(be.auth.get('u-log')!.password).toBe(winner)
    expect(audits().filter((x) => x.action === 'user.reset_password')).toHaveLength(1)
  })

  it('bila Auth gagal: klaim dikembalikan ke pending dan dicatat pembatalan', async () => {
    const id = await makeRequest('log1')
    be.failAuthUpdate = true
    const r = await post('/resets/execute', { id, password: 'abcdef' }, 'u-pm1')
    expect(r.status).toBe(500)
    expect(be.getData(`resetRequests/${id}`)).toMatchObject({ status: 'pending', handledBy: null })
    expect(lastAudit('user.reset_password_failed')).toBeTruthy()
    be.failAuthUpdate = false
    expect((await post('/resets/execute', { id, password: 'abcdef' }, 'u-pm1')).status).toBe(200)
  })

  it('reset langsung menutup permintaan yang menunggu untuk akun itu', async () => {
    const id = await makeRequest('log1')
    await post('/users/reset-password', { uid: 'u-log', password: 'abcdef' }, 'u-pm1')
    expect(be.getData(`resetRequests/${id}`)).toMatchObject({ status: 'done', handledBy: 'u-pm1' })
  })
})
