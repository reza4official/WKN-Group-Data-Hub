/** Bagian KVNamespace yang dipakai Worker. */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

export interface Env {
  /** ID proyek Firebase, mis. wkngroup-datahub. */
  FIREBASE_PROJECT_ID: string
  /** Daftar origin yang boleh memanggil API, dipisah koma. */
  ALLOWED_ORIGINS: string
  /** Isi berkas JSON service account (secret, jangan masuk repo). */
  FIREBASE_SERVICE_ACCOUNT: string
  /**
   * Hanya untuk pengujian lokal dengan emulator. Berlaku HANYA bila bernilai "true"
   * dan FIREBASE_PROJECT_ID diawali "demo-". Di produksi jangan diisi.
   */
  /** Rahasia Turnstile (secret). Tanpa ini, permintaan reset password dari halaman login ditolak (gagal tertutup). */
  TURNSTILE_SECRET?: string
  /** Namespace KV untuk pembatas laju (opsional; gangguan KV tidak boleh menggagalkan permintaan). */
  RATE?: KvLike
  /** URL web app Google Apps Script untuk cermin cadangan ke Google Sheets (secret; opsional). */
  BACKUP_WEBHOOK_URL?: string
  /** Rahasia bersama dengan Apps Script (secret; opsional). Tanpa keduanya, cadangan berstatus belum dikonfigurasi. */
  BACKUP_SECRET?: string
  USE_EMULATOR?: string
  FIRESTORE_EMULATOR_HOST?: string
  AUTH_EMULATOR_HOST?: string
}

export function emulatorEnabled(env: Env): boolean {
  return env.USE_EMULATOR === 'true' && env.FIREBASE_PROJECT_ID.startsWith('demo-')
}

export interface Endpoints {
  tokenUrl: string
  jwksUrl: string
  firestoreDocs: string
  identityAdmin: string
}

export function endpoints(env: Env): Endpoints {
  const p = env.FIREBASE_PROJECT_ID
  if (emulatorEnabled(env)) {
    const fs = env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
    const au = env.AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
    return {
      tokenUrl: 'http://invalid.local/token',
      jwksUrl: 'http://invalid.local/jwks',
      firestoreDocs: `http://${fs}/v1/projects/${p}/databases/(default)/documents`,
      identityAdmin: `http://${au}/identitytoolkit.googleapis.com/v1/projects/${p}`,
    }
  }
  return {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    firestoreDocs: `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`,
    identityAdmin: `https://identitytoolkit.googleapis.com/v1/projects/${p}`,
  }
}
