import { useEffect, useRef } from 'react'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Gagal memuat verifikasi bot'))
    }
    document.head.append(s)
  })
  return loading
}

/** Widget Cloudflare Turnstile. Memanggil onToken saat lolos, dan onToken('') saat kedaluwarsa atau gagal. */
export function Turnstile({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string
  onToken: (t: string) => void
  onError: (m: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const cb = useRef({ onToken, onError })
  useEffect(() => {
    cb.current = { onToken, onError }
  })

  useEffect(() => {
    let id: string | undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (t) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onToken(''),
          'error-callback': () => {
            cb.current.onToken('')
            cb.current.onError('Verifikasi bot gagal dimuat. Muat ulang halaman.')
          },
        })
      })
      .catch((e: unknown) =>
        cb.current.onError(e instanceof Error ? e.message : 'Verifikasi bot gagal dimuat.'),
      )
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [siteKey])

  return <div ref={box} style={{ minHeight: 65 }} />
}
