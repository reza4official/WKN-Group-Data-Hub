const FMT = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

type TimestampLike = { toDate: () => Date }

/**
 * Waktu catatan ditampilkan dengan zona tetap (WITA), bukan jam perangkat penonton, agar catatan
 * audit konsisten di mana pun dibuka.
 */
export function formatWita(value: unknown): string {
  let d: Date | null = null
  if (value instanceof Date) d = value
  else if (typeof value === 'string') d = new Date(value)
  else if (value && typeof (value as TimestampLike).toDate === 'function')
    d = (value as TimestampLike).toDate()
  if (!d || Number.isNaN(d.getTime())) return '—'
  // Susun dari bagian-bagiannya agar format tetap stabil di semua browser (tanpa koma/titik pemisah bawaan).
  const p = Object.fromEntries(FMT.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day} ${p.month} ${p.year} ${p.hour}:${p.minute}:${p.second} WITA`
}

export function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return new Date(value).getTime() || 0
  if (value && typeof (value as TimestampLike).toDate === 'function')
    return (value as TimestampLike).toDate().getTime()
  return 0
}

/** Tanggal hari ini menurut WITA (YYYY-MM-DD), sama dengan yang dipakai Worker untuk validasi tanggal. */
export function todayWita(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}
