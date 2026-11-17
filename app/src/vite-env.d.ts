/// <reference types="vite/client" />

/** Versi aplikasi dari package.json, disuntikkan oleh vite.config.ts saat build. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_USE_EMULATOR?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_API_URL?: string
}
