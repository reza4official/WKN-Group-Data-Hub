export type Theme = 'light' | 'dark'

const KEY = 'wkn-theme'

/** Tema yang sedang berlaku: pilihan tersimpan, atau mengikuti sistem. */
export function effectiveTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme')
  if (set === 'dark' || set === 'light') return set
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* penyimpanan dapat diblokir; tema tetap berlaku untuk sesi ini */
  }
}
