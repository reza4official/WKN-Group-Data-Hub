import type { Env } from '../env'
import { queryDocuments, type Write } from './firestore'
import type { ServiceAccount } from './serviceAccount'

/** Penghapusan semua passkey milik akun (dipakai saat reset password dan hapus akun). */
export async function credentialDeletes(env: Env, sa: ServiceAccount, uid: string): Promise<Write[]> {
  const found = await queryDocuments(env, sa, 'webauthnCredentials', [{ field: 'uid', op: 'EQUAL', value: uid }], 50)
  return found.map((d) => ({ path: `webauthnCredentials/${d.id}`, delete: true }))
}
