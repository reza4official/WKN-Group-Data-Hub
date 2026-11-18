import { useMemo, useState } from 'react'
import { useAuth } from '../auth/context'
import logoUrl from '../assets/logo-full.png'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Pill } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { useToast } from '../components/Toast'
import { listEmployees, listProjects, listRoles, type Employee } from '../lib/data'
import { download, imageDataUrl } from '../lib/download'
import { employeeTable, fileSlug, meta } from '../lib/exportTables'
import { buildPdf } from '../lib/pdf'
import { buildWorkbook } from '../lib/spreadsheet'
import { formatWita, toMillis } from '../lib/time'
import { useLoad } from '../lib/useLoad'

const initials = (n: string) => {
  const p = n.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? (p[p.length - 1][0] ?? '') : '')).toUpperCase()
}

/** Database Karyawan: data diri semua akun, terhubung langsung dengan Profil Saya. */
export function EmployeesPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const perms = state.status === 'in' ? state.perms : new Set<string>()
  const me = state.status === 'in' ? state.profile : null
  const roleLabel = state.status === 'in' ? state.roleName : ''
  const canExport = perms.has('export')

  const data = useLoad(
    async () => {
      const [emps, roles, projects] = await Promise.all([
        listEmployees(),
        listRoles(),
        // Nama proyek hanya tersedia bagi pemegang izin "projects"; selain itu tampil jumlahnya.
        perms.has('projects') ? listProjects(true, []) : Promise.resolve([]),
      ])
      return { emps, roles, projects }
    },
    `employees:${perms.has('projects')}`,
  )
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [project, setProject] = useState('')
  const [busy, setBusy] = useState('')

  const roleName = (id: string) => data.data?.roles.find((r) => r.id === id)?.name ?? id
  const projectName = (id: string) => data.data?.projects.find((p) => p.id === id)?.name ?? id

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data.data?.emps ?? [])
      .filter(
        (e) =>
          (!needle ||
            `${e.name} ${e.username} ${e.phone} ${e.emailContact}`.toLowerCase().includes(needle)) &&
          (!role || e.roleId === role) &&
          (!status || (status === 'off' ? e.disabled : !e.disabled)) &&
          (!project || e.projectIds.includes(project)),
      )
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'id'))
  }, [data.data, q, role, status, project])

  async function doExport(kind: 'xlsx' | 'pdf') {
    if (!me) return
    setBusy(kind)
    try {
      const m = meta('Database Karyawan', 'Seluruh grup', `${rows.length} akun`, me.name, roleLabel)
      const t = [employeeTable(rows, roleName, projectName)]
      const slug = fileSlug('database-karyawan')
      if (kind === 'xlsx') download(await buildWorkbook(m, t), `${slug}.xlsx`)
      else download(await buildPdf(m, t, await imageDataUrl(logoUrl)), `${slug}.pdf`)
      toast(kind === 'xlsx' ? 'Berkas Excel diunduh.' : 'Berkas PDF diunduh.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ekspor gagal.')
    } finally {
      setBusy('')
    }
  }

  const when = (e: Employee) => {
    const t = e.updatedAt ?? e.createdAt
    return toMillis(t) ? formatWita(t) : '—'
  }

  return (
    <Card
      title="Database Karyawan"
      subtitle="Terhubung langsung dengan Profil Saya: perubahan nama, no. HP, dan email dari pengguna muncul di sini."
      actions={
        <div className="tools">
          <div className="search">
            <Icon name="search" />
            <input
              className="in"
              placeholder="Cari nama, username, HP, email…"
              aria-label="Cari karyawan"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="sel"
            aria-label="Filter role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Semua role</option>
            {(data.data?.roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="sel"
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Semua status</option>
            <option value="on">Aktif</option>
            <option value="off">Nonaktif</option>
          </select>
          {(data.data?.projects.length ?? 0) > 0 && (
            <select
              className="sel"
              aria-label="Filter proyek"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Semua proyek</option>
              {data.data?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {canExport && (
            <>
              <Button size="sm" onClick={() => void doExport('xlsx')} disabled={!!busy || rows.length === 0}>
                <Icon name="xls" />
                {busy === 'xlsx' ? 'Menyiapkan…' : 'Excel'}
              </Button>
              <Button size="sm" onClick={() => void doExport('pdf')} disabled={!!busy || rows.length === 0}>
                {busy === 'pdf' ? 'Menyiapkan…' : 'PDF'}
              </Button>
            </>
          )}
        </div>
      }
      flush
    >
      {data.error ? (
        <EmptyState icon="alert" title="Database karyawan tidak dapat dimuat">
          {data.error}
        </EmptyState>
      ) : data.loading && !data.data ? (
        <EmptyState icon="id" title="Memuat…" />
      ) : rows.length === 0 ? (
        <EmptyState icon="id" title="Tidak ditemukan">
          Tidak ada akun yang cocok dengan pencarian dan filter.
        </EmptyState>
      ) : (
        <ScrollTable label="Database karyawan">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Username</th>
                <th>No. HP</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Terakhir diperbarui</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="wrap">
                    <div className="person">
                      <span className="av" aria-hidden="true">
                        {initials(e.name)}
                      </span>
                      <b>{e.name}</b>
                    </div>
                  </td>
                  <td>@{e.username}</td>
                  <td className="num">{e.phone || '—'}</td>
                  <td>{e.emailContact || '—'}</td>
                  <td>
                    <Pill tone="blue">{roleName(e.roleId)}</Pill>
                  </td>
                  <td>{e.disabled ? <Pill tone="mute">Nonaktif</Pill> : <Pill tone="ok">Aktif</Pill>}</td>
                  <td className="sm">
                    {e.updatedByName || e.createdByName || '—'}
                    <div className="muted">{when(e)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
    </Card>
  )
}
