import { listCatalog, listMonths, listProjectItems, type Project } from './data'
import { mergeByItem, prevYm, summarizeItem, type DashItem, type DashRow } from './dashboard'

export interface DashboardData {
  rows: DashRow[]
  perProject: Map<string, DashRow[]>
  items: Map<string, DashItem[]>
}

/**
 * Memuat ringkasan dashboard: katalog + per proyek dokumen barang dan paling banyak 2 total bulanan per barang
 * (bulan ini dan lalu). Tidak membaca transaksi mentah.
 */
export async function loadDashboard(scoped: Project[], ym: string, today: string): Promise<DashboardData> {
  const catalog = await listCatalog()
  const cat = new Map(catalog.map((c) => [c.id, c]))
  const perProject = new Map<string, DashRow[]>()
  const items = new Map<string, DashItem[]>()
  for (const p of scoped) {
    const raw = await listProjectItems(p.id)
    const dash: DashItem[] = raw.map((it) => {
      const c = cat.get(it.id)
      return {
        id: it.id,
        projectId: p.id,
        name: c?.name ?? it.id,
        unit: c?.unit ?? '',
        category: c?.category ?? '',
        openingQty: it.openingQty,
        openingDate: it.openingDate,
        currentStock: it.currentStock ?? 0,
        minStock: it.minStock,
        lastTxDate: it.lastTxDate,
        txCount: it.txCount,
        active: it.active,
      }
    })
    items.set(p.id, dash)
    const eligible = dash.filter(
      (d) => d.active && d.openingQty !== null && d.openingDate !== null && d.openingDate.slice(0, 7) <= ym,
    )
    const months = await Promise.all(eligible.map((d) => listMonths(p.id, d.id, prevYm(ym))))
    const rows: DashRow[] = []
    eligible.forEach((d, i) => {
      const r = summarizeItem(d, months[i], ym, today)
      if (r) rows.push(r)
    })
    perProject.set(p.id, rows)
  }
  return { rows: mergeByItem([...perProject.values()].flat()), perProject, items }
}

/**
 * Cache dalam memori untuk pemuatan dashboard: satu muat membaca ratusan dokumen (katalog + barang + total bulanan per proyek),
 * sedangkan kuota baca gratis hanya 50.000 per hari untuk SEMUA pengguna (lihat uji beban di docs/TAHAP-9-PENERAPAN.md).
 * Berlaku per tab, 5 menit, dan dikosongkan saat pengguna sendiri mencatat transaksi atau menekan "Segarkan".
 */
export const DASHBOARD_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: Promise<DashboardData> }>()

export function clearDashboardCache(): void {
  cache.clear()
}

export function loadDashboardCached(
  scoped: Project[],
  ym: string,
  today: string,
  force = false,
  now: number = Date.now(),
): Promise<DashboardData> {
  const key = `${scoped
    .map((p) => p.id)
    .sort()
    .join(',')}|${ym}|${today}`
  const hit = cache.get(key)
  if (!force && hit && now - hit.at < DASHBOARD_TTL_MS) return hit.data
  const data = loadDashboard(scoped, ym, today)
  cache.set(key, { at: now, data })
  // Muat yang gagal tidak boleh tersimpan.
  data.catch(() => cache.get(key)?.data === data && cache.delete(key))
  return data
}
