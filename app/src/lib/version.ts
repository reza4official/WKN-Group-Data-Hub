/** Versi aplikasi berformat vX.X.X (major.minor.patch). */
export const APP_VERSION = `v${__APP_VERSION__}`

export const COMPANY = 'PT. Wiratama Karya Nugraha'

/** Teks footer sesuai ketentuan pemilik. */
export function footerText(version: string = APP_VERSION): string {
  return `© Copyright 2026 | ${COMPANY} | Dibuat di Makassar | @reza4official_ | ${version}`
}
