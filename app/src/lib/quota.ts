import type { UsageStatus } from './data'

export type QuotaLevel = 'ok' | 'warn' | 'bad'
export interface QuotaItem {
  key: 'reads' | 'writes' | 'deletes'
  label: string
  used: number
  limit: number
  pct: number
  level: QuotaLevel
}
export const WARN_AT = 80
export const BAD_AT = 95

const levelOf = (pct: number): QuotaLevel => (pct >= BAD_AT ? 'bad' : pct >= WARN_AT ? 'warn' : 'ok')

export function quotaItems(u: Pick<UsageStatus, 'reads' | 'writes' | 'deletes' | 'limits'>): QuotaItem[] {
  const mk = (key: QuotaItem['key'], label: string): QuotaItem => {
    const used = u[key]
    const limit = u.limits[key]
    const pct = limit > 0 ? (used / limit) * 100 : 0
    return { key, label, used, limit, pct, level: levelOf(pct) }
  }
  return [mk('reads', 'Baca dokumen'), mk('writes', 'Tulis dokumen'), mk('deletes', 'Hapus dokumen')]
}

/** Tingkat terburuk di antara ketiga kuota; hanya data yang tersedia yang dinilai. */
export function worstLevel(u: UsageStatus | undefined): { level: QuotaLevel; items: QuotaItem[] } {
  if (!u || u.status !== 'ok') return { level: 'ok', items: [] }
  const items = quotaItems(u)
  const level = items.some((i) => i.level === 'bad')
    ? 'bad'
    : items.some((i) => i.level === 'warn')
      ? 'warn'
      : 'ok'
  return { level, items }
}
