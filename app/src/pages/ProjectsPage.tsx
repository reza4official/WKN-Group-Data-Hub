import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { Pill, type PillTone } from '../components/Pill'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { fmtDate } from '../lib/dates'
import { listCompanies, listProjects, type Company, type Project } from '../lib/data'
import { useLoad } from '../lib/useLoad'

const STATUS: Record<Project['status'], { label: string; tone: PillTone }> = {
  berjalan: { label: 'Berjalan', tone: 'ok' },
  ditunda: { label: 'Ditunda', tone: 'warn' },
  selesai: { label: 'Selesai', tone: 'mute' },
}

type Modal =
  { kind: 'company'; company?: Company } | { kind: 'project'; project?: Project; companyId?: string } | null

export function ProjectsPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const seeAll = state.status === 'in' && state.perms.has('projects')
  const mine = state.status === 'in' ? state.profile.projectIds : []
  const companies = useLoad(listCompanies, 'companies')
  const projects = useLoad(() => listProjects(seeAll, mine), `projects:${seeAll}:${mine.join(',')}`)
  const [modal, setModal] = useState<Modal>(null)

  const done = (msg: string) => {
    setModal(null)
    toast(msg)
    companies.reload()
    projects.reload()
  }
  const list = projects.data ?? []
  // Akun berlingkup hanya melihat perusahaan yang memiliki proyek yang ditugaskan kepadanya.
  const cos = (companies.data ?? []).filter((c) => seeAll || list.some((p) => p.companyId === c.id))
  const loading = (companies.loading && !companies.data) || (projects.loading && !projects.data)
  const error = companies.error ?? projects.error

  return (
    <>
      {seeAll && (
        <div className="tools" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setModal({ kind: 'company' })}>
            <Icon name="plus" />
            Tambah perusahaan
          </Button>
          <Button
            variant="primary"
            onClick={() => setModal({ kind: 'project' })}
            disabled={cos.filter((c) => c.active).length === 0}
          >
            <Icon name="plus" />
            Tambah proyek
          </Button>
        </div>
      )}

      {error ? (
        <Card flush>
          <EmptyState icon="alert" title="Data tidak dapat dimuat">
            {error}
          </EmptyState>
        </Card>
      ) : loading ? (
        <Card flush>
          <EmptyState icon="build" title="Memuat…" />
        </Card>
      ) : cos.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="build"
            title={seeAll ? 'Belum ada perusahaan' : 'Belum ada proyek yang ditugaskan kepada Anda'}
          >
            {seeAll
              ? 'Mulai dengan menambahkan perusahaan induk (mis. PT. Wiratama Karya Nugraha), lalu anak perusahaan dan proyeknya.'
              : 'Owner atau Direktur menugaskan Anda ke proyek lewat Akun Pengguna → Ubah → Proyek. Proyek dan perusahaan dibuat oleh pemegang izin "projects".'}
          </EmptyState>
        </Card>
      ) : (
        cos.map((c) => {
          const ps = list.filter((p) => p.companyId === c.id)
          return (
            <Card
              key={c.id}
              title={c.name}
              subtitle={c.active ? undefined : 'Nonaktif'}
              actions={
                <div className="tools">
                  <Pill tone={c.type === 'induk' ? 'blue' : 'mute'}>
                    {c.type === 'induk' ? 'Induk' : 'Anak'}
                  </Pill>
                  {seeAll && (
                    <Button size="sm" onClick={() => setModal({ kind: 'company', company: c })}>
                      Ubah
                    </Button>
                  )}
                  {seeAll && c.active && (
                    <Button size="sm" onClick={() => setModal({ kind: 'project', companyId: c.id })}>
                      <Icon name="plus" />
                      Proyek
                    </Button>
                  )}
                </div>
              }
            >
              <div className="list">
                {ps.length === 0 && <div className="muted">Belum ada proyek.</div>}
                {ps.map((p) => (
                  <div className="li" key={p.id}>
                    <div className="g">
                      <a href={`#projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>
                        {p.name}
                      </a>
                      <div className="sm muted">
                        {p.location || '—'} · mulai {fmtDate(p.startDate)}
                      </div>
                    </div>
                    {!p.active && <Pill tone="mute">Nonaktif</Pill>}
                    <Pill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Pill>
                    {seeAll && (
                      <Button size="sm" onClick={() => setModal({ kind: 'project', project: p })}>
                        Ubah
                      </Button>
                    )}
                    <a className="btn sm" href={`#projects/${p.id}`}>
                      Barang & saldo awal
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )
        })
      )}

      {modal?.kind === 'company' && (
        <CompanyModal company={modal.company} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.kind === 'project' && (
        <ProjectModal
          project={modal.project}
          companies={(companies.data ?? []).filter((c) => c.active)}
          defaultCompanyId={modal.companyId}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
    </>
  )
}

function useForm(action: () => Promise<string>, onDone: (m: string) => void) {
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

function CompanyModal({
  company,
  onClose,
  onDone,
}: {
  company?: Company
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [name, setName] = useState(company?.name ?? '')
  const [type, setType] = useState<Company['type']>(company?.type ?? 'anak')
  const [active, setActive] = useState(company?.active ?? true)
  const { busy, error, submit } = useForm(async () => {
    if (company) await api('/companies/update', { id: company.id, name, type, active })
    else await api('/companies/create', { name, type })
    return company ? 'Perusahaan diperbarui.' : 'Perusahaan ditambahkan.'
  }, onDone)
  return (
    <Overlay
      title={company ? 'Ubah perusahaan' : 'Tambah perusahaan'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-company" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="f-company" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="co-name">Nama perusahaan</label>
          <input id="co-name" className="in" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="co-type">Jenis</label>
          <select
            id="co-type"
            className="in"
            value={type}
            onChange={(e) => setType(e.target.value as Company['type'])}
          >
            <option value="induk">Induk</option>
            <option value="anak">Anak perusahaan</option>
          </select>
        </div>
        {company && (
          <label className="chk">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>
              <b>Aktif</b>
              <div className="sm muted">Perusahaan dengan proyek aktif tidak dapat dinonaktifkan.</div>
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

function ProjectModal({
  project,
  companies,
  defaultCompanyId,
  onClose,
  onDone,
}: {
  project?: Project
  companies: Company[]
  defaultCompanyId?: string
  onClose: () => void
  onDone: (m: string) => void
}) {
  const [f, setF] = useState({
    companyId: project?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? '',
    name: project?.name ?? '',
    location: project?.location ?? '',
    status: project?.status ?? 'berjalan',
    startDate: project?.startDate ?? '',
  })
  const [active, setActive] = useState(project?.active ?? true)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    const v = e.target.value
    setF((s) => ({ ...s, [k]: v }))
  }
  const { busy, error, submit } = useForm(async () => {
    const body = { ...f, startDate: f.startDate || null }
    if (project)
      await api('/projects/update', {
        id: project.id,
        name: f.name,
        location: f.location,
        status: f.status,
        startDate: body.startDate,
        active,
      })
    else await api('/projects/create', { ...body, startDate: body.startDate ?? undefined })
    return project ? 'Proyek diperbarui.' : 'Proyek dibuat. Tambahkan barang dan saldo awalnya.'
  }, onDone)
  return (
    <Overlay
      title={project ? 'Ubah proyek' : 'Tambah proyek'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-project" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="f-project" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        {!project && (
          <div className="field">
            <label htmlFor="pr-co">Perusahaan</label>
            <select id="pr-co" className="in" value={f.companyId} onChange={set('companyId')}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="pr-name">Nama proyek</label>
          <input id="pr-name" className="in" value={f.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="pr-loc">Lokasi</label>
          <input id="pr-loc" className="in" value={f.location} onChange={set('location')} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="pr-st">Status</label>
            <select id="pr-st" className="in" value={f.status} onChange={set('status')}>
              <option value="berjalan">Berjalan</option>
              <option value="ditunda">Ditunda</option>
              <option value="selesai">Selesai</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pr-sd">Tanggal mulai</label>
            <input id="pr-sd" className="in" type="date" value={f.startDate} onChange={set('startDate')} />
          </div>
        </div>
        {project && (
          <label className="chk">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>
              <b>Aktif</b>
              <div className="sm muted">
                Proyek nonaktif tidak dapat menerima barang baru. Datanya tetap tersimpan.
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
