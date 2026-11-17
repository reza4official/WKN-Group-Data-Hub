import { readFileSync } from 'node:fs'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

/**
 * Build produksi harus gagal dengan jelas bila konfigurasi Firebase/Worker belum diisi, agar versi
 * yang sedang berjalan tidak tergantikan oleh halaman login yang tidak bisa dipakai.
 */
function requireConfig(mode: string): Plugin {
  return {
    name: 'wkn-require-config',
    apply: 'build',
    buildStart() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      if (env.VITE_USE_EMULATOR === 'true') return
      const pub = JSON.parse(
        readFileSync(new URL('./src/config/public-config.json', import.meta.url), 'utf-8'),
      ) as {
        firebase: Record<string, string>
        apiUrl: string
      }
      const values = [
        env.VITE_FIREBASE_API_KEY || pub.firebase.apiKey,
        env.VITE_FIREBASE_APP_ID || pub.firebase.appId,
        env.VITE_FIREBASE_PROJECT_ID || pub.firebase.projectId,
        env.VITE_FIREBASE_AUTH_DOMAIN || pub.firebase.authDomain,
        env.VITE_API_URL || pub.apiUrl,
      ]
      if (values.some((v) => !v || v.includes('GANTI'))) {
        this.error(
          'Konfigurasi belum lengkap: masih ada nilai "GANTI" di app/src/config/public-config.json. ' +
            'Isi apiKey, appId, dan apiUrl (lihat docs/PERSIAPAN-TAHAP-2.md) sebelum build produksi.',
        )
      }
    },
  }
}

// Versi aplikasi (vX.X.X) memiliki satu sumber: package.json. Disuntikkan saat build.
export default defineConfig(({ mode }) => ({
  plugins: [react(), requireConfig(mode)],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
}))
