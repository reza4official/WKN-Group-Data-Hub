import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { PasswordInput } from '../components/PasswordInput'
import { Pill } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { listProjects, listRoles, listUsersBelow, type Project, type Role, type UserRow } from '../lib/data'
import { useLoad } from '../lib/useLoad'

type Modal = { kind: 'create' } | { kind: 'edit' | 'reset' | 'delete'; user: UserRow } | null

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

export function UsersPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const level = state.status === 'in' ? state.profile.level : 0
  const myPerms = state.status === 'in' ? state.perms : new Set<string>()
  const seeAll = myPerms.has('projects')
  const myProjects = state.status === 'in' ? state.profile.projectIds : []
  const users = useLoad(
    () => listUsersBelow(level, seeAll ? undefined : myProjects),
    `users:${level}:${seeAll}:${myProjects.join(',')}`,
  )
  const roles = useLoad(listRoles, 'roles')
  const projects = useLoad(
    () => listProjects(seeAll, myProjects),
    `projects:${seeAll}:${myProjects.join(',')}`,
  )
  const pickable = (projects.data ?? []).filter((p) => p.active)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<Modal>(null)

  const roleOf = (id: string) => roles.data?.find((r) => r.id === id)
  // Role yang boleh diberikan: level di bawah pelaku DAN seluruh izinnya dimiliki pelaku.
  const assignable = (roles.data ?? []).filter((r) => r.level < level && r.perms.every((p) => myPerms.has(p)))
  const rows = (users.data ?? []).filter((u) =>
    `${u.name} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase()),
  )

  const done = (msg: string) => {
    setModal(null)
    toast(msg)
    users.reload()
  }

  return (
    <>
      <Card
        title="Akun pengguna"
        subtitle={`Anda dapat mengelola akun dengan level di bawah ${level}.`}
        flush
        actions={
          <div className="tools">
            <div className="search">
              <Icon name="search" />
              <input
                className="in"
                placeholder="Cari nama atau username…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Cari akun"
              />
            </div>
            <Button variant="primary" onClick={() => setModal({ kind: 'create' })} disabled={roles.loading}>
              <Icon name="plus" />
              Tambah akun
            </Button>
          </div>
        }
      >
        {users.error ? (
          <EmptyState icon="alert" title="Daftar akun tidak dapat dimuat">
            {users.error}
          </EmptyState>
        ) : users.loading && !users.data ? (
          <EmptyState icon="users" title="Memuat akun…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            title={q ? 'Tidak ada akun yang cocok' : 'Belum ada akun di bawah level Anda'}
          >
            {q ? 'Ubah kata kunci pencarian.' : 'Gunakan tombol Tambah akun untuk membuat akun baru.'}
          </EmptyState>
        ) : (
          <ScrollTable label="Daftar akun">
            <table>
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Role</th>
                  <th>Proyek</th>
                  <th>Kontak</th>
                  <th>Status</th>
                  <th className="r">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="person">
                        <span className="av" aria-hidden="true">
                          {initials(u.name || u.username)}
                        </span>
                        <div>
                          <b>{u.name}</b>
                          <div className="sm muted">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Pill tone="blue">{roleOf(u.roleId)?.name ?? u.roleId}</Pill>{' '}
                      <span className="lvl">{u.level}</span>
                    </td>
                    <td className="sm wrap">
                      {u.projectIds
                        .map((id) => projects.data?.find((p) => p.id === id)?.name ?? id)
                        .join(', ') || '—'}
                    </td>
                    <td className="sm">
                      <div>{u.emailContact || '—'}</div>
                      <div className="muted">{u.phone || '—'}</div>
                    </td>
                    <td>{u.disabled ? <Pill tone="mute">Nonaktif</Pill> : <Pill tone="ok">Aktif</Pill>}</td>
                    <td className="r">
                      <div className="acts">
                        <Button size="sm" onClick={() => setModal({ kind: 'edit', user: u })}>
                          Ubah
                        </Button>
                        <Button size="sm" onClick={() => setModal({ kind: 'reset', user: u })}>
                          <Icon name="key" />
                          Reset password
                        </Button>
                        <ToggleButton user={u} onDone={done} />
                        <Button
                          size="sm"
                          variant="danger"
                          iconOnly
                          aria-label={`Hapus ${u.username}`}
                          title="Hapus akun"
                          onClick={() => setModal({ kind: 'delete', user: u })}
                        >
                          <Icon name="trash" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </Card>

      {modal?.kind === 'create' && (
        <CreateModal roles={assignable} projects={pickable} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal
          user={modal.user}
          roles={assignable}
          projects={pickable}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal?.kind === 'reset' && (
        <ResetModal user={modal.user} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === 'delete' && (
        <DeleteModal user={modal.user} onClose={() => setModal(null)} onDone={done} />
      )}
    </>
  )
}

function ToggleButton({ user, onDone }: { user: UserRow; onDone: (m: string) => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const click = async () => {
    setBusy(true)
    try {
      await api('/users/set-disabled', { uid: user.id, disabled: !user.disabled })
      onDone(user.disabled ? 'Akun diaktifkan.' : 'Akun dinonaktifkan. Sesinya diputus.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" disabled={busy} onClick={() => void click()}>
      {user.disabled ? 'Aktifkan' : 'Nonaktifkan'}
    </Button>
  )
}

function useSubmit(action: () => Promise<string>, onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onDone(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function CreateModal({
  roles,
  projects,
  onClose,
  onDone,
}: {
  roles: Role[]
  projects: Project[]
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [f, setF] = useState({
    username: '',
    name: '',
    password: '',
    roleId: roles[0]?.id ?? '',
    phone: '',
    emailContact: '',
  })
  const [projectIds, setProjectIds] = useState<string[]>([])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }))
  const { busy, error, submit } = useSubmit(async () => {
    await api('/users/create', { ...f, projectIds })
    return `Akun ${f.username.trim()} dibuat.`
  }, onDone)
  return (
    <Overlay
      title="Tambah akun"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-create" disabled={busy || roles.length === 0}>
            {busy ? 'Menyimpan…' : 'Buat akun'}
          </Button>
        </>
      }
    >
      {roles.length === 0 ? (
        <p style={{ margin: 0 }}>Tidak ada role di bawah level Anda yang dapat diberikan.</p>
      ) : (
        <form id="f-create" className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <div className="grid2">
            <div className="field">
              <label htmlFor="c-un">Username</label>
              <input
                id="c-un"
                className="in"
                value={f.username}
                onChange={set('username')}
                autoComplete="off"
                autoCapitalize="none"
              />
            </div>
            <div className="field">
              <label htmlFor="c-nm">Nama lengkap</label>
              <input id="c-nm" className="in" value={f.name} onChange={set('name')} />
            </div>
          </div>
          <PasswordInput
            label="Password awal"
            value={f.password}
            onChange={set('password')}
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
          />
          <div className="field">
            <label htmlFor="c-rl">Role</label>
            <select id="c-rl" className="in" value={f.roleId} onChange={set('roleId')}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.level})
                </option>
              ))}
            </select>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="c-hp">No. HP</label>
              <input id="c-hp" className="in" value={f.phone} onChange={set('phone')} inputMode="tel" />
            </div>
            <div className="field">
              <label htmlFor="c-em">Email (untuk Login Google)</label>
              <input
                id="c-em"
                className="in"
                value={f.emailContact}
                onChange={set('emailContact')}
                inputMode="email"
                autoCapitalize="none"
              />
            </div>
          </div>
          <ProjectPicker projects={projects} value={projectIds} onChange={setProjectIds} />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </form>
      )}
    </Overlay>
  )
}

function EditModal({
  user,
  roles,
  projects,
  onClose,
  onDone,
}: {
  user: UserRow
  roles: Role[]
  projects: Project[]
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [f, setF] = useState({
    name: user.name,
    phone: user.phone,
    emailContact: user.emailContact,
    roleId: user.roleId,
  })
  const [projectIds, setProjectIds] = useState<string[]>(
    user.projectIds.filter((id) => projects.some((p) => p.id === id)),
  )
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }))
  const { busy, error, submit } = useSubmit(async () => {
    await api('/users/update', { uid: user.id, ...f, projectIds })
    return 'Perubahan disimpan.'
  }, onDone)
  const options = roles.some((r) => r.id === user.roleId)
    ? roles
    : [
        { id: user.roleId, name: `${user.roleId} (saat ini)`, level: user.level, system: false, perms: [] },
        ...roles,
      ]
  return (
    <Overlay
      title={`Ubah akun · @${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-edit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="f-edit" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="e-nm">Nama lengkap</label>
          <input id="e-nm" className="in" value={f.name} onChange={set('name')} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="e-hp">No. HP</label>
            <input id="e-hp" className="in" value={f.phone} onChange={set('phone')} inputMode="tel" />
          </div>
          <div className="field">
            <label htmlFor="e-em">Email</label>
            <input
              id="e-em"
              className="in"
              value={f.emailContact}
              onChange={set('emailContact')}
              inputMode="email"
              autoCapitalize="none"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="e-rl">Role</label>
          <select id="e-rl" className="in" value={f.roleId} onChange={set('roleId')}>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.level})
              </option>
            ))}
          </select>
        </div>
        <ProjectPicker projects={projects} value={projectIds} onChange={setProjectIds} />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Overlay>
  )
}

function ResetModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRow
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit(async () => {
    await api('/users/reset-password', { uid: user.id, password })
    return `Password @${user.username} diganti. Pelaku dan waktunya tercatat di Log Audit.`
  }, onDone)
  return (
    <Overlay
      title={`Reset password · @${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-reset" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan password baru'}
          </Button>
        </>
      }
    >
      <form id="f-reset" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="hint">
          Tindakan ini tercatat permanen atas nama Anda beserta tanggal dan jamnya. Sesi lama pengguna ini
          akan diputus. Sampaikan password baru langsung kepada yang bersangkutan.
        </div>
        <PasswordInput
          label="Password baru"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 6 karakter"
          autoComplete="new-password"
        />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Overlay>
  )
}

function DeleteModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRow
  onClose: () => void
  onDone: (m: string) => void
}) {
  const { busy, error, submit } = useSubmit(async () => {
    await api('/users/delete', { uid: user.id })
    return `Akun @${user.username} dihapus.`
  }, onDone)
  return (
    <Overlay
      title="Hapus akun?"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" form="f-del" disabled={busy}>
            {busy ? 'Menghapus…' : 'Hapus akun'}
          </Button>
        </>
      }
    >
      <form id="f-del" onSubmit={(e) => void submit(e)}>
        <p style={{ margin: 0 }}>
          Akun <b>{user.name}</b> (@{user.username}) akan dihapus dan tidak bisa masuk lagi. Catatan
          tindakannya di Log Audit tetap tersimpan.
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

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  if (projects.length === 0) return <div className="hint">Belum ada proyek yang dapat Anda tugaskan.</div>
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sm" style={{ fontWeight: 600, color: 'var(--fg-2)', marginBottom: 5 }}>
        Proyek yang dapat diakses
      </legend>
      <div className="matrix" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {projects.map((p) => (
          <label key={p.id} className="chk">
            <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
            <span>{p.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
