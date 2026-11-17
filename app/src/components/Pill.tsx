import type { ReactNode } from 'react'

export type PillTone = 'ok' | 'warn' | 'bad' | 'mute' | 'blue'

export function Pill({ tone = 'mute', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}
