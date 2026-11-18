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
import { listCatalog, type CatalogItem } from '../lib/data'
import { useLoad } from '../lib/useLoad'

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 })

export function CatalogPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const canManage = state.status === 'in' && state.perms.has('catalog')
  const cat = useLoad(listCatalog, 'catalog')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ item?: CatalogItem } | null>(null)
  const rows = (cat.data ?? []).filter((i) =>
    `${i.name} ${i.category}`.toLowerCase().includes(q.trim().toLowerCase()),
  )

  return (
    <>
      <Card
        title="Katalog barang grup"
        subtitle="Satu daftar baku untuk semua proyek, mencegah nama ganda."
        flush
        actions={
          <div className="tools">
            <div className="search">
              <Icon name="search" />
              <input
                className="in"
                placeholder="Cari barang…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Cari barang"
              />
            </div>
            {canManage && (
              <Button variant="primary" onClick={() => setModal({})}>
                <Icon name="plus" />
                Tambah barang
              </Button>
            )}
          </div>
        }
      >
        {cat.error ? (
          <EmptyState icon="alert" title="Katalog tidak dapat dimuat">
            {cat.error}
          </EmptyState>
        ) : cat.loading && !cat.data ? (
          <EmptyState icon="tag" title="Memuat…" />
        ) : rows.length === 0 ? (
          <EmptyState icon="tag" title={q ? 'Tidak ada barang yang cocok' : 'Katalog masih kosong'}>
            {q ? 'Ubah kata kunci pencarian.' : 'Tambahkan barang dan satuannya, lalu pakai di proyek.'}
          </EmptyState>
        ) : (
          <ScrollTable label="Katalog barang">
            <table>
              <thead>
                <tr>
                  <th>Nama barang</th>
                  <th>Kategori</th>
                  <th>Satuan</th>
                  <th className="r">Batas minimum</th>
                  <th className="r">Dipakai di proyek</th>
                  <th>Status</th>
                  {canManage && <th className="r">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.name}</b>
                    </td>
                    <td>{i.category || '—'}</td>
                    <td>{i.unit}</td>
                    <td className="r num">{fmt(i.minStock)}</td>
                    <td className="r num">{i.projectCount}</td>
                    <td>{i.active ? <Pill tone="ok">Aktif</Pill> : <Pill tone="mute">Nonaktif</Pill>}</td>
                    {canManage && (
                      <td className="r">
                        <Button size="sm" onClick={() => setModal({ item: i })}>
                          Ubah
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </Card>
      {modal && (
        <ItemModal
          item={modal.item}
          onClose={() => setModal(null)}
          onDone={(m) => {
            setModal(null)
            toast(m)
            cat.reload()
          }}
        />
      )}
    </>
  )
}

function ItemModal({
  item,
  onClose,
  onDone,
}: {
  item?: CatalogItem
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [f, setF] = useState({
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    category: item?.category ?? '',
    minStock: item ? String(item.minStock) : '0',
  })
  const [active, setActive] = useState(item?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    const v = e.target.value
    setF((s) => ({ ...s, [k]: v }))
  }
  const used = (item?.projectCount ?? 0) > 0
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { name: f.name, unit: f.unit, category: f.category, minStock: Number(f.minStock) }
      if (item) await api('/catalog/update', { id: item.id, ...body, active })
      else await api('/catalog/create', body)
      onDone(item ? 'Barang diperbarui.' : 'Barang ditambahkan ke katalog.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Overlay
      title={item ? 'Ubah barang' : 'Tambah barang ke katalog'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-catalog" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="f-catalog" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="ci-name">Nama barang</label>
          <input id="ci-name" className="in" value={f.name} onChange={set('name')} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="ci-unit">Satuan</label>
            <input
              id="ci-unit"
              className="in"
              value={f.unit}
              onChange={set('unit')}
              placeholder="mis. m³, Sak, Liter"
              disabled={used}
            />
            {used && <div className="hint">Satuan terkunci karena sudah dipakai di proyek.</div>}
          </div>
          <div className="field">
            <label htmlFor="ci-cat">Kategori</label>
            <input id="ci-cat" className="in" value={f.category} onChange={set('category')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ci-min">Batas minimum stok (bawaan)</label>
          <input
            id="ci-min"
            className="in"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={f.minStock}
            onChange={set('minStock')}
          />
        </div>
        {item && (
          <label className="chk">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={used}
            />
            <span>
              <b>Aktif</b>
              <div className="sm muted">
                {used
                  ? 'Barang yang sudah dipakai proyek tidak dapat dinonaktifkan.'
                  : 'Barang nonaktif tidak dapat dipilih untuk proyek baru.'}
              </div>
            </span>
          </label>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Overlay>
  )
}
