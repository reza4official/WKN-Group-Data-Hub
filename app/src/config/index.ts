import pub from './public-config.json'

const env = import.meta.env

/** Mode emulator Firebase (hanya pengujian lokal; tidak pernah dipakai di produksi). */
export const useEmulator = env.VITE_USE_EMULATOR === 'true'

export const config = {
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY || pub.firebase.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || pub.firebase.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || pub.firebase.projectId,
    appId: env.VITE_FIREBASE_APP_ID || pub.firebase.appId,
  },
  apiUrl: (env.VITE_API_URL || pub.apiUrl).replace(/\/+$/, ''),
}

/** Benar bila masih ada nilai placeholder. Build produksi menolak kondisi ini (lihat vite.config.ts). */
export const configMissing = JSON.stringify(config).includes('GANTI')
