/**
 * Penurunan identitas dari username. HARUS identik dengan app/src/lib/identity.ts dan
 * scripts/bootstrap-developer.mjs (dijaga vektor uji bersama).
 */
export const SYNTHETIC_DOMAIN = 'users.wkngroup.invalid'

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase().normalize('NFC')
}

export async function usernameDigest(raw: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeUsername(raw)))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function syntheticEmail(raw: string): Promise<string> {
  return `${await usernameDigest(raw)}@${SYNTHETIC_DOMAIN}`
}
