import { describe, expect, it } from 'vitest'
import { buildGuide, inline, permissionRows, type Ctx } from './guide'
import { PERMISSION_KEYS } from './permissions'
import { ROUTES } from '../layout/routes'
import shots from './guideShots.json'

const ctx = (perms: string[], level = 50): Ctx => ({ perms: new Set(perms), level, projectIds: ['p1'], roleName: 'Uji' })
const ids = (c: Ctx) => buildGuide(c).available.map((s) => s.id)

describe('panduan dinamis', () => {
  it('role penuh melihat lebih banyak bagian daripada role rendah, dan sisanya masuk "tidak tersedia"', () => {
    const low = buildGuide(ctx(['dashboard']))
    const all = buildGuide(ctx([...PERMISSION_KEYS], 100))
    expect(all.available.length).toBeGreaterThan(low.available.length)
    expect(low.unavailable.length).toBeGreaterThan(0)
    expect(all.unavailable.length).toBe(0)
    for (const s of low.unavailable) expect(s.askWho.length).toBeGreaterThan(0)
  })
  it('perubahan izin mengubah isi panduan', () => {
    const before = ids(ctx(['dashboard']))
    const after = ids(ctx(['dashboard', 'roles']))
    expect(before).not.toContain('role')
    expect(after).toContain('role')
  })
  it('baris izin mencakup semua kunci izin dan mencerminkan kepemilikan', () => {
    const rows = permissionRows(ctx(['dashboard']))
    expect(rows.map((r) => r.key).sort()).toEqual([...PERMISSION_KEYS].sort())
    expect(rows.find((r) => r.key === 'dashboard')!.granted).toBe(true)
    expect(rows.find((r) => r.key === 'roles')!.granted).toBe(false)
  })
  it('setiap rute ber-izin punya bagian panduan', () => {
    const all = buildGuide(ctx([...PERMISSION_KEYS], 100)).available
    for (const r of ROUTES.filter((x) => x.id !== 'panduan')) expect(all.some((s) => s.route === r.id), r.id).toBe(true)
  })
  it('gambar yang dirujuk bagian panduan ada di guideShots.json', () => {
    for (const s of buildGuide(ctx([...PERMISSION_KEYS], 100)).available) for (const k of s.shots ?? []) expect(k in shots, k).toBe(true)
  })
  it('inline mengurai tebal dan kode', () => {
    expect(inline('a **b** `c`').map((p) => p.k)).toEqual(['txt', 'b', 'txt', 'code'])
  })
})
