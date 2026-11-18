import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { listRoles, type Role } from '../lib/data'
import { PERMISSION_KEYS, PERMISSION_LABELS } from '../lib/permissions'
import { useLoad } from '../lib/useLoad'

type Draft = { name?: string; perms?: string[]; level?: string }

export function RolesPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const level = state.status === 'in' ? state.profile.level : 0
  const myPerms = state.status === 'in' ? state.perms : new Set<string>()
  const roles = useLoad(listRoles, 'roles')
  const [selId, setSelId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [modal, setModal] = useState<'new' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const list = roles.data ?? []
  const sel = list.find((r) => r.id === selId) ?? list.find((r) => r.level < level) ?? list[0]
  const canEdit = !!sel && myPerms.has('roles') && !sel.system && sel.level < level
  const draft = (sel && drafts[sel.id]) || {}
  const perms = draft.perms ?? sel?.perms ?? []
  const name = draft.name ?? sel?.name ?? ''
  const lvlText = draft.level ?? String(sel?.level ?? '')
  const dirty =
    !!sel &&
    ((draft.level !== undefined && draft.level !== String(sel.level)) ||
      (draft.perms && draft.perms.slice().sort().join() !== sel.perms.slice().sort().join()) ||
      (draft.name !== undefined && draft.name !== sel.name))

  const patch = (d: Draft) => sel && setDrafts((s) => ({ ...s, [sel.id]: { ...s[sel.id], ...d } }))
  const toggle = (key: string) =>
    patch({ perms: perms.includes(key) ? perms.filter((p) => p !== key) : [...perms, key] })

  const save = async () => {
    if (!sel) return
    setBusy(true)
    setError('')
    try {
      await api('/roles/update', {
        id: sel.id,
        name,
        perms,
        ...(draft.level !== undefined ? { level: Number(draft.level) } : {}),
      })
      setDrafts((s) => {
        const { [sel.id]: _omit, ...rest } = s
        void _omit
        return rest
      })
      toast('Role diperbarui. Perubahan tercatat di Log Audit.')
      roles.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="cols">
        <Card
          title="Hirarki role"
          subtitle="Makin besar level, makin tinggi."
          actions={
            myPerms.has('roles') && (
              <Button data-guide="roles-new" size="sm" variant="primary" onClick={() => setModal('new')}>
                <Icon name="plus" />
                Role baru
              </Button>
            )
          }
        >
          {roles.error ? (
            <EmptyState icon="alert" title="Role tidak dapat dimuat">
              {roles.error}
            </EmptyState>
          ) : (
            <div className="stack">
              {list.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className={`rolerow${r.id === sel?.id ? ' on' : ''}`}
                  onClick={() => setSelId(r.id)}
                  aria-pressed={r.id === sel?.id}
                >
                  <span className="lvl">{r.level}</span>
                  <span className="g">
                    <b>{r.name}</b>
                  </span>
                  {r.system && <Icon name="lock" />}
                </button>
              ))}
            </div>
          )}
        </Card>

        {sel && (
          <Card
            title={`Akses: ${sel.name}`}
            subtitle={
              canEdit
                ? 'Centang untuk memberi atau mencabut akses. Anda hanya dapat mengubah izin yang Anda miliki.'
                : sel.system
                  ? 'Role sistem tidak dapat diubah.'
                  : 'Hanya dapat dilihat. Anda hanya dapat mengubah role di bawah level Anda.'
            }
            actions={
              canEdit && (
                <div className="tools">
                  <Button size="sm" variant="danger" onClick={() => setModal('delete')}>
                    <Icon name="trash" />
                    Hapus role
                  </Button>
                  <Button size="sm" variant="primary" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? 'Menyimpan…' : 'Simpan perubahan'}
                  </Button>
                </div>
              )
            }
          >
            <div className="stack">
              {canEdit && (
                <div className="field">
                  <label htmlFor="role-name">Nama role</label>
                  <input
                    id="role-name"
                    className="in"
                    value={name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </div>
              )}
              {canEdit && (
                <div className="field">
                  <label htmlFor="role-level">Level (1–{level - 1})</label>
                  <input
                    id="role-level"
                    className="in"
                    type="number"
                    min={1}
                    max={level - 1}
                    value={lvlText}
                    onChange={(e) => patch({ level: e.target.value })}
                  />
                  <div className="hint">
                    Level baru harus di bawah level Anda dan belum dipakai. Akun yang memakai role ini ikut
                    berubah levelnya.
                  </div>
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="matrix">
                {PERMISSION_KEYS.map((k) => {
                  const mine = myPerms.has(k)
                  const disabled = !canEdit || !mine
                  return (
                    <label key={k} className={`chk${disabled ? ' dis' : ''}`}>
                      <input
                        type="checkbox"
                        checked={perms.includes(k)}
                        disabled={disabled}
                        onChange={() => toggle(k)}
                      />
                      <span>
                        <b>{PERMISSION_LABELS[k]}</b>
                        <div className="sm muted">
                          {k}
                          {canEdit && !mine ? ' · Anda sendiri tidak punya izin ini' : ''}
                        </div>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </Card>
        )}
      </div>

      {modal === 'new' && (
        <NewRoleModal
          roles={list}
          myLevel={level}
          myPerms={myPerms}
          onClose={() => setModal(null)}
          onDone={(id) => {
            setModal(null)
            setSelId(id)
            toast('Role baru dibuat. Atur aksesnya di matriks.')
            roles.reload()
          }}
        />
      )}
      {modal === 'delete' && sel && (
        <DeleteRoleModal
          role={sel}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            setSelId('')
            toast('Role dihapus.')
            roles.reload()
          }}
        />
      )}
    </>
  )
}

function NewRoleModal({
  roles,
  myLevel,
  myPerms,
  onClose,
  onDone,
}: {
  roles: Role[]
  myLevel: number
  myPerms: ReadonlySet<string>
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [lvl, setLvl] = useState('')
  const [copyId, setCopyId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copyable = roles.filter((r) => r.level < myLevel)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const src = roles.find((r) => r.id === copyId)
      const perms = (src?.perms ?? []).filter((p) => myPerms.has(p))
      const out = await api<{ id: string }>('/roles/create', { name, level: Number(lvl), perms })
      onDone(out.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Overlay
      title="Role baru"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-newrole" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Buat role'}
          </Button>
        </>
      }
    >
      <form id="f-newrole" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="nr-name">Nama role</label>
          <input
            id="nr-name"
            className="in"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Pengawas Lapangan"
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="nr-level">Level (1–{myLevel - 1})</label>
            <input
              id="nr-level"
              className="in"
              type="number"
              min={1}
              max={myLevel - 1}
              value={lvl}
              onChange={(e) => setLvl(e.target.value)}
            />
            <div className="hint">Harus di bawah level Anda dan belum dipakai.</div>
          </div>
          <div className="field">
            <label htmlFor="nr-copy">Salin izin dari</label>
            <select id="nr-copy" className="in" value={copyId} onChange={(e) => setCopyId(e.target.value)}>
              <option value="">Tanpa izin</option>
              {copyable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Overlay>
  )
}

function DeleteRoleModal({ role, onClose, onDone }: { role: Role; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/roles/delete', { id: role.id })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Overlay
      title="Hapus role?"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" form="f-delrole" disabled={busy}>
            {busy ? 'Menghapus…' : 'Hapus role'}
          </Button>
        </>
      }
    >
      <form id="f-delrole" onSubmit={(e) => void submit(e)}>
        <p style={{ margin: 0 }}>
          Role <b>{role.name}</b> akan dihapus. Role yang masih dipakai akun tidak bisa dihapus.
        </p>
        {error && (
          <div className="form-error" role="alert" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </form>
    </Overlay>
  )
}
