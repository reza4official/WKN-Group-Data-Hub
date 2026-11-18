import { describe, expect, it } from 'vitest'
import { ROUTES } from '../layout/routes'
import { PERMISSION_KEYS, PERMISSION_LABELS } from './permissions'

describe('izin', () => {
  it('menu Proyek & Perusahaan terbuka bagi pemegang inventory.read (proyek yang ditugaskan)', () => {
    const r = ROUTES.find((x) => x.id === 'projects')!
    expect(r.perm).toEqual(['projects', 'inventory.read'])
  })
  it('setiap izin memiliki label, dan tidak ada label yatim', () => {
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSION_KEYS].sort())
  })
  it('semua izin yang dipakai menu ada di daftar izin bersama', () => {
    for (const r of ROUTES) for (const p of r.perm ?? []) expect(PERMISSION_KEYS).toContain(p)
  })
})
