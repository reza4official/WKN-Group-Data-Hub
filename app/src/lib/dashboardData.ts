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
