import { describe, expect, it } from 'vitest'
import { normalizeUsername, syntheticEmail, usernameDigest } from './identity'

// Vektor yang sama dipakai scripts/bootstrap-developer.mjs. Jangan diubah tanpa mengubah skrip itu.
const VECTORS: [string, string, string][] = [
  ['  Reza4Official_ ', 'reza4official_', '3ac12b9ebcb8be7da85219f3759ea8a4331ac48748618c766b3b19416b9b0d59'],
  ['Ünal ŞİMŞEK', 'ünal şi̇mşek', 'ef38fc57201118457261e4a68325638faae56ee6cb0fd7e0915db6aacfdb68f1'],
  ['budi santoso', 'budi santoso', 'a156fd968bb44c9b6dd79a9a8e159efdcd86c112d1479399c0a610b31d779c9b'],
  ['a/b..c__x__', 'a/b..c__x__', 'dec3331dc2dbd2c823ee89ec21737bdf51bd4ff9172e4e2b9a3b6c56fae05479'],
]

describe('identitas username', () => {
  it.each(VECTORS)('vektor %j', async (input, normalized, digest) => {
    expect(normalizeUsername(input)).toBe(normalized)
    expect(await usernameDigest(input)).toBe(digest)
  })

  it('huruf besar/kecil dan spasi tepi tidak membedakan akun', async () => {
    expect(await usernameDigest('  BUDI Santoso ')).toBe(await usernameDigest('budi santoso'))
  })

  it('email sintetis memenuhi batas 64 karakter bagian lokal', async () => {
    const e = await syntheticEmail('x'.repeat(500))
    expect(e.split('@')[0]).toHaveLength(64)
    expect(e.endsWith('@users.wkngroup.invalid')).toBe(true)
  })

  it('username aneh tidak menghasilkan karakter terlarang untuk kunci dokumen', async () => {
    expect(await usernameDigest('a/b..c__x__')).toMatch(/^[0-9a-f]{64}$/)
  })
})
