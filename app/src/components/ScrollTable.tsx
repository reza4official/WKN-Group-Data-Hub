import type { ReactNode } from 'react'

/** Pembungkus tabel lebar: dapat digeser, dengan bayangan di tepi sebagai penanda. */
export function ScrollTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="tw" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
