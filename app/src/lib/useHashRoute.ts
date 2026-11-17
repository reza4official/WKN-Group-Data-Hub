import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Mengembalikan nama rute dari location.hash tanpa tanda #. */
export function useHashRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.replace(/^#\/?/, ''),
    () => '',
  )
}
