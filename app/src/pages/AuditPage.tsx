import { useState } from 'react'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Button } from '../components/Button'
import { Pill, type PillTone } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { listAudit, type AuditRow } from '../lib/data'
import { summarize } from '../lib/auditSummary'
import { formatWita } from '../lib/time'
import { useLoad } from '../lib/useLoad'

const ACTIONS: Record<string, { label: string; tone: PillTone }> = {
  'user.create': { label: 'Tambah akun', tone: 'blue' },
  'user.update': { label: 'Ubah akun', tone: 'blue' },
  'user.disable': { label: 'Nonaktifkan akun', tone: 'warn' },
  'user.enable': { label: 'Aktifkan akun', tone: 'ok' },
  'user.delete': { label: 'Hapus akun', tone: 'bad' },
  'user.reset_password': { label: 'Reset password', tone: 'warn' },
  'user.reset_password_failed': { label: 'Reset password gagal (dibatalkan)', tone: 'bad' },
  'reset.request': { label: 'Minta reset password', tone: 'mute' },
  'role.create': { label: 'Tambah role', tone: 'blue' },
  'role.update': { label: 'Ubah role', tone: 'blue' },
  'role.delete': { label: 'Hapus role', tone: 'bad' },
  'company.create': { label: 'Tambah perusahaan', tone: 'blue' },
  'company.update': { label: 'Ubah perusahaan', tone: 'blue' },
  'project.create': { label: 'Tambah proyek', tone: 'blue' },
  'project.update': { label: 'Ubah proyek', tone: 'blue' },
  'catalog.create': { label: 'Tambah barang katalog', tone: 'blue' },
  'catalog.update': { label: 'Ubah barang katalog', tone: 'blue' },
  'item.add': { label: 'Tambah barang ke proyek', tone: 'blue' },
  'item.set_opening': { label: 'Atur saldo awal', tone: 'warn' },
  'item.update': { label: 'Ubah barang proyek', tone: 'blue' },
  'project.delete_start': { label: 'Mulai hapus proyek', tone: 'warn' },
  'project.purge': { label: 'Bersihkan data proyek', tone: 'warn' },
  'project.delete': { label: 'Hapus proyek (permanen)', tone: 'bad' },
  'company.delete_start': { label: 'Mulai hapus perusahaan', tone: 'warn' },
  'company.purge': { label: 'Bersihkan data perusahaan', tone: 'warn' },
  'company.delete': { label: 'Hapus perusahaan (permanen)', tone: 'bad' },
  'catalog.delete': { label: 'Hapus barang katalog', tone: 'bad' },
  'backup.run': { label: 'Jalankan cadangan Sheets', tone: 'blue' },
  'catalog.import': { label: 'Impor katalog', tone: 'blue' },
  'item.import': { label: 'Impor saldo awal', tone: 'blue' },
  'profile.update': { label: 'Ubah data diri', tone: 'blue' },
  'profile.change_password': { label: 'Ganti password sendiri', tone: 'warn' },
  'profile.change_password_failed': { label: 'Ganti password sendiri gagal', tone: 'bad' },
  'ledger.import': { label: 'Impor transaksi', tone: 'blue' },
  'ledger.in': { label: 'Barang masuk', tone: 'ok' },
  'ledger.out': { label: 'Barang keluar', tone: 'warn' },
  'ledger.correct': { label: 'Koreksi transaksi', tone: 'bad' },
}

function match(a: AuditRow, q: string): boolean {
  const hay =
    `${a.actorName} ${a.actorUsername} ${ACTIONS[a.action]?.label ?? a.action} ${a.targetLabel} ${summarize(a.detail)}`.toLowerCase()
  return hay.includes(q)
}

export function AuditPage() {
  const log = useLoad(() => listAudit(200), 'audit')
  const [q, setQ] = useState('')
  const rows = (log.data ?? []).filter((a) => match(a, q.trim().toLowerCase()))
  return (
    <Card
      title="Log audit"
      subtitle="Hanya bisa bertambah. Tidak ada yang dapat mengubah atau menghapus catatan. Waktu dalam WITA."
      flush
      actions={
        <div className="tools">
          <div className="search">
            <Icon name="search" />
            <input
              className="in"
              placeholder="Cari pelaku atau aksi…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Cari log"
            />
          </div>
          <Button size="sm" onClick={log.reload} disabled={log.loading}>
            Muat ulang
          </Button>
        </div>
      }
    >
      {log.error ? (
        <EmptyState icon="alert" title="Log tidak dapat dimuat">
          {log.error}
        </EmptyState>
      ) : log.loading && !log.data ? (
        <EmptyState icon="log" title="Memuat…" />
      ) : rows.length === 0 ? (
        <EmptyState icon="log" title={q ? 'Tidak ada catatan yang cocok' : 'Belum ada catatan'} />
      ) : (
        <ScrollTable label="Log audit">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pelaku</th>
                <th>Aksi</th>
                <th>Target</th>
                <th>Rincian</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const act = ACTIONS[a.action] ?? { label: a.action, tone: 'mute' as PillTone }
                return (
                  <tr key={a.id}>
                    <td className="num sm">{formatWita(a.at)}</td>
                    <td>
                      <b>{a.actorName}</b>
                      <div className="sm muted">{a.actorRole}</div>
                    </td>
                    <td>
                      <Pill tone={act.tone}>{act.label}</Pill>
                    </td>
                    <td>{a.targetLabel}</td>
                    <td className="wrap sm muted">{summarize(a.detail)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollTable>
      )}
    </Card>
  )
}
