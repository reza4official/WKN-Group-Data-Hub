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
    const ALL = ['dashboard', 'users', 'roles', 'resets', 'audit', 'employees', 'projects', 'catalog', 'inventory.read']
    await setDoc(doc(db, 'roles/dev'), { name: 'Developer', level: 100, perms: ALL })
    await setDoc(doc(db, 'roles/owner'), { name: 'Owner', level: 90, perms: ALL })
    await setDoc(doc(db, 'roles/pm'), { name: 'Manajer Proyek', level: 50, perms: ['dashboard', 'users', 'resets', 'inventory.read'] })
    await setDoc(doc(db, 'roles/log'), { name: 'Admin Logistik', level: 20, perms: ['dashboard'] })
    await setDoc(doc(db, 'users/dev'), { username: 'dev', disabled: false, roleId: 'dev', level: 100 })
    await setDoc(doc(db, 'users/andi'), { username: 'andi', disabled: false, roleId: 'owner', level: 90, projectIds: [] })
    await setDoc(doc(db, 'users/pm1'), { username: 'pm1', disabled: false, roleId: 'pm', level: 50, projectIds: ['p1', 'p2'] })
    await setDoc(doc(db, 'users/pm2'), { username: 'pm2', disabled: false, roleId: 'pm', level: 50, projectIds: ['p3'] })
    await setDoc(doc(db, 'users/log1'), { username: 'log1', disabled: false, roleId: 'log', level: 20, projectIds: ['p1'] })
    await setDoc(doc(db, 'users/log2'), { username: 'log2', disabled: false, roleId: 'log', level: 20, projectIds: ['p3'] })
    await setDoc(doc(db, 'users/log3'), { username: 'log3', disabled: false, roleId: 'log', level: 20, projectIds: [] })
    await setDoc(doc(db, 'users/off'), { username: 'off', disabled: true, roleId: 'owner', level: 90 })
    await setDoc(doc(db, 'usernames/abc'), { uid: 'dev' })
    await setDoc(doc(db, 'resetRequests/r1'), { targetUid: 'log1', requesterLevel: 20, status: 'pending', targetProjectIds: ['p1'] })
    await setDoc(doc(db, 'resetRequests/r2'), { targetUid: 'pm2', requesterLevel: 50, status: 'pending', targetProjectIds: ['p3'] })
    await setDoc(doc(db, 'resetRequests/r3'), { targetUid: 'log2', requesterLevel: 20, status: 'pending', targetProjectIds: ['p3'] })
    await setDoc(doc(db, 'auditLog/a1'), { action: 'user.create', actorUid: 'andi' })
    await setDoc(doc(db, 'companies/c1'), { name: 'PT. WKN', type: 'induk', active: true })
    await setDoc(doc(db, 'catalog/i1'), { name: 'Semen', unit: 'Sak', active: true })
    await setDoc(doc(db, 'projects/p1'), { name: 'Proyek 1', companyId: 'c1' })
    await setDoc(doc(db, 'projects/p2'), { name: 'Proyek 2', companyId: 'c1' })
    await setDoc(doc(db, 'projects/p3'), { name: 'Proyek 3', companyId: 'c1' })
    await setDoc(doc(db, 'projects/p1/items/i1'), { name: 'Semen', openingQty: 100 })
    await setDoc(doc(db, 'projects/p3/items/i1'), { name: 'Semen', openingQty: 50 })
    await setDoc(doc(db, 'projects/p1/ledger/e1'), { itemId: 'i1', date: '2026-09-10', in: 5, out: 0 })
    await setDoc(doc(db, 'projects/p3/ledger/e1'), { itemId: 'i1', date: '2026-09-10', in: 5, out: 0 })
    await setDoc(doc(db, 'projects/p1/items/i1/months/2026-09'), { in: 5, out: 0 })
    await setDoc(doc(db, 'projects/p1/items/i1/days/2026-09-10'), { date: '2026-09-10', in: 5, out: 0 })
    await setDoc(doc(db, 'webauthnCredentials/cred1'), { uid: 'pm1', credentialId: 'x', jwk: { kty: 'EC' } })
    await setDoc(doc(db, 'webauthnCredentials/cred2'), { uid: 'andi', credentialId: 'y', jwk: { kty: 'EC' } })
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
  it('Database Karyawan: pemegang izin employees membaca semua akun, termasuk atasan dan tanpa lingkup proyek', async () => {
    await assertSucceeds(getDoc(doc(as('andi'), 'users/dev'))) // level 100, tetapi andi punya izin employees
    await assertSucceeds(getDoc(doc(as('andi'), 'users/pm1')))
    await assertSucceeds(getDocs(collection(as('andi'), 'users')))
    await assertSucceeds(getDocs(collection(as('dev'), 'users')))
  })
  it('izin users saja (tanpa employees) tidak cukup: Manajer Proyek dan Admin Logistik tidak bisa membuka database karyawan', async () => {
    await assertFails(getDocs(collection(as('pm1'), 'users')))
    await assertFails(getDoc(doc(as('pm1'), 'users/andi')))
    await assertFails(getDocs(collection(as('log1'), 'users')))
    await assertFails(getDoc(doc(as('off'), 'users/dev'))) // akun nonaktif
  })
  it('profil tetap tidak bisa ditulis klien (data diri hanya lewat Worker)', async () => {
    await assertFails(updateDoc(doc(as('pm1'), 'users/pm1'), { name: 'Baru' }))
    await assertFails(updateDoc(doc(as('andi'), 'users/pm1'), { phone: '1' }))
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

describe('daftar akun menurut level dan lingkup proyek (kueri harus memuat batasnya)', () => {
  const U = (db, ...c) => query(collection(db, 'users'), ...c)

  it('pelaku berlingkup proyek: kueri level + array-contains-any proyek sendiri diterima', async () => {
    const db = as('pm1')
    await assertSucceeds(getDocs(U(db, where('level', '<', 50), where('projectIds', 'array-contains-any', ['p1', 'p2']))))
    await assertSucceeds(getDocs(U(db, where('level', '<', 50), where('projectIds', 'array-contains-any', ['p1']))))
  })
  it('kueri tanpa batas proyek, atau dengan proyek milik orang lain, ditolak', async () => {
    const db = as('pm1')
    await assertFails(getDocs(U(db, where('level', '<', 50)))) // tanpa lingkup proyek
    await assertFails(getDocs(U(db, where('level', '<', 50), where('projectIds', 'array-contains-any', ['p3'])))) // proyek orang lain
    await assertFails(getDocs(U(db, where('level', '<', 50), where('projectIds', 'array-contains-any', ['p1', 'p3'])))) // sebagian milik orang lain
    await assertFails(getDocs(U(db, where('projectIds', 'array-contains-any', ['p1'])))) // tanpa batas level
    await assertFails(getDocs(U(db, where('level', '<', 100), where('projectIds', 'array-contains-any', ['p1'])))) // mengintip atasan
    await assertFails(getDocs(collection(db, 'users')))
  })
  it('get per dokumen: hanya bawahan yang berbagi proyek', async () => {
    const db = as('pm1')
    await assertSucceeds(getDoc(doc(db, 'users/log1'))) // p1
    await assertFails(getDoc(doc(db, 'users/log2'))) // p3 bukan proyek pm1
    await assertFails(getDoc(doc(db, 'users/log3'))) // tanpa proyek
    await assertFails(getDoc(doc(db, 'users/pm2'))) // setara
    await assertFails(getDoc(doc(db, 'users/andi'))) // atasan
  })
  it('pemegang izin projects (Owner) mendaftar tanpa batas proyek', async () => {
    const db = as('andi')
    await assertSucceeds(getDocs(U(db, where('level', '<', 90))))
    // (Owner juga memegang izin employees, sehingga batas level tidak lagi menghalangi bacaan penuh; lihat uji Database Karyawan)
    await assertSucceeds(getDoc(doc(db, 'users/log3')))
  })
  it('Admin Logistik (tanpa izin users) tidak dapat mendaftar siapa pun', async () => {
    await assertFails(getDocs(U(as('log1'), where('level', '<', 20), where('projectIds', 'array-contains-any', ['p1']))))
  })
})

describe('permintaan reset', () => {
  const R = (db, ...c) => query(collection(db, 'resetRequests'), ...c)
  it('berlingkup proyek: hanya permintaan dari proyek sendiri dan level di bawahnya', async () => {
    const db = as('pm1')
    await assertSucceeds(getDocs(R(db, where('requesterLevel', '<', 50), where('targetProjectIds', 'array-contains-any', ['p1']))))
    await assertFails(getDocs(R(db, where('requesterLevel', '<', 50)))) // tanpa lingkup proyek
    await assertFails(getDocs(R(db, where('requesterLevel', '<', 50), where('targetProjectIds', 'array-contains-any', ['p3'])))) // proyek lain
    await assertFails(getDoc(doc(db, 'resetRequests/r2'))) // setara
    await assertFails(getDoc(doc(db, 'resetRequests/r3'))) // proyek lain
    await assertSucceeds(getDoc(doc(db, 'resetRequests/r1')))
  })
  it('Owner (izin projects) membaca semua yang di bawah levelnya; Admin Logistik tidak', async () => {
    await assertSucceeds(getDocs(R(as('andi'), where('requesterLevel', '<', 90))))
    await assertFails(getDocs(R(as('log1'), where('requesterLevel', '<', 20))))
  })
  it('tidak boleh menulis atau mengubah status dari klien', async () => {
    await assertFails(updateDoc(doc(as('pm1'), 'resetRequests/r1'), { status: 'done' }))
    await assertFails(setDoc(doc(as('log1'), 'resetRequests/baru'), { targetUid: 'log1', requesterLevel: 20, status: 'pending' }))
    await assertFails(deleteDoc(doc(as('pm1'), 'resetRequests/r1')))
  })
})

describe('perusahaan, katalog, proyek, barang proyek', () => {
  it('perusahaan dan katalog terbaca akun aktif, bukan anonim; tidak ada yang menulis', async () => {
    await assertSucceeds(getDocs(collection(as('log1'), 'companies')))
    await assertSucceeds(getDocs(collection(as('log1'), 'catalog')))
    await assertFails(getDocs(collection(anon(), 'catalog')))
    await assertFails(setDoc(doc(as('andi'), 'catalog/baru'), { name: 'x' }))
    await assertFails(updateDoc(doc(as('andi'), 'companies/c1'), { name: 'x' }))
    await assertFails(getDoc(doc(as('off'), 'catalog/i1'))) // nonaktif
  })
  it('proyek: pemegang izin projects membaca semua; akun lain hanya yang ditugaskan', async () => {
    await assertSucceeds(getDocs(collection(as('andi'), 'projects')))
    await assertSucceeds(getDoc(doc(as('pm1'), 'projects/p1')))
    await assertSucceeds(getDoc(doc(as('pm1'), 'projects/p2')))
    await assertFails(getDoc(doc(as('pm1'), 'projects/p3'))) // bukan proyeknya
    await assertFails(getDocs(collection(as('pm1'), 'projects'))) // daftar penuh hanya untuk izin projects
    await assertFails(getDoc(doc(as('log3'), 'projects/p1'))) // tanpa penugasan
    await assertFails(getDoc(doc(anon(), 'projects/p1')))
    await assertFails(setDoc(doc(as('andi'), 'projects/baru'), { name: 'x' }))
  })
  it('barang proyek: hanya bagi yang ditugaskan dan berizin inventory.read (atau projects)', async () => {
    await assertSucceeds(getDocs(collection(as('pm1'), 'projects/p1/items')))
    await assertFails(getDocs(collection(as('pm1'), 'projects/p3/items'))) // proyek lain
    await assertFails(getDocs(collection(as('log1'), 'projects/p1/items'))) // log tanpa inventory.read pada seed ini
    await assertSucceeds(getDocs(collection(as('andi'), 'projects/p3/items')))
    await assertFails(setDoc(doc(as('andi'), 'projects/p1/items/i9'), { name: 'x' }))
    await assertFails(updateDoc(doc(as('pm1'), 'projects/p1/items/i1'), { openingQty: 999 }))
    // buku transaksi dan total bulanan: sama lingkupnya dengan barang; tidak bisa ditulis klien; days tertutup
    await assertSucceeds(getDocs(collection(as('pm1'), 'projects/p1/ledger')))
    await assertFails(getDocs(collection(as('pm1'), 'projects/p3/ledger')))
    await assertFails(getDocs(collection(as('log1'), 'projects/p1/ledger')))
    await assertSucceeds(getDocs(collection(as('andi'), 'projects/p3/ledger')))
    await assertSucceeds(getDocs(collection(as('pm1'), 'projects/p1/items/i1/months')))
    await assertSucceeds(getDocs(collection(as('pm1'), 'projects/p1/items/i1/days')))
    await assertFails(getDocs(collection(as('log1'), 'projects/p1/items/i1/days')))
    await assertFails(getDocs(collection(as('pm2'), 'projects/p1/items/i1/days')))
    await assertFails(setDoc(doc(as('andi'), 'projects/p1/items/i1/days/2026-09-11'), { in: 1 }))
    await assertFails(setDoc(doc(as('andi'), 'projects/p1/ledger/e2'), { in: 1 }))
    await assertFails(updateDoc(doc(as('andi'), 'projects/p1/ledger/e1'), { in: 99 }))
    await assertFails(setDoc(doc(as('andi'), 'projects/p1/items/i1/months/2026-09'), { in: 1 }))
  })
})

describe('passkey (login biometrik)', () => {
  it('pemilik membaca perangkatnya sendiri; tidak boleh melihat milik orang lain atau menulis', async () => {
    await assertSucceeds(getDocs(query(collection(as('pm1'), 'webauthnCredentials'), where('uid', '==', 'pm1'))))
    await assertFails(getDocs(query(collection(as('pm1'), 'webauthnCredentials'), where('uid', '==', 'andi'))))
    await assertFails(getDoc(doc(as('pm1'), 'webauthnCredentials/cred2')))
    await assertFails(getDocs(collection(as('pm1'), 'webauthnCredentials')))
    await assertFails(setDoc(doc(as('pm1'), 'webauthnCredentials/baru'), { uid: 'pm1' }))
    await assertFails(deleteDoc(doc(as('pm1'), 'webauthnCredentials/cred1')))
    await assertFails(getDocs(query(collection(anon(), 'webauthnCredentials'), where('uid', '==', 'pm1'))))
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
