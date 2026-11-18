import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { Pill } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import {
  listCatalog,
  listLedger,
  listMonths,
  listProjectItems,
  listProjects,
  type CatalogItem,
  type ProjectItem,
} from '../lib/data'
import { fmtDate } from '../lib/dates'
import { buildRows, dayName, summarize, type LedgerItemInfo, type LedgerRow } from '../lib/ledger'
import { formatWita } from '../lib/time'
import { todayWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'

const fmt = (n: number | null) => (n === null ? '' : n.toLocaleString('id-ID', { maximumFractionDigits: 3 }))

type Modal = { kind: 'add' } | { kind: 'correct'; row: LedgerRow } | null

export function InventoryPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const perms = state.status === 'in' ? state.perms : new Set<string>()
  const mine = useMemo(() => (state.status === 'in' ? state.profile.projectIds : []), [state])
  const seeAll = perms.has('projects')

  const projects = useLoad(() => listProjects(seeAll, mine), `inv-projects:${seeAll}:${mine.join(',')}`)
  const [pid, setPid] = useState('')
  const [ym, setYm] = useState(todayWita().slice(0, 7))
  const [itemId, setItemId] = useState('')
  const [modal, setModal] = useState<Modal>(null)

  const list = projects.data ?? []
  const activePid = pid || list[0]?.id || ''
  const project = list.find((p) => p.id === activePid)
  const canWrite = perms.has('inventory.write') && (seeAll || mine.includes(activePid))
  const canCorrect = perms.has('inventory.correct') && (seeAll || mine.includes(activePid))

  const catalog = useLoad(listCatalog, 'catalog')
  const items = useLoad(
    () => (activePid ? listProjectItems(activePid) : Promise.resolve([])),
    `inv-items:${activePid}`,
  )
  const infos: LedgerItemInfo[] = useMemo(
    () =>
      (items.data ?? []).map((it: ProjectItem) => {
        const c = (catalog.data ?? []).find((x: CatalogItem) => x.id === it.id)
        return {
          id: it.id,
          name: c?.name ?? it.id,
          unit: c?.unit ?? '',
          openingQty: it.openingQty,
          openingDate: it.openingDate,
        }
      }),
    [items.data, catalog.data],
  )
  const shown = itemId ? infos.filter((i) => i.id === itemId) : infos

  const data = useLoad(
    async () => {
      if (!activePid || shown.length === 0) return { rows: [] as LedgerRow[] }
      const [entries, monthLists] = await Promise.all([
        listLedger(activePid, ym, itemId || undefined),
        Promise.all(shown.map((i) => listMonths(activePid, i.id))),
      ])
      const monthsByItem = Object.fromEntries(shown.map((i, n) => [i.id, monthLists[n]]))
      return { rows: buildRows(shown, monthsByItem, entries, ym) }
    },
    `inv-data:${activePid}:${ym}:${itemId}:${shown.map((i) => i.id).join(',')}:${items.data?.map((i) => i.txCount).join(',')}`,
  )

  const rows = data.data?.rows ?? []
  const total = summarize(rows)
  const ready = infos.filter((i) => i.openingQty !== null)
  const activeItems = (items.data ?? []).filter((i) => i.active)

  const done = (m: string) => {
    setModal(null)
    toast(m)
    items.reload()
    data.reload()
  }

  if (projects.loading && !projects.data)
    return (
      <Card flush>
        <EmptyState icon="box" title="Memuat…" />
      </Card>
    )
  if (projects.error) {
    return (
      <Card flush>
        <EmptyState icon="alert" title="Proyek tidak dapat dimuat">
          {projects.error}
        </EmptyState>
      </Card>
    )
  }
  if (list.length === 0) {
    return (
      <Card flush>
        <EmptyState icon="build" title="Belum ada proyek">
          {seeAll
            ? 'Buat proyek dan tambahkan barang beserta saldo awalnya di halaman Proyek & Perusahaan.'
            : 'Anda belum ditugaskan ke proyek mana pun. Minta atasan menugaskan Anda ke proyek.'}
        </EmptyState>
      </Card>
    )
  }

  return (
    <>
      <Card
        title="Transaksi Stok"
        subtitle={
          project
            ? `${project.name} · dalam satu hari, barang masuk dihitung lebih dulu daripada barang keluar`
            : undefined
        }
        actions={
          canWrite && project?.active ? (
            <Button variant="primary" onClick={() => setModal({ kind: 'add' })} disabled={ready.length === 0}>
              <Icon name="plus" />
              Catat transaksi
            </Button>
          ) : undefined
        }
      >
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor="inv-project">Proyek</label>
            <select
              id="inv-project"
              className="in"
              value={activePid}
              onChange={(e) => {
                setPid(e.target.value)
                setItemId('')
              }}
            >
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? '' : ' (nonaktif)'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid2" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="inv-month">Bulan</label>
              <input
                id="inv-month"
                className="in"
                type="month"
                value={ym}
                onChange={(e) => e.target.value && setYm(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-item">Barang</label>
              <select id="inv-item" className="in" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Semua barang</option>
                {infos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {items.error || data.error ? (
          <EmptyState icon="alert" title="Transaksi tidak dapat dimuat">
            {items.error ?? data.error}
          </EmptyState>
        ) : (items.loading && !items.data) || (data.loading && !data.data) ? (
          <EmptyState icon="box" title="Memuat…" />
        ) : infos.length === 0 ? (
          <EmptyState icon="box" title="Belum ada barang di proyek ini">
            Tambahkan barang dan isi saldo awalnya di halaman Proyek & Perusahaan.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon="swap" title="Belum ada transaksi di bulan ini">
            {ready.length === 0
              ? 'Barang di proyek ini belum memiliki saldo awal, jadi belum bisa menerima transaksi.'
              : 'Pilih bulan lain, atau catat transaksi baru.'}
          </EmptyState>
        ) : (
          <ScrollTable label="Transaksi stok">
            <table>
              <thead>
                <tr>
                  <th>Hari / Tanggal</th>
                  <th>Nama Barang</th>
                  <th>Satuan</th>
                  <th className="r">Masuk</th>
                  <th className="r">Keluar</th>
                  <th className="r">Tersisa</th>
                  <th>Keterangan</th>
                  <th>Dicatat oleh</th>
                  {canCorrect && <th className="r">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.corrected ? 'muted' : undefined}>
                    <td>
                      {dayName(r.date)}, {fmtDate(r.date)}
                    </td>
                    <td>
                      <b>{r.itemName}</b>
                    </td>
                    <td>{r.unit}</td>
                    <td className="r num">{fmt(r.in)}</td>
                    <td className="r num">{fmt(r.out)}</td>
                    <td className="r num">
                      <b>{fmt(r.balance)}</b>
                    </td>
                    <td>
                      {r.kind === 'opening' ? (
                        <Pill tone="blue">Saldo awal</Pill>
                      ) : r.kind === 'koreksi' ? (
                        <>
                          <Pill tone="bad">Koreksi</Pill> {r.note}
                        </>
                      ) : (
                        <>
                          {r.note}
                          {r.corrected && (
                            <>
                              {' '}
                              <Pill tone="mute">Sudah dikoreksi</Pill>
                            </>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {r.entry ? (
                        <>
                          {r.entry.createdByName}
                          <div className="sm muted">{formatWita(r.entry.createdAt)}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canCorrect && (
                      <td className="r">
                        {r.entry && r.kind !== 'koreksi' && !r.corrected && (
                          <Button size="sm" onClick={() => setModal({ kind: 'correct', row: r })}>
                            Koreksi
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <b>Total bulan ini (termasuk koreksi)</b>
                  </td>
                  <td className="r num">
                    <b>{fmt(total.in)}</b>
                  </td>
                  <td className="r num">
                    <b>{fmt(total.out)}</b>
                  </td>
                  <td colSpan={canCorrect ? 4 : 3} />
                </tr>
              </tfoot>
            </table>
          </ScrollTable>
        )}
      </Card>

      {modal?.kind === 'add' && (
        <AddModal
          projectId={activePid}
          items={activeItems.filter((i) => i.openingQty !== null)}
          infos={infos}
          defaultItem={itemId}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal?.kind === 'correct' && modal.row.entry && (
        <CorrectModal projectId={activePid} row={modal.row} onClose={() => setModal(null)} onDone={done} />
      )}
    </>
  )
}

function useAction(run: () => Promise<string>, onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onDone(await run())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function Footer({
  onClose,
  form,
  busy,
  label,
}: {
  onClose: () => void
  form: string
  busy: boolean
  label: string
}) {
  return (
    <>
      <Button onClick={onClose}>Batal</Button>
      <Button type="submit" variant="primary" form={form} disabled={busy}>
        {busy ? 'Menyimpan…' : label}
      </Button>
    </>
  )
}

const Err = ({ error }: { error: string }) =>
  error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null

function AddModal({
  projectId,
  items,
  infos,
  defaultItem,
  onClose,
  onDone,
}: {
  projectId: string
  items: ProjectItem[]
  infos: LedgerItemInfo[]
  defaultItem: string
  onClose: () => void
  onDone: (m: string) => void
}) {
  const info = (id: string) => infos.find((i) => i.id === id)
  const [itemId, setItemId] = useState(items.find((i) => i.id === defaultItem)?.id ?? items[0]?.id ?? '')
  const [type, setType] = useState<'masuk' | 'keluar'>('masuk')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayWita())
  const [note, setNote] = useState('')
  // Satu ID per pembukaan formulir: bila jaringan putus dan tombol ditekan lagi, server tidak mencatat dua kali.
  const requestId = useRef('')
  useEffect(() => {
    requestId.current = crypto.randomUUID()
  }, [])
  const sel = info(itemId)
  const { busy, error, submit } = useAction(async () => {
    await api('/ledger/add', {
      projectId,
      itemId,
      type,
      qty: qty === '' ? undefined : Number(qty),
      date,
      note: note.trim() || undefined,
      requestId: requestId.current,
    })
    return type === 'masuk' ? 'Barang masuk dicatat.' : 'Barang keluar dicatat.'
  }, onDone)
  return (
    <Overlay
      title="Catat transaksi stok"
      onClose={onClose}
      footer={<Footer onClose={onClose} form="f-tx" busy={busy} label="Catat" />}
    >
      <form id="f-tx" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="tx-item">Barang</label>
          <select id="tx-item" className="in" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {info(i.id)?.name ?? i.id} ({info(i.id)?.unit}) — stok {fmt(i.currentStock) || 0}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="lbl" id="tx-type-l">
            Jenis
          </span>
          <div role="radiogroup" aria-labelledby="tx-type-l" className="tools">
            {(['masuk', 'keluar'] as const).map((t) => (
              <label key={t} className="check">
                <input type="radio" name="tx-type" checked={type === t} onChange={() => setType(t)} />
                {t === 'masuk' ? 'Barang masuk' : 'Barang keluar'}
              </label>
            ))}
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="tx-qty">Jumlah {sel ? `(${sel.unit})` : ''}</label>
            <input
              id="tx-qty"
              className="in"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-date">Tanggal</label>
            <input
              id="tx-date"
              className="in"
              type="date"
              value={date}
              min={sel?.openingDate ?? undefined}
              max={todayWita()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tx-note">Keterangan (opsional)</label>
          <input
            id="tx-note"
            className="in"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="sm muted" style={{ margin: 0 }}>
          Transaksi tidak dapat diubah atau dihapus. Kesalahan diperbaiki dengan koreksi yang tercatat bersama
          alasannya.
        </p>
        <Err error={error} />
      </form>
    </Overlay>
  )
}

function CorrectModal({
  projectId,
  row,
  onClose,
  onDone,
}: {
  projectId: string
  row: LedgerRow
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [reason, setReason] = useState('')
  const { busy, error, submit } = useAction(async () => {
    await api('/ledger/correct', { projectId, entryId: row.entry?.id, reason: reason.trim() })
    return 'Koreksi dicatat.'
  }, onDone)
  return (
    <Overlay
      title="Koreksi transaksi"
      onClose={onClose}
      footer={<Footer onClose={onClose} form="f-corr" busy={busy} label="Buat koreksi" />}
    >
      <form id="f-corr" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <p style={{ margin: 0 }}>
          {row.kind === 'masuk' ? 'Barang masuk' : 'Barang keluar'}{' '}
          <b>
            {fmt(row.in ?? row.out)} {row.unit}
          </b>{' '}
          {row.itemName} pada {fmtDate(row.date)} akan dibalik dengan satu catatan koreksi. Catatan aslinya
          tetap tersimpan. Setiap transaksi hanya dapat dikoreksi satu kali.
        </p>
        <div className="field">
          <label htmlFor="co-reason">Alasan koreksi</label>
          <textarea
            id="co-reason"
            className="in"
            rows={3}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Err error={error} />
      </form>
    </Overlay>
  )
}
