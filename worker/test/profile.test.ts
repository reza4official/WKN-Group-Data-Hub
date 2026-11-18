import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { useWorld } from './world'

const w = useWorld()
const user = (uid: string) => w.be.getData(`users/${uid}`)!

async function postWith(token: string, path: string, body: unknown) {
  const r = await worker.fetch(
    new Request(`https://api.test${path}`, { method: 'POST', headers: { Origin: 'https://wkngroup-datahub.web.app', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
    w.env,
  )
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}

describe('/profile/update', () => {
  it('mengubah nama, HP, email sendiri; pengubah = diri sendiri; audit sebelum/sesudah', async () => {
    const r = await w.post('/profile/update', { name: ' Budi Baru ', phone: '0812', emailContact: 'Budi@Contoh.com' }, 'u-pm1')
    expect(r.status).toBe(200)
    expect(r.body.changed).toEqual(['name', 'phone', 'emailContact'])
    expect(user('u-pm1')).toMatchObject({ name: 'Budi Baru', phone: '0812', emailContact: 'budi@contoh.com', updatedBy: 'u-pm1', updatedByName: 'Nama pm1' })
    expect(typeof user('u-pm1').updatedAt).toBe('string')
    const a = w.lastAudit('profile.update')!
    expect(a).toMatchObject({ actorUid: 'u-pm1', targetId: 'u-pm1' })
    expect(a.detail).toMatchObject({ before: { name: 'Nama pm1' }, after: { name: 'Budi Baru', phone: '0812' } })
  })

  it('role, level, proyek, status, username tidak bisa diubah lewat rute ini', async () => {
    const before = { ...user('u-pm1') }
    const r = await w.post('/profile/update', { name: 'X', roleId: 'dev', level: 100, projectIds: ['p2'], disabled: true, username: 'hack', perms: ['roles'] }, 'u-pm1')
    expect(r.status).toBe(200)
    const u = user('u-pm1')
    expect(u).toMatchObject({ roleId: before.roleId, level: before.level, projectIds: before.projectIds, disabled: false, username: before.username })
    expect(u.name).toBe('X')
  })

  it('tanpa perubahan: tidak menulis dan tidak mengaudit', async () => {
    const n = w.audits().length
    const r = await w.post('/profile/update', { name: user('u-pm1').name, phone: '', emailContact: user('u-pm1').emailContact }, 'u-pm1')
    expect(r.body.changed).toEqual([])
    expect(w.audits().length).toBe(n)
  })

  it('email: format salah, sudah dipakai akun lain, boleh dikosongkan, milik sendiri boleh', async () => {
    expect((await w.post('/profile/update', { emailContact: 'bukan-email' }, 'u-pm1')).status).toBe(400)
    const taken = await w.post('/profile/update', { emailContact: String(user('u-pm2').emailContact) }, 'u-pm1')
    expect(taken.status).toBe(409)
    expect(taken.body.error).toBe('email_taken')
    expect((await w.post('/profile/update', { emailContact: String(user('u-pm1').emailContact).toUpperCase() }, 'u-pm1')).status).toBe(200)
    expect((await w.post('/profile/update', { emailContact: '' }, 'u-pm1')).status).toBe(200)
    expect(user('u-pm1').emailContact).toBe('')
  })

  it('validasi nama dan HP', async () => {
    expect((await w.post('/profile/update', { name: '   ' }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/profile/update', { name: 'x'.repeat(121) }, 'u-pm1')).status).toBe(400)
    expect((await w.post('/profile/update', { phone: '1'.repeat(41) }, 'u-pm1')).status).toBe(400)
  })

  it('hanya akun sendiri: tanpa token 401, akun nonaktif 403; tidak ada cara menyunting orang lain', async () => {
    expect((await w.post('/profile/update', { name: 'x' })).status).toBe(401)
    user('u-pm1').disabled = true
    expect((await w.post('/profile/update', { name: 'x' }, 'u-pm1')).status).toBe(403)
    user('u-pm1').disabled = false
    await w.post('/profile/update', { uid: 'u-log', name: 'Diserobot' }, 'u-pm1')
    expect(user('u-log').name).toBe('Nama log1')
  })

  it('semua role boleh mengubah profilnya sendiri (tanpa izin khusus)', async () => {
    expect((await w.post('/profile/update', { phone: '1' }, 'u-log')).status).toBe(200)
  })
})

describe('/profile/change-password', () => {
  const uid = 'u-pm1'

  it('token segar dari login password: password berubah, audit tercatat tanpa password', async () => {
    const r = await w.post('/profile/change-password', { newPassword: 'rahasia-baru' }, uid)
    expect(r.status).toBe(200)
    expect(w.be.auth.get(uid)!.password).toBe('rahasia-baru')
    expect(w.lastAudit('profile.change_password')).toMatchObject({ actorUid: uid, targetId: uid })
    expect(JSON.stringify(w.audits())).not.toContain('rahasia-baru')
    expect(w.be.auth.get(uid)!.validSince).toBeUndefined() // sesi tidak dicabut
  })

  it('tanpa bukti password lama: token lama, penyedia bukan password, atau milik akun lain ditolak', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600
    expect((await postWith(w.be.idToken(uid, { auth_time: old, iat: old }), '/profile/change-password', { newPassword: 'abcdef' })).body.error).toBe('reauth_required')
    expect((await postWith(w.be.idToken(uid, { firebase: { sign_in_provider: 'custom' } }), '/profile/change-password', { newPassword: 'abcdef' })).body.error).toBe('reauth_required')
    expect((await postWith(w.be.idToken(uid, { firebase: { sign_in_provider: 'google.com' } }), '/profile/change-password', { newPassword: 'abcdef' })).status).toBe(403)
    expect(w.be.auth.get(uid)!.password).toBe('pw-awal-123')
  })

  it('password baru minimal 6 karakter dan wajib; tanpa token 401', async () => {
    expect((await w.post('/profile/change-password', { newPassword: '12345' }, uid)).status).toBe(400)
    expect((await w.post('/profile/change-password', {}, uid)).status).toBe(400)
    expect((await w.post('/profile/change-password', { newPassword: 'abcdef' })).status).toBe(401)
  })

  it('gagal di Auth: dicatat entri pembatalan dan galat dikembalikan', async () => {
    w.be.failAuthUpdate = true
    const r = await w.post('/profile/change-password', { newPassword: 'abcdef' }, uid)
    expect(r.status).toBe(500)
    expect(w.lastAudit('profile.change_password_failed')).toBeTruthy()
    expect(w.be.auth.get(uid)!.password).toBe('pw-awal-123')
  })
})
