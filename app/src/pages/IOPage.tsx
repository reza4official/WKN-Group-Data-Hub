import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useAuth } from '../auth/context'
import logoUrl from '../assets/logo-full.png'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Pill } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { listCatalog, listLedger, listMonths, listProjectItems, listProjects } from '../lib/data'
import { loadDashboard } from '../lib/dashboardData'
import { download, imageDataUrl } from '../lib/download'
import { fileSlug, meta, summaryTable, transactionTable, type Table } from '../lib/exportTables'
import {
  chunkRows,
  estimateWrites,
  MAX_ROWS,
  validateAll,
  type ImportItem,
  type PreviewRow,
} from '../lib/importRows'
import { buildRows, type LedgerItemInfo } from '../lib/ledger'
import { buildPdf } from '../lib/pdf'
import { buildTemplate, buildWorkbook, ImportFileError, readImportFile } from '../lib/spreadsheet'
import { todayWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'
import { fmtDate } from '../lib/dates'

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

interface ServerRow {
  index: number
  status: 'ok' | 'duplicate' | 'error'
  code?: string
  message?: string
}
interface Outcome {
  accepted: number
  duplicates: number
  rejected: { rowNo: number; itemName: string; message: string }[]
  failedChunks: number
}

export function IOPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const perms = state.status === 'in' ? state.perms : new Set<string>()
  const profile = state.status === 'in' ? state.profile : null
  const roleName = state.status === 'in' ? state.roleName : ''
  const mine = useMemo(() => profile?.projectIds ?? [], [profile])
  const seeAll = perms.has('projects')
  const today = todayWita()

  const projects = useLoad(() => listProjects(seeAll, mine), `io-projects:${seeAll}:${mine.join(',')}`)
  const list = (projects.data ?? []).filter((p) => p.active)
  const [pid, setPid] = useState('')
  const activePid = pid || list[0]?.id || ''
  const project = list.find((p) => p.id === activePid)
  const canExport = perms.has('export')
  const canImport =
    perms.has('import') && perms.has('inventory.write') && (seeAll || mine.includes(activePid))

  // ---------- Ekspor ----------
  const [ym, setYm] = useState(today.slice(0, 7))
  const [what, setWhat] = useState<{ tx: boolean; sum: boolean }>({ tx: true, sum: true })
  const [busy, setBusy] = useState('')
  const [exportError, setExportError] = useState('')

  async function tables(): Promise<Table[]> {
    const out: Table[] = []
    if (what.tx) {
      const [raw, catalog] = await Promise.all([listProjectItems(activePid), listCatalog()])
      const infos: LedgerItemInfo[] = raw.map((it) => {
        const c = catalog.find((x) => x.id === it.id)
        return {
          id: it.id,
          name: c?.name ?? it.id,
          unit: c?.unit ?? '',
          openingQty: it.openingQty,
          openingDate: it.openingDate,
          currentStock: it.currentStock ?? 0,
        }
      })
      const [entries, months] = await Promise.all([
        listLedger(activePid, ym),
        Promise.all(infos.map((i) => listMonths(activePid, i.id, ym))),
      ])
      out.push(
        transactionTable(
          buildRows(infos, Object.fromEntries(infos.map((i, n) => [i.id, months[n]])), entries, ym),
        ),
      )
    }
    if (what.sum && project) out.push(summaryTable((await loadDashboard([project], ym, today)).rows))
    return out
  }

  async function doExport(kind: 'xlsx' | 'pdf') {
    if (!project || !profile || (!what.tx && !what.sum)) return
    setBusy(kind)
    setExportError('')
    try {
      const t = await tables()
      const m = meta(
        what.tx && !what.sum ? 'Transaksi Stok' : what.sum && !what.tx ? 'Ringkasan Stok' : 'Laporan Stok',
        project.name,
        ymLabel(ym),
        profile.name,
        roleName,
      )
      const slug = fileSlug(
        what.tx && what.sum ? 'laporan' : what.tx ? 'transaksi' : 'ringkasan',
        project.name,
        ym,
      )
      if (kind === 'xlsx') download(await buildWorkbook(m, t), `${slug}.xlsx`)
      else download(await buildPdf(m, t, await imageDataUrl(logoUrl)), `${slug}.pdf`)
      toast(kind === 'xlsx' ? 'Berkas Excel diunduh.' : 'Berkas PDF diunduh.')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Ekspor gagal.')
    } finally {
      setBusy('')
    }
  }

  // ---------- Impor ----------
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [importError, setImportError] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [drag, setDrag] = useState(false)
  const runId = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [showAll, setShowAll] = useState(false)

  const importItems = async (): Promise<ImportItem[]> => {
    const [raw, catalog] = await Promise.all([listProjectItems(activePid), listCatalog()])
    return raw.map((it) => ({
      id: it.id,
      name: catalog.find((c) => c.id === it.id)?.name ?? it.id,
      active: it.active,
      openingQty: it.openingQty,
      openingDate: it.openingDate,
    }))
  }

  async function onTemplate() {
    if (!project) return
    setImportError('')
    try {
      const items = (await importItems()).filter((i) => i.active && i.openingQty !== null)
      const catalog = await listCatalog()
      download(
        await buildTemplate(
          project.name,
          items.map((i) => ({ name: i.name, unit: catalog.find((c) => c.id === i.id)?.unit ?? '' })),
        ),
        `${fileSlug('template-impor', project.name)}.xlsx`,
      )
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Template gagal dibuat.')
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setImportError('')
    setOutcome(null)
    setPreview(null)
    setShowAll(false)
    try {
      const raw = await readImportFile(f)
      const [items, catalog] = await Promise.all([importItems(), listCatalog()])
      setPreview(
        validateAll(
          raw,
          items,
          today,
          catalog.map((c) => c.name),
        ),
      )
      setFileName(f.name)
      runId.current = crypto.randomUUID()
    } catch (e) {
      setImportError(
        e instanceof ImportFileError || e instanceof Error ? e.message : 'Berkas tidak dapat dibaca.',
      )
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const good = (preview ?? []).filter((r) => !r.error)
  const bad = (preview ?? []).filter((r) => r.error)

  async function runImport() {
    if (!preview || good.length === 0) return
    const chunks = chunkRows(good)
    setProgress({ done: 0, total: chunks.length })
    setImportError('')
    const rejected: Outcome['rejected'] = []
    let accepted = 0
    let duplicates = 0
    let failedChunks = 0
    for (let c = 0; c < chunks.length; c++) {
      const rows = chunks[c]
      try {
        const res = await api<{ results: ServerRow[] }>('/ledger/import', {
          projectId: activePid,
          importId: `${runId.current}-${c + 1}`,
          fileName,
          rows: rows.map((r) => ({
            itemId: r.itemId,
            type: r.type,
            qty: r.qty,
            date: r.date,
            note: r.note || undefined,
          })),
        })
        for (const s of res.results) {
          const src = rows[s.index - 1]
          if (s.status === 'ok') accepted++
          else if (s.status === 'duplicate') duplicates++
          else
            rejected.push({
              rowNo: src.rowNo,
              itemName: src.itemName,
              message: s.message ?? 'Ditolak server.',
            })
        }
      } catch (e) {
        failedChunks++
        setImportError(e instanceof Error ? e.message : 'Sebagian baris gagal dikirim.')
      }
      setProgress({ done: c + 1, total: chunks.length })
    }
    setProgress(null)
    setOutcome({ accepted, duplicates, rejected, failedChunks })
    // Bila ada kelompok gagal, pratinjau dipertahankan: menekan Impor lagi memakai sesi yang sama, jadi baris yang sudah masuk dilewati.
    if (failedChunks === 0) setPreview(null)
    if (accepted > 0) toast(`${accepted} transaksi diimpor atas nama Anda.`)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    void onFile(e.dataTransfer.files?.[0])
  }

  if (projects.loading && !projects.data)
    return (
      <Card flush>
        <EmptyState icon="xls" title="Memuat…" />
      </Card>
    )
  if (list.length === 0)
    return (
      <Card flush>
        <EmptyState icon="build" title="Belum ada proyek aktif">
          Impor dan ekspor dilakukan per proyek. Buat atau minta penugasan ke proyek terlebih dulu.
        </EmptyState>
      </Card>
    )

  const shownRows = showAll
    ? (preview ?? [])
    : (preview ?? []).filter((r) => r.error).concat(good.slice(0, 20))
  const est = estimateWrites(good)

  return (
    <>
      <Card
        title="Impor / Ekspor"
        subtitle="Berkas dibaca dan dibuat di perangkat Anda; hanya data transaksi yang valid yang dikirim saat impor."
        actions={
          <div className="tools">
            <select
              id="io-project"
              className="sel"
              aria-label="Proyek"
              value={activePid}
              onChange={(e) => (setPid(e.target.value), setPreview(null), setOutcome(null))}
            >
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="Ekspor data" subtitle="Berkas memuat nama pembuat, jabatan, dan waktu cetak (WITA).">
          <div className="stack">
            <div className="field">
              <label htmlFor="io-month">Bulan</label>
              <input
                id="io-month"
                className="in"
                type="month"
                value={ym}
                max={today.slice(0, 7)}
                onChange={(e) => /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && setYm(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="lbl">Isi berkas</span>
              <div className="tools">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={what.tx}
                    onChange={(e) => setWhat({ ...what, tx: e.target.checked })}
                  />
                  Transaksi
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={what.sum}
                    onChange={(e) => setWhat({ ...what, sum: e.target.checked })}
                  />
                  Ringkasan per barang
                </label>
              </div>
            </div>
            {!canExport ? (
              <div className="sm muted">Role Anda belum diberi izin ekspor.</div>
            ) : (
              <div className="tools">
                <Button
                  variant="primary"
                  onClick={() => void doExport('xlsx')}
                  disabled={!!busy || (!what.tx && !what.sum)}
                >
                  <Icon name="xls" />
                  {busy === 'xlsx' ? 'Menyiapkan…' : 'Excel (.xlsx)'}
                </Button>
                <Button onClick={() => void doExport('pdf')} disabled={!!busy || (!what.tx && !what.sum)}>
                  {busy === 'pdf' ? 'Menyiapkan…' : 'PDF'}
                </Button>
              </div>
            )}
            {exportError && (
              <div className="form-error" role="alert">
                {exportError}
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Impor dari Excel"
          subtitle="Unduh template, isi, unggah, periksa pratinjau, lalu konfirmasi."
        >
          {!canImport ? (
            <div className="sm muted">
              Role Anda belum diberi izin impor, atau Anda tidak ditugaskan ke proyek ini.
            </div>
          ) : (
            <div className="stack">
              <div
                className={`drop${drag ? ' on' : ''}`}
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                <div style={{ fontWeight: 600 }}>Tarik berkas .xlsx ke sini</div>
                <div className="sm muted">atau pilih dari perangkat (maksimal 2 MB, {MAX_ROWS} baris)</div>
                <div className="tools" style={{ justifyContent: 'center', marginTop: 12 }}>
                  <label className="btn" style={{ cursor: 'pointer' }}>
                    Pilih berkas
                    <input
                      ref={fileInput}
                      id="io-file"
                      type="file"
                      accept=".xlsx"
                      hidden
                      onChange={(e) => void onFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
              <Button size="sm" onClick={() => void onTemplate()} style={{ alignSelf: 'flex-start' }}>
                Unduh template Excel
              </Button>
              {importError && (
                <div className="form-error" role="alert">
                  {importError}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {preview && (
        <Card
          title={`Pratinjau · ${fileName}`}
          subtitle={`${good.length} baris valid, ${bad.length} baris perlu diperbaiki. Baris bermasalah tidak diimpor. Stok diperiksa ulang oleh server: barang masuk diproses lebih dulu, lalu keluar menurut tanggal.`}
          actions={
            <div className="tools">
              <Button onClick={() => (setPreview(null), setOutcome(null))}>Batal</Button>
              <Button
                variant="primary"
                onClick={() => void runImport()}
                disabled={good.length === 0 || !!progress}
              >
                {progress
                  ? `Mengimpor ${progress.done}/${progress.total}…`
                  : `Impor ${good.length} baris valid`}
              </Button>
            </div>
          }
          flush
        >
          <div className="bd sm muted">
            Perkiraan {est.toLocaleString('id-ID')} penulisan ke database dari kuota gratis 20.000 per hari
            (dipakai bersama semua pengguna).
            {est > 5000 ? ' Ini cukup besar; pertimbangkan membagi impor ke beberapa hari.' : ''}
          </div>
          <ScrollTable label="Pratinjau impor">
            <table>
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Tanggal</th>
                  <th>Nama Barang</th>
                  <th>Jenis</th>
                  <th className="r">Jumlah</th>
                  <th>Keterangan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={r.rowNo}>
                    <td className="num">{r.rowNo}</td>
                    <td>{r.date ? fmtDate(r.date) : '—'}</td>
                    <td>{r.itemName || '—'}</td>
                    <td>{r.type || '—'}</td>
                    <td className="r num">{r.qty || '—'}</td>
                    <td>{r.note}</td>
                    <td className="wrap">
                      {r.error ? <Pill tone="bad">{r.error}</Pill> : <Pill tone="ok">Valid</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
          {!showAll && preview.length > shownRows.length && (
            <div className="bd">
              <Button size="sm" onClick={() => setShowAll(true)}>
                Tampilkan semua {preview.length} baris
              </Button>
            </div>
          )}
        </Card>
      )}

      {outcome && (
        <Card title="Hasil impor" subtitle={fileName}>
          <div className="stack">
            <div role="status">
              <b>{outcome.accepted}</b> transaksi diimpor
              {outcome.duplicates ? `, ${outcome.duplicates} dilewati karena sudah pernah diimpor` : ''}
              {outcome.rejected.length ? `, ${outcome.rejected.length} ditolak server` : ''}
              {outcome.failedChunks ? `, ${outcome.failedChunks} kelompok gagal dikirim` : ''}.
            </div>
            {outcome.failedChunks > 0 && (
              <div className="form-error" role="alert">
                Sebagian kelompok baris gagal dikirim (koneksi atau server). Tekan Impor lagi pada pratinjau
                di atas: baris yang sudah masuk dilewati dan tidak tercatat ganda.
              </div>
            )}
            {outcome.rejected.length > 0 && (
              <ScrollTable label="Baris ditolak server">
                <table>
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Barang</th>
                      <th>Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.rejected.map((r) => (
                      <tr key={r.rowNo}>
                        <td className="num">{r.rowNo}</td>
                        <td>{r.itemName}</td>
                        <td className="wrap">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            )}
            <a className="btn" href="#inventory" style={{ alignSelf: 'flex-start' }}>
              Lihat di Transaksi Stok
            </a>
          </div>
        </Card>
      )}
    </>
  )
}
