import { describe, expect, it } from 'vitest'
import type { UsageStatus } from './data'
import { quotaItems, worstLevel } from './quota'

const U = (over: Partial<UsageStatus> = {}): UsageStatus => ({
  status: 'ok',
  at: null,
  windowStart: null,
  reads: 0,
  writes: 0,
  deletes: 0,
  limits: { reads: 50000, writes: 20000, deletes: 20000 },
  reason: '',
  ...over,
})

describe('kuota', () => {
  it('persentase dan tingkat per kuota (80% peringatan, 95% kritis)', () => {
    const i = quotaItems(U({ reads: 40000, writes: 19000, deletes: 100 }))
    expect(i.map((x) => [x.key, Math.round(x.pct), x.level])).toEqual([
      ['reads', 80, 'warn'],
      ['writes', 95, 'bad'],
      ['deletes', 1, 'ok'],
    ])
  })
  it('batas tepat: 79,9% aman, 80% peringatan, 94,9% peringatan, 95% kritis', () => {
    expect(quotaItems(U({ reads: 39950 }))[0].level).toBe('ok')
    expect(quotaItems(U({ reads: 40000 }))[0].level).toBe('warn')
    expect(quotaItems(U({ reads: 47450 }))[0].level).toBe('warn')
    expect(quotaItems(U({ reads: 47500 }))[0].level).toBe('bad')
  })
  it('tingkat terburuk; data tidak tersedia tidak menimbulkan peringatan palsu', () => {
    expect(worstLevel(U({ reads: 45000 })).level).toBe('warn')
    expect(worstLevel(U({ reads: 45000, writes: 20000 })).level).toBe('bad')
    expect(worstLevel(U({ status: 'unavailable', reads: 99999 })).level).toBe('ok')
    expect(worstLevel(undefined).items).toEqual([])
  })
  it('batas nol tidak membagi dengan nol', () => {
    expect(quotaItems(U({ reads: 5, limits: { reads: 0, writes: 1, deletes: 1 } }))[0].pct).toBe(0)
  })
})
