import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wkn',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const ALL = ['dashboard', 'users', 'roles', 'resets', 'audit', 'employees']
    await setDoc(doc(db, 'roles/dev'), { name: 'Developer', level: 100, perms: ALL })
    await setDoc(doc(db, 'roles/owner'), { name: 'Owner', level: 90, perms: ALL })
    await setDoc(doc(db, 'roles/pm'), { name: 'Manajer Proyek', level: 50, perms: ['dashboard', 'users', 'resets'] })
    await setDoc(doc(db, 'roles/log'), { name: 'Admin Logistik', level: 20, perms: ['dashboard'] })
    await setDoc(doc(db, 'users/dev'), { username: 'dev', disabled: false, roleId: 'dev', level: 100 })
    await setDoc(doc(db, 'users/andi'), { username: 'andi', disabled: false, roleId: 'owner', level: 90 })
    await setDoc(doc(db, 'users/pm1'), { username: 'pm1', disabled: false, roleId: 'pm', level: 50 })
    await setDoc(doc(db, 'users/pm2'), { username: 'pm2', disabled: false, roleId: 'pm', level: 50 })
    await setDoc(doc(db, 'users/log1'), { username: 'log1', disabled: false, roleId: 'log', level: 20 })
    await setDoc(doc(db, 'users/off'), { username: 'off', disabled: true, roleId: 'owner', level: 90 })
    await setDoc(doc(db, 'usernames/abc'), { uid: 'dev' })
    await setDoc(doc(db, 'resetRequests/r1'), { targetUid: 'log1', requesterLevel: 20, status: 'pending' })
    await setDoc(doc(db, 'resetRequests/r2'), { targetUid: 'pm2', requesterLevel: 50, status: 'pending' })
    await setDoc(doc(db, 'auditLog/a1'), { action: 'user.create', actorUid: 'andi' })
  })
})

const as = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('tanpa login', () => {
  it('semua ditolak', async () => {
    await assertFails(getDoc(doc(anon(), 'users/dev')))
    await assertFails(getDoc(doc(anon(), 'roles/dev')))
    await assertFails(getDocs(collection(anon(), 'users')))
    await assertFails(getDoc(doc(anon(), 'usernames/abc')))
  })
})

describe('akun terdaftar dan aktif', () => {
  it('boleh membaca profil sendiri dan daftar role', async () => {
    await assertSucceeds(getDoc(doc(as('andi'), 'users/andi')))
    await assertSucceeds(getDoc(doc(as('andi'), 'roles/dev')))
    await assertSucceeds(getDocs(collection(as('andi'), 'roles')))
  })
  it('pemilik izin users tidak boleh membaca akun setara/di atasnya, tetapi boleh yang di bawahnya', async () => {
    await assertFails(getDoc(doc(as('andi'), 'users/dev'))) // level 100 >= 90
    await assertSucceeds(getDoc(doc(as('andi'), 'users/pm1')))
  })
  it('tidak boleh menulis apa pun, termasuk mengubah role atau menaikkan haknya sendiri', async () => {
    const db = as('andi')
    await assertFails(updateDoc(doc(db, 'users/andi'), { roleId: 'dev' }))
    await assertFails(setDoc(doc(db, 'users/baru'), { username: 'baru' }))
    await assertFails(deleteDoc(doc(db, 'users/andi')))
    await assertFails(setDoc(doc(db, 'roles/dev'), { level: 1 }))
    await assertFails(setDoc(doc(db, 'usernames/xyz'), { uid: 'andi' }))
    await assertFails(setDoc(doc(db, 'auditLog/1'), { x: 1 }))
  })
  it('tidak boleh membaca koleksi tak dikenal', async () => {
    await assertFails(getDoc(doc(as('andi'), 'usernames/abc')))
    await assertFails(getDoc(doc(as('andi'), 'rahasia/x')))
  })
})

describe('daftar akun menurut level (kueri harus memuat batas level)', () => {
  it('Manajer Proyek hanya dapat mendaftar akun berlevel di bawahnya', async () => {
    const db = as('pm1')
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('level', '<', 50))))
    await assertFails(getDocs(query(collection(db, 'users'), where('level', '<', 100)))) // mencoba melihat atasan
    await assertFails(getDocs(query(collection(db, 'users'), where('level', '<=', 50)))) // termasuk yang setara
    await assertFails(getDocs(collection(db, 'users'))) // tanpa batas
    await assertFails(getDoc(doc(db, 'users/pm2'))) // setara
    await assertFails(getDoc(doc(db, 'users/andi'))) // atasan
    await assertSucceeds(getDoc(doc(db, 'users/log1')))
  })
  it('Admin Logistik (tanpa izin users) tidak dapat mendaftar siapa pun', async () => {
    await assertFails(getDocs(query(collection(as('log1'), 'users'), where('level', '<', 20))))
  })
  it('Owner dapat mendaftar akun di bawah 90, bukan Developer', async () => {
    await assertSucceeds(getDocs(query(collection(as('andi'), 'users'), where('level', '<', 90))))
    await assertFails(getDocs(query(collection(as('andi'), 'users'), where('level', '<', 101))))
  })
})

describe('permintaan reset', () => {
  it('hanya role di atas pemohon dengan izin resets yang boleh membaca', async () => {
    await assertSucceeds(getDocs(query(collection(as('pm1'), 'resetRequests'), where('requesterLevel', '<', 50))))
    await assertFails(getDocs(query(collection(as('pm1'), 'resetRequests'), where('requesterLevel', '<', 100)))) // permintaan pm2 (setara)
    await assertFails(getDoc(doc(as('pm1'), 'resetRequests/r2')))
    await assertSucceeds(getDoc(doc(as('pm1'), 'resetRequests/r1')))
    await assertSucceeds(getDocs(query(collection(as('andi'), 'resetRequests'), where('requesterLevel', '<', 90))))
    await assertFails(getDocs(query(collection(as('log1'), 'resetRequests'), where('requesterLevel', '<', 20))))
  })
  it('tidak boleh menulis atau mengubah status dari klien', async () => {
    await assertFails(updateDoc(doc(as('pm1'), 'resetRequests/r1'), { status: 'done' }))
    await assertFails(setDoc(doc(as('log1'), 'resetRequests/baru'), { targetUid: 'log1', requesterLevel: 20, status: 'pending' }))
    await assertFails(deleteDoc(doc(as('pm1'), 'resetRequests/r1')))
  })
})

describe('log audit', () => {
  it('hanya pemegang izin audit yang membaca; tidak ada yang menulis, mengubah, atau menghapus', async () => {
    await assertSucceeds(getDocs(query(collection(as('andi'), 'auditLog'), orderBy('action'), limit(10))))
    await assertFails(getDocs(collection(as('pm1'), 'auditLog')))
    await assertFails(getDoc(doc(as('log1'), 'auditLog/a1')))
    await assertFails(getDocs(collection(anon(), 'auditLog')))
    for (const uid of ['andi', 'dev', 'pm1']) {
      await assertFails(setDoc(doc(as(uid), 'auditLog/baru'), { action: 'palsu' }))
      await assertFails(updateDoc(doc(as(uid), 'auditLog/a1'), { action: 'diubah' }))
      await assertFails(deleteDoc(doc(as(uid), 'auditLog/a1')))
    }
  })
})

describe('akun dinonaktifkan', () => {
  it('masih boleh membaca profil sendiri (untuk menampilkan pesan) tetapi tidak role', async () => {
    await assertSucceeds(getDoc(doc(as('off'), 'users/off')))
    await assertFails(getDoc(doc(as('off'), 'roles/dev')))
    await assertFails(getDocs(query(collection(as('off'), 'auditLog'), limit(5)))) // izin owner tidak berlaku saat nonaktif
  })
})

describe('akun Google sementara (belum terdaftar)', () => {
  it('tidak mendapat akses apa pun', async () => {
    const db = as('stray-google-uid')
    await assertFails(getDoc(doc(db, 'roles/dev')))
    await assertFails(getDocs(collection(db, 'roles')))
    await assertFails(getDoc(doc(db, 'users/dev')))
    await assertFails(setDoc(doc(db, 'users/stray-google-uid'), { username: 'x', disabled: false }))
  })
})
