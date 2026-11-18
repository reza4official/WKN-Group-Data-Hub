import { describe, expect, it } from 'vitest'
import { summarize } from './auditSummary'

describe('ringkasan rincian audit', () => {
  it('perubahan sebelum/sesudah, izin berubah, dan nilai lain', () => {
    expect(summarize({ before: { name: 'A' }, after: { name: 'B' } })).toBe('name: A → B')
    expect(summarize({ izinBerubah: ['catalog', 'audit'] })).toBe('izin berubah: catalog, audit')
    expect(summarize({ via: 'langsung' })).toBe('via: langsung')
    expect(summarize({})).toBe('—')
  })
})
