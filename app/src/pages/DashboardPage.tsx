import { useMemo, useState } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { MonthBars, StockLine } from '../components/charts'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { Pill, type PillTone } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { listCatalog, listDays, listMonths, listProjectItems, listProjects, type Project } from '../lib/data'
import {
  addDays,
  compareProjects,
  kpis,
  mergeByItem,
  monthlyBars,
  prevYm,
  sortRows,
  stockSeries,
  summarizeItem,
  type DashItem,
  type DashRow,
  type SortKey,
} from '../lib/dashboard'
import { todayWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'

const fmt = (n: number | null, d = 3) =>
  n === null ? '—' : n.toLocaleString('id-ID', { maximumFractionDigits: d })
const MON = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]
const ymLabel = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
const TONE: Record<DashRow['status'], PillTone> = { ok: 'ok', warn: 'warn', bad: 'bad', mute: 'mute' }

function Delta({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="delta na">baru</span>
  if (Math.abs(v) < 0.5) return <span className="delta na">≈ sama</span>
  // Untuk keluar, naik = merah (pemakaian bertambah); untuk masuk sebaliknya.
  const up = v > 0
  const cls = up !== !!invert ? 'up' : 'dn'
  return (
    <span className={`delta ${cls}`}>
      {up ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%
    </span>
  )
}

interface Loaded {
  rows: DashRow[]
  perProject: Map<string, DashRow[]>
  items: Map<string, DashItem[]>
}

export function DashboardPage() {
  const { state } = useAuth()
  const perms = state.status === 'in' ? state.perms : new Set<string>()
  const mine = useMemo(() => (state.status === 'in' ? state.profile.projectIds : []), [state])
  const seeAll = perms.has('projects')
  const today = todayWita()

  const projects = useLoad(() => listProjects(seeAll, mine), `dash-projects:${seeAll}:${mine.join(',')}`)
  const [scope, setScope] = useState('')
  const [ym, setYm] = useState(today.slice(0, 7))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 })
  const [open, setOpen] = useState<DashRow | null>(null)

  const list = (projects.data ?? []).filter((p) => p.active)
  const choice = scope || (list.length > 1 ? 'all' : (list[0]?.id ?? ''))
  const scoped: Project[] = choice === 'all' ? list : list.filter((p) => p.id === choice)

  const data = useLoad<Loaded>(
    async () => {
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
        // Hanya total bulan ini dan bulan lalu per barang yang dibaca (bukan transaksi mentah).
        const eligible = dash.filter(
          (d) =>
            d.active && d.openingQty !== null && d.openingDate !== null && d.openingDate.slice(0, 7) <= ym,
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
    },
    `dash:${scoped.map((p) => p.id).join(',')}:${ym}`,
  )

  const all = data.data?.rows ?? []
  const k = kpis(all)
  const needle = q.trim().toLowerCase()
  const shown = sortRows(
    all.filter((r) => !needle || `${r.name} ${r.category}`.toLowerCase().includes(needle)),
    sort.key,
    sort.dir,
  )
  const top = [...all]
    .filter((r) => r.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6)
  const attention = all.filter((r) => r.status !== 'ok')
  const projName = (id: string) => list.find((p) => p.id === id)?.name ?? id
  const compare =
    data.data && choice === 'all' && scoped.length > 1 ? compareProjects(data.data.perProject) : []

  const th = (key: SortKey, label: string, right?: boolean) => (
    <th
      className={`s${right ? ' r' : ''}`}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )

  if (projects.loading && !projects.data)
    return (
      <Card flush>
        <EmptyState icon="dash" title="Memuat…" />
      </Card>
    )
  if (projects.error)
    return (
      <Card flush>
        <EmptyState icon="alert" title="Proyek tidak dapat dimuat">
          {projects.error}
        </EmptyState>
      </Card>
    )
  if (list.length === 0)
    return (
      <Card flush>
        <EmptyState icon="build" title="Belum ada proyek aktif">
          {seeAll
            ? 'Buat proyek dan isi saldo awal barangnya terlebih dulu.'
            : 'Anda belum ditugaskan ke proyek mana pun. Minta atasan menugaskan Anda ke proyek.'}
        </EmptyState>
      </Card>
    )

  return (
    <>
      <Card
        title="Dashboard"
        subtitle={`${ymLabel(ym)}${ym === today.slice(0, 7) ? ` · sampai ${Number(today.slice(8, 10))} ${MON[Number(today.slice(5, 7)) - 1]}` : ''} · dihitung dari total bulanan, sudah memperhitungkan koreksi`}
        actions={
          <div className="tools">
            <select
              id="dash-scope"
              className="sel"
              aria-label="Proyek"
              value={choice}
              onChange={(e) => setScope(e.target.value)}
            >
              {list.length > 1 && <option value="all">Semua proyek ({list.length})</option>}
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              id="dash-month"
              className="in"
              type="month"
              aria-label="Bulan"
              value={ym}
              max={today.slice(0, 7)}
              onChange={(e) =>
                /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                e.target.value <= today.slice(0, 7) &&
                setYm(e.target.value)
              }
              style={{ width: 'auto' }}
            />
          </div>
        }
      />

      {data.error ? (
        <Card flush>
          <EmptyState icon="alert" title="Dashboard tidak dapat dimuat">
            {data.error}
          </EmptyState>
        </Card>
      ) : data.loading || !data.data ? (
        <Card flush>
          <EmptyState icon="dash" title="Memuat…" />
        </Card>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="l">
                <span className="ic">
                  <Icon name="box" />
                </span>
                Jenis barang aktif
              </div>
              <div className="v num">{k.items}</div>
              <div className="d">{scoped.length} proyek dalam tampilan</div>
            </div>
            <div className="kpi">
              <div className="l">
                <span className="ic y">
                  <Icon name="swap" />
                </span>
                Transaksi {MON[Number(ym.slice(5, 7)) - 1]}
              </div>
              <div className="v num">{k.tx}</div>
              <div className="d">masuk + keluar, tidak termasuk saldo awal</div>
            </div>
            <div className="kpi">
              <div className="l">
                <span className="ic bad">
                  <Icon name="alert" />
                </span>
                Stok kritis
              </div>
              <div className="v num" style={{ color: k.kritis ? 'var(--bad)' : undefined }}>
                {k.kritis}
              </div>
              <div className="d">sisa di bawah atau sama dengan batas minimum</div>
            </div>
            <div className="kpi">
              <div className="l">
                <span className="ic y">
                  <Icon name="clock" />
                </span>
                Tidak bergerak
              </div>
              <div className="v num">{k.idle}</div>
              <div className="d">tanpa transaksi 14 hari atau lebih (bulan berjalan)</div>
            </div>
          </div>

          <Card
            title={`Ringkasan per barang · ${ymLabel(ym)}`}
            subtitle="Perbandingan memakai laju pemakaian per hari agar adil antara bulan yang belum selesai dan bulan penuh."
            actions={
              <div className="tools">
                <div className="search">
                  <Icon name="search" />
                  <input
                    className="in"
                    placeholder="Cari barang…"
                    aria-label="Cari barang"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
            }
            flush
          >
            {shown.length === 0 ? (
              <EmptyState
                icon="box"
                title={
                  all.length === 0 ? 'Belum ada barang dengan saldo awal' : 'Tidak ada barang yang cocok'
                }
              >
                {all.length === 0
                  ? 'Isi saldo awal barang di halaman Proyek & Perusahaan. Barang yang saldo awalnya baru ada setelah bulan ini tidak ditampilkan.'
                  : 'Ubah kata pencarian.'}
              </EmptyState>
            ) : (
              <ScrollTable label="Ringkasan per barang">
                <table>
                  <thead>
                    <tr>
                      {th('name', 'Barang')}
                      <th>Satuan</th>
                      {th('awal', 'Awal', true)}
                      {th('masuk', 'Masuk', true)}
                      {th('keluar', 'Keluar', true)}
                      {th('sisa', 'Sisa', true)}
                      {th('dKeluar', 'Laju harian vs bln lalu', true)}
                      {th('pct', 'Pemakaian')}
                      {th('cover', 'Cukup (hari)', true)}
                      {th('status', 'Status')}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                        <td className="wrap">
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={(e) => (e.stopPropagation(), setOpen(r))}
                          >
                            {r.name}
                          </button>
                          <div className="sm muted">{r.category}</div>
                        </td>
                        <td className="muted">{r.unit}</td>
                        <td className="r num">{fmt(r.awal)}</td>
                        <td className="r num in-c">{fmt(r.masuk)}</td>
                        <td className="r num out-c">{fmt(r.keluar)}</td>
                        <td className="r num">
                          <b>{fmt(r.sisa)}</b>
                        </td>
                        <td className="r">
                          <Delta v={r.dKeluar} />
                          <div className="sm muted num">keluar bln lalu {fmt(r.prevKeluar)}</div>
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div className={`bar ${r.pct > 75 ? 'vh' : r.pct > 55 ? 'hi' : ''}`}>
                            <i style={{ width: `${Math.min(100, r.pct)}%` }} />
                          </div>
                          <div className="sm muted num">{fmt(r.pct, 1)}%</div>
                        </td>
                        <td className="r num">{r.cover === null ? '—' : Math.floor(r.cover)}</td>
                        <td>
                          <Pill tone={TONE[r.status]}>{r.statusLabel}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            )}
          </Card>

          <div className="pair">
            <Card title="Pemakaian tertinggi" subtitle="keluar ÷ (awal + masuk) · garis = 75%">
              <div className="hb">
                {top.length === 0 ? (
                  <div className="sm muted">Belum ada pemakaian pada bulan ini.</div>
                ) : (
                  top.map((r) => (
                    <div className="hr" key={r.id}>
                      <div className="hrt">
                        <span title={r.name}>{r.name}</span>
                        <b className="num">{r.pct.toFixed(0)}%</b>
                      </div>
                      <div className={`bar mk ${r.pct > 75 ? 'vh' : r.pct > 55 ? 'hi' : ''}`}>
                        <i style={{ width: `${Math.min(100, r.pct)}%` }} />
                      </div>
                      <div className="sm muted num">
                        keluar {fmt(r.keluar)} dari {fmt(r.awal + r.masuk)} {r.unit}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <Card
              title="Perlu perhatian"
              subtitle={`${attention.length} barang kritis, menipis, atau tidak bergerak`}
            >
              <div className="attn">
                {attention.length === 0 ? (
                  <div className="sm muted">Semua stok aman.</div>
                ) : (
                  attention.map((r) => (
                    <div className="li" key={r.id}>
                      <div className="g">
                        <b>{r.name}</b>
                        <div className="sm muted num">
                          Sisa {fmt(r.sisa)} {r.unit} · min {fmt(r.min)}
                          {r.cover !== null ? ` · cukup ±${Math.floor(r.cover)} hari` : ''}
                          {r.status === 'mute' && r.idle !== null ? ` · diam ${r.idle} hari` : ''}
                        </div>
                      </div>
                      <Pill tone={TONE[r.status]}>{r.statusLabel}</Pill>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {compare.length > 0 && (
            <Card
              title="Perbandingan antar proyek"
              subtitle="Persentase pemakaian tidak bersatuan, jadi aman dibandingkan antar proyek."
              flush
            >
              <ScrollTable label="Perbandingan antar proyek">
                <table>
                  <thead>
                    <tr>
                      <th>Proyek</th>
                      <th className="r">Barang</th>
                      <th className="r">Transaksi</th>
                      <th>Rata-rata pemakaian</th>
                      <th className="r">Kritis</th>
                      <th className="r">Menipis</th>
                      <th className="r">Tidak bergerak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map((c) => (
                      <tr key={c.projectId}>
                        <td>
                          <b>{projName(c.projectId)}</b>
                        </td>
                        <td className="r num">{c.items}</td>
                        <td className="r num">{c.tx}</td>
                        <td style={{ minWidth: 130 }}>
                          <div className={`bar ${c.avgPct > 75 ? 'vh' : c.avgPct > 55 ? 'hi' : ''}`}>
                            <i style={{ width: `${Math.min(100, c.avgPct)}%` }} />
                          </div>
                          <div className="sm muted num">{fmt(c.avgPct, 1)}%</div>
                        </td>
                        <td className="r num">{c.kritis}</td>
                        <td className="r num">{c.menipis}</td>
                        <td className="r num">{c.idle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </Card>
          )}
        </>
      )}

      {open && data.data && (
        <DetailDrawer
          row={open}
          ym={ym}
          today={today}
          items={data.data.items}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

/** Rincian satu barang. Dibaca sesuai permintaan: maksimal 30 total harian + 6 total bulanan per proyek. */
function DetailDrawer({
  row,
  ym,
  today,
  items,
  onClose,
}: {
  row: DashRow
  ym: string
  today: string
  items: Map<string, DashItem[]>
  onClose: () => void
}) {
  const fromMonth = (() => {
    let c = ym
    for (let i = 0; i < 5; i++) c = prevYm(c)
    return c
  })()
  const det = useLoad(
    async () => {
      const parts = await Promise.all(
        row.projectIds.map(async (pid) => {
          const it = items.get(pid)?.find((x) => x.id === row.id)
          const [days, months] = await Promise.all([
            listDays(pid, row.id, addDays(today, -29)),
            listMonths(pid, row.id, fromMonth),
          ])
          return { stock: it?.currentStock ?? 0, days, months }
        }),
      )
      // Gabungan beberapa proyek: deret stok dijumlahkan per hari, bulan dijumlahkan per id.
      const series = parts.map((p) => stockSeries(p.stock, p.days, today, 30))
      const merged = series[0].map((s, i) => ({
        date: s.date,
        value: series.reduce((a, x) => a + Math.round(x[i].value * 1000), 0) / 1000,
      }))
      const byMonth = new Map<
        string,
        { id: string; in: number; out: number; corrIn: number; corrOut: number }
      >()
      for (const p of parts)
        for (const m of p.months) {
          const c = byMonth.get(m.id) ?? { id: m.id, in: 0, out: 0, corrIn: 0, corrOut: 0 }
          c.in += m.in
          c.out += m.out
          c.corrIn += m.corrIn
          c.corrOut += m.corrOut
          byMonth.set(m.id, c)
        }
      return { series: merged, bars: monthlyBars([...byMonth.values()], ym, 6) }
    },
    `dash-detail:${row.id}:${row.projectIds.join(',')}:${ym}`,
  )

  return (
    <Overlay
      title={row.name}
      variant="drawer"
      onClose={onClose}
      footer={<Button onClick={onClose}>Tutup</Button>}
    >
      <div className="dstack">
        <div className="sm muted">
          {row.category || '—'} · satuan {row.unit}
        </div>
        <div className="grid2">
          <div className="kpi">
            <div className="l">Sisa {ymLabel(ym)}</div>
            <div className="v num">{fmt(row.sisa)}</div>
            <div className="d">{row.unit}</div>
          </div>
          <div className="kpi">
            <div className="l">Batas minimum</div>
            <div className="v num">{fmt(row.min)}</div>
            <div className="d">{row.sisa <= row.min ? 'sudah di bawah batas' : 'di atas batas'}</div>
          </div>
        </div>
        <div className="tw">
          <table style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th />
                <th className="r">Bulan lalu</th>
                <th className="r">Bulan ini</th>
                <th className="r">Perubahan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Masuk</td>
                <td className="r num">{fmt(row.prevMasuk)}</td>
                <td className="r num in-c">{fmt(row.masuk)}</td>
                <td className="r">
                  <Delta v={row.dMasuk} invert />
                </td>
              </tr>
              <tr>
                <td>Keluar</td>
                <td className="r num">{fmt(row.prevKeluar)}</td>
                <td className="r num out-c">{fmt(row.keluar)}</td>
                <td className="r">
                  <Delta
                    v={row.prevKeluar > 0 ? ((row.keluar - row.prevKeluar) / row.prevKeluar) * 100 : null}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {det.error ? (
          <div className="form-error" role="alert">
            {det.error}
          </div>
        ) : !det.data ? (
          <div className="sm muted">Memuat grafik…</div>
        ) : (
          <>
            <Card title="Sisa stok 30 hari" subtitle={`satuan ${row.unit}`}>
              <StockLine
                series={det.data.series}
                min={row.min}
                label={`Sisa stok ${row.name} 30 hari terakhir`}
              />
            </Card>
            <Card title="Masuk dan keluar 6 bulan" subtitle="sudah memperhitungkan koreksi">
              <MonthBars data={det.data.bars} label={`Masuk dan keluar ${row.name} per bulan`} />
              <div className="legend">
                <span>
                  <i style={{ background: 'var(--ok)' }} />
                  Masuk
                </span>
                <span>
                  <i style={{ background: 'var(--bad)' }} />
                  Keluar
                </span>
              </div>
            </Card>
          </>
        )}
      </div>
    </Overlay>
  )
}
