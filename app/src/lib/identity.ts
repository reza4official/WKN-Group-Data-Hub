/**
 * Penurunan identitas dari username. HARUS identik dengan scripts/bootstrap-developer.mjs
 * (dijaga oleh vektor uji bersama di identity.test.ts).
 *
 * Username bebas (spasi, simbol, Unicode). Firebase Authentication butuh email, jadi username
 * diubah menjadi hash SHA-256 (64 karakter hex, tepat di batas 64 karakter bagian lokal email).
 * Hash yang sama dipakai sebagai kunci dokumen `usernames/{hash}` yang aman dari karakter terlarang
 * seperti "/" atau "..".
 */
export const SYNTHETIC_DOMAIN = 'users.wkngroup.invalid'

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase().normalize('NFC')
}

export async function usernameDigest(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUsername(raw))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function syntheticEmail(raw: string): Promise<string> {
  return `${await usernameDigest(raw)}@${SYNTHETIC_DOMAIN}`
}
