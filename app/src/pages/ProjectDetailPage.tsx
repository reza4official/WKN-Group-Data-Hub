import { useState, type FormEvent } from 'react'
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
import { getProject, listCatalog, listProjectItems, type CatalogItem, type ProjectItem } from '../lib/data'
import { todayWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'
import { fmtDate } from '../lib/dates'

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('id-ID', { maximumFractionDigits: 3 }))

type Modal = { kind: 'add' } | { kind: 'opening' | 'min'; item: ProjectItem } | null

export function ProjectDetailPage({ param }: { param?: string }) {
  const pid = param ?? ''
  const { state } = useAuth()
  const { toast } = useToast()
  const perms = state.status === 'in' ? state.perms : new Set<string>()
  const mine = state.status === 'in' ? state.profile.projectIds : []
  const canSetup = perms.has('projects') || (perms.has('inventory.write') && mine.includes(pid))
  const project = useLoad(() => getProject(pid), `project:${pid}`)
  const items = useLoad(() => listProjectItems(pid), `items:${pid}`)
  const catalog = useLoad(listCatalog, 'catalog')
  const [modal, setModal] = useState<Modal>(null)
  const cat = (id: string) => catalog.data?.find((c) => c.id === id)

  const done = (m: string) => {
    setModal(null)
    toast(m)
    items.reload()
    catalog.reload()
  }

  if (project.loading && !project.data)
    return (
      <Card flush>
        <EmptyState icon="build" title="Memuat…" />
      </Card>
    )
  if (project.error || !project.data) {
    return (
      <Card flush>
        <EmptyState icon="alert" title="Proyek tidak dapat dibuka">
          {project.error ?? 'Proyek tidak ditemukan atau tidak ditugaskan kepada Anda.'}
        </EmptyState>
        <div className="empty" style={{ paddingTop: 0 }}>
          <a className="btn" href="#projects">
            Kembali ke daftar proyek
          </a>
        </div>
      </Card>
    )
  }
  const p = project.data
  const rows = items.data ?? []
  const available = (catalog.data ?? []).filter((c) => c.active && !rows.some((r) => r.id === c.id))

  return (
    <>
      <Card
        title={p.name}
        subtitle={`${p.location || '—'} · mulai ${fmtDate(p.startDate)}`}
        actions={
          <div className="tools">
            <a className="btn sm" href="#projects">
              Semua proyek
            </a>
            {canSetup && p.active && (
              <Button variant="primary" onClick={() => setModal({ kind: 'add' })} disabled={catalog.loading}>
                <Icon name="plus" />
                Tambah barang
              </Button>
            )}
          </div>
        }
        flush
      >
        {items.error ? (
          <EmptyState icon="alert" title="Barang tidak dapat dimuat">
            {items.error}
          </EmptyState>
        ) : items.loading && !items.data ? (
          <EmptyState icon="box" title="Memuat…" />
        ) : rows.length === 0 ? (
          <EmptyState icon="box" title="Belum ada barang di proyek ini">
            Tambahkan barang dari katalog dan isi saldo awalnya. Barang tanpa saldo awal belum bisa menerima
            transaksi.
          </EmptyState>
        ) : (
          <ScrollTable label="Barang proyek">
            <table>
              <thead>
                <tr>
                  <th>Barang</th>
                  <th>Satuan</th>
                  <th className="r">Saldo awal</th>
                  <th>Per tanggal</th>
                  <th className="r">Stok saat ini</th>
                  <th className="r">Batas minimum</th>
                  <th>Status</th>
                  {canSetup && <th className="r">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = cat(r.id)
                  return (
                    <tr key={r.id}>
                      <td>
                        <b>{c?.name ?? r.id}</b>
                      </td>
                      <td>{c?.unit ?? '—'}</td>
                      <td className="r num">{fmt(r.openingQty)}</td>
                      <td>{fmtDate(r.openingDate)}</td>
                      <td className="r num">{fmt(r.currentStock)}</td>
                      <td className="r num">{fmt(r.minStock)}</td>
                      <td>
                        {!r.active ? (
                          <Pill tone="mute">Nonaktif</Pill>
                        ) : r.openingQty === null ? (
                          <Pill tone="warn">Belum ada saldo awal</Pill>
                        ) : (
                          <Pill tone="ok">Siap menerima transaksi</Pill>
                        )}
                      </td>
                      {canSetup && (
                        <td className="r">
                          <div className="acts">
                            <Button
                              size="sm"
                              onClick={() => setModal({ kind: 'opening', item: r })}
                              disabled={r.txCount > 0}
                              title={r.txCount > 0 ? 'Sudah ada transaksi' : undefined}
                            >
                              {r.openingQty === null ? 'Atur saldo awal' : 'Ubah saldo awal'}
                            </Button>
                            <Button size="sm" onClick={() => setModal({ kind: 'min', item: r })}>
                              Batas minimum
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </Card>

      {modal?.kind === 'add' && (
        <AddItemModal projectId={pid} available={available} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === 'opening' && (
        <OpeningModal
          projectId={pid}
          item={modal.item}
          cat={cat(modal.item.id)}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal?.kind === 'min' && (
        <MinModal
          projectId={pid}
          item={modal.item}
          cat={cat(modal.item.id)}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
    </>
  )
}

function useAction(run: () => Promise<string>, onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
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

const Err = ({ error }: { error: string }) =>
  error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null

function Footer({
  onClose,
  form,
  busy,
  label = 'Simpan',
}: {
  onClose: () => void
  form: string
  busy: boolean
  label?: string
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

function AddItemModal({
  projectId,
  available,
  onClose,
  onDone,
}: {
  projectId: string
  available: CatalogItem[]
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [catalogId, setCatalogId] = useState(available[0]?.id ?? '')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState('')
  const sel = available.find((c) => c.id === catalogId)
  const { busy, error, submit } = useAction(async () => {
    const body: Record<string, unknown> = { projectId, catalogId }
    if (qty !== '' || date !== '') {
      body.openingQty = qty === '' ? undefined : Number(qty)
      body.openingDate = date || undefined
    }
    await api('/items/add', body)
    return 'Barang ditambahkan ke proyek.'
  }, onDone)
  return (
    <Overlay
      title="Tambah barang ke proyek"
      onClose={onClose}
      footer={<Footer onClose={onClose} form="f-additem" busy={busy} label="Tambah" />}
    >
      {available.length === 0 ? (
        <p style={{ margin: 0 }}>
          Semua barang aktif di katalog sudah ada di proyek ini, atau katalog masih kosong.
        </p>
      ) : (
        <form id="f-additem" className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label htmlFor="ai-item">Barang dari katalog</label>
            <select
              id="ai-item"
              className="in"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="ai-qty">Saldo awal {sel ? `(${sel.unit})` : ''}</label>
              <input
                id="ai-qty"
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
              <label htmlFor="ai-date">Per tanggal</label>
              <input
                id="ai-date"
                className="in"
                type="date"
                max={todayWita()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="hint">
            Saldo awal boleh diisi nanti, tetapi barang tanpa saldo awal belum bisa menerima transaksi masuk
            atau keluar.
          </div>
          <Err error={error} />
        </form>
      )}
    </Overlay>
  )
}

function OpeningModal({
  projectId,
  item,
  cat,
  onClose,
  onDone,
}: {
  projectId: string
  item: ProjectItem
  cat?: CatalogItem
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [qty, setQty] = useState(item.openingQty === null ? '' : String(item.openingQty))
  const [date, setDate] = useState(item.openingDate ?? todayWita())
  const { busy, error, submit } = useAction(async () => {
    await api('/items/set-opening', {
      projectId,
      catalogId: item.id,
      openingQty: qty === '' ? undefined : Number(qty),
      openingDate: date,
    })
    return 'Saldo awal tersimpan. Perubahan tercatat atas nama Anda.'
  }, onDone)
  return (
    <Overlay
      title={`Saldo awal · ${cat?.name ?? item.id}`}
      onClose={onClose}
      footer={<Footer onClose={onClose} form="f-opening" busy={busy} />}
    >
      <form id="f-opening" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="hint">
          Saldo awal menjadi dasar perhitungan sisa stok. Setelah transaksi pertama dicatat, nilainya
          terkunci.
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="op-qty">Jumlah {cat ? `(${cat.unit})` : ''}</label>
            <input
              id="op-qty"
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
            <label htmlFor="op-date">Per tanggal</label>
            <input
              id="op-date"
              className="in"
              type="date"
              max={todayWita()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <Err error={error} />
      </form>
    </Overlay>
  )
}

function MinModal({
  projectId,
  item,
  cat,
  onClose,
  onDone,
}: {
  projectId: string
  item: ProjectItem
  cat?: CatalogItem
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [min, setMin] = useState(String(item.minStock))
  const [active, setActive] = useState(item.active)
  const { busy, error, submit } = useAction(async () => {
    await api('/items/update', { projectId, catalogId: item.id, minStock: Number(min), active })
    return 'Pengaturan barang diperbarui.'
  }, onDone)
  return (
    <Overlay
      title={`Pengaturan · ${cat?.name ?? item.id}`}
      onClose={onClose}
      footer={<Footer onClose={onClose} form="f-min" busy={busy} />}
    >
      <form id="f-min" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="mn-min">Batas minimum stok {cat ? `(${cat.unit})` : ''}</label>
          <input
            id="mn-min"
            className="in"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </div>
        <label className="chk">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>
            <b>Aktif di proyek ini</b>
            <div className="sm muted">
              Barang nonaktif tidak muncul untuk transaksi baru. Riwayatnya tetap tersimpan.
            </div>
          </span>
        </label>
        <Err error={error} />
      </form>
    </Overlay>
  )
}
