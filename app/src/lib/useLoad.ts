import { useCallback, useEffect, useState } from 'react'

type State<T> = { key: string; data?: T; error?: string }

/**
 * Memuat data satu kali (tanpa listener langsung, hemat kuota baca) dan dapat dimuat ulang manual.
 * `deps` yang berubah memicu muat ulang.
 */
export function useLoad<T>(
  fn: () => Promise<T>,
  depKey: string,
): { data?: T; error?: string; loading: boolean; reload: () => void } {
  const [version, setVersion] = useState(0)
  const key = `${depKey}#${version}`
  const [state, setState] = useState<State<T>>({ key: '' })

  useEffect(() => {
    let cancelled = false
    fn()
      .then((data) => !cancelled && setState({ key, data }))
      .catch(
        (e: unknown) =>
          !cancelled && setState({ key, error: e instanceof Error ? e.message : 'Gagal memuat data.' }),
      )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const loading = state.key !== key
  return { data: state.data, error: loading ? undefined : state.error, loading, reload }
}
