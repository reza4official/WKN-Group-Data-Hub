import { describe, expect, it } from 'vitest'
import { formatWita, toMillis } from './time'

describe('waktu WITA', () => {
  it('memakai zona Asia/Makassar apa pun zona perangkat', () => {
    expect(formatWita(new Date('2026-11-17T06:30:05Z'))).toBe('17 Nov 2026 14:30:05 WITA')
    expect(formatWita('2026-11-17T16:00:00Z')).toBe('18 Nov 2026 00:00:00 WITA') // melewati tengah malam
  })
  it('menerima objek mirip Timestamp Firestore dan nilai kosong', () => {
    expect(formatWita({ toDate: () => new Date('2026-01-02T00:00:00Z') })).toBe('2 Jan 2026 08:00:00 WITA')
    expect(formatWita(undefined)).toBe('—')
    expect(formatWita('bukan tanggal')).toBe('—')
    expect(toMillis({ toDate: () => new Date(5) })).toBe(5)
  })
})
