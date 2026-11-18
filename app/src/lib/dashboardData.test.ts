import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ listCatalog: vi.fn(), listMonths: vi.fn(), listProjectItems: vi.fn() }))
vi.mock('./data', () => m)
import type { Project } from './data'
import { clearDashboardCache, DASHBOARD_TTL_MS, loadDashboardCached } from './dashboardData'

const P = (id: string): Project => ({
  id,
  companyId: 'c',
  name: id,
  location: '',
  status: 'berjalan' as const,
  startDate: null,
  active: true,
  deleting: false,
})

beforeEach(() => {
  vi.clearAllMocks()
  clearDashboardCache()
  m.listCatalog.mockResolvedValue([])
  m.listProjectItems.mockResolvedValue([])
  m.listMonths.mockResolvedValue([])
})

describe('cache dashboard', () => {
  it('pemuatan kedua dalam 5 menit tidak membaca lagi; setelah itu membaca lagi', async () => {
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18', false, 1000)
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18', false, 1000 + DASHBOARD_TTL_MS - 1)
    expect(m.listCatalog).toHaveBeenCalledTimes(1)
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18', false, 1000 + DASHBOARD_TTL_MS)
    expect(m.listCatalog).toHaveBeenCalledTimes(2)
  })
  it('kunci memisahkan proyek, bulan, dan hari; urutan proyek tidak berpengaruh', async () => {
    await loadDashboardCached([P('a'), P('b')], '2026-11', '2026-11-18')
    await loadDashboardCached([P('b'), P('a')], '2026-11', '2026-11-18')
    expect(m.listCatalog).toHaveBeenCalledTimes(1)
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18')
    await loadDashboardCached([P('a'), P('b')], '2026-10', '2026-11-18')
    await loadDashboardCached([P('a'), P('b')], '2026-11', '2026-11-19')
    expect(m.listCatalog).toHaveBeenCalledTimes(4)
  })
  it('force dan clear melewati cache', async () => {
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18')
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18', true)
    expect(m.listCatalog).toHaveBeenCalledTimes(2)
    clearDashboardCache()
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18')
    expect(m.listCatalog).toHaveBeenCalledTimes(3)
  })
  it('muat yang gagal tidak tersimpan: percobaan berikutnya membaca lagi', async () => {
    m.listCatalog.mockRejectedValueOnce(new Error('jaringan'))
    await expect(loadDashboardCached([P('a')], '2026-11', '2026-11-18')).rejects.toThrow('jaringan')
    await Promise.resolve()
    await loadDashboardCached([P('a')], '2026-11', '2026-11-18')
    expect(m.listCatalog).toHaveBeenCalledTimes(2)
  })
})
