import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { PasswordInput } from '../components/PasswordInput'
import { Pill } from '../components/Pill'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { listResetRequests, listRoles, type ResetRequest } from '../lib/data'
import { formatWita, toMillis } from '../lib/time'
import { useLoad } from '../lib/useLoad'

export function ResetsPage() {
  const { state } = useAuth()
  const { toast } = useToast()
  const level = state.status === 'in' ? state.profile.level : 0
  const reqs = useLoad(() => listResetRequests(level), `resets:${level}`)
  const roles = useLoad(listRoles, 'roles')
  const [target, setTarget] = useState<ResetRequest | null>(null)

  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? id
  const sorted = [...(reqs.data ?? [])].sort(
    (a, b) =>
      Number(b.status === 'pending') - Number(a.status === 'pending') ||
      toMillis(b.requestedAt) - toMillis(a.requestedAt),
  )

  return (
    <>
      <Card
        title="Permintaan reset password"
        subtitle="Siapa pun di level atas pemohon dapat mengeksekusi. Pelaku, tanggal, dan jam tercatat permanen."
        actions={
          <Button size="sm" onClick={reqs.reload} disabled={reqs.loading}>
            Muat ulang
          </Button>
        }
      >
        {reqs.error ? (
          <EmptyState icon="alert" title="Permintaan tidak dapat dimuat">
            {reqs.error}
          </EmptyState>
        ) : reqs.loading && !reqs.data ? (
          <EmptyState icon="key" title="Memuat…" />
        ) : sorted.length === 0 ? (
          <EmptyState icon="key" title="Belum ada permintaan">
            Permintaan dari pengguna di bawah level Anda akan muncul di sini.
          </EmptyState>
        ) : (
          <div className="list">
            {sorted.map((r) => (
              <div className="li" key={r.id}>
                <span className="av" aria-hidden="true">
                  {(r.targetName || r.targetUsername).slice(0, 2).toUpperCase()}
                </span>
                <div className="g">
                  <b>{r.targetName || r.targetUsername}</b> <span className="muted">@{r.targetUsername}</span>
                  <div className="sm muted">
                    {roleName(r.targetRoleId)} · diminta {formatWita(r.requestedAt)}
                  </div>
                  {r.status === 'done' && (
                    <div className="sm ok-text">
                      <Icon name="check" /> Dieksekusi oleh <b>{r.handledByName}</b>
                      {r.handledByRole ? ` (${r.handledByRole})` : ''} pada {formatWita(r.handledAt)}
                    </div>
                  )}
                </div>
                {r.status === 'pending' ? (
                  <Button variant="primary" size="sm" onClick={() => setTarget(r)}>
                    Eksekusi reset
                  </Button>
                ) : (
                  <Pill tone="ok">Selesai</Pill>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {target && (
        <ExecuteModal
          req={target}
          onClose={() => setTarget(null)}
          onDone={(m) => {
            setTarget(null)
            toast(m)
            reqs.reload()
          }}
          onConflict={(m) => {
            setTarget(null)
            toast(m)
            reqs.reload()
          }}
        />
      )}
    </>
  )
}

function ExecuteModal({
  req,
  onClose,
  onDone,
  onConflict,
}: {
  req: ResetRequest
  onClose: () => void
  onDone: (m: string) => void
  onConflict: (m: string) => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/resets/execute', { id: req.id, password })
      onDone(`Password @${req.targetUsername} diganti. Tercatat atas nama Anda.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal.'
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'already_handled'
      )
        onConflict(msg)
      else setError(msg)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Overlay
      title={`Eksekusi reset · @${req.targetUsername}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" form="f-exec" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan password baru'}
          </Button>
        </>
      }
    >
      <form id="f-exec" className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <div className="hint">
          Anda akan tercatat sebagai pelaku, lengkap dengan tanggal dan jam. Sampaikan password baru langsung
          kepada pemohon.
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
