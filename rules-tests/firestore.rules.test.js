import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
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
    await setDoc(doc(db, 'users/dev'), { username: 'dev', disabled: false, roleId: 'dev' })
    await setDoc(doc(db, 'users/andi'), { username: 'andi', disabled: false, roleId: 'owner' })
    await setDoc(doc(db, 'users/off'), { username: 'off', disabled: true, roleId: 'log' })
    await setDoc(doc(db, 'roles/dev'), { name: 'Developer', level: 100 })
    await setDoc(doc(db, 'usernames/abc'), { uid: 'dev' })
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
  it('tidak boleh membaca profil orang lain atau daftar akun', async () => {
    await assertFails(getDoc(doc(as('andi'), 'users/dev')))
    await assertFails(getDocs(collection(as('andi'), 'users')))
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

describe('akun dinonaktifkan', () => {
  it('masih boleh membaca profil sendiri (untuk menampilkan pesan) tetapi tidak role', async () => {
    await assertSucceeds(getDoc(doc(as('off'), 'users/off')))
    await assertFails(getDoc(doc(as('off'), 'roles/dev')))
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
