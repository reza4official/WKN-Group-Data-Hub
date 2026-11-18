const show = (v: unknown): string =>
  v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')

/** Ringkasan rincian untuk dibaca manusia. Tidak pernah memuat password. */
export function summarize(detail: Record<string, unknown>): string {
  const parts: string[] = []
  const { before, after, izinBerubah, ...rest } = detail as {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    izinBerubah?: string[]
  }
  if (before && after)
    for (const k of Object.keys(after)) parts.push(`${k}: ${show(before[k])} → ${show(after[k])}`)
  if (Array.isArray(izinBerubah)) parts.push(`izin berubah: ${izinBerubah.join(', ')}`)
  for (const [k, v] of Object.entries(rest)) parts.push(`${k}: ${show(v)}`)
  return parts.join(' · ') || '—'
}
