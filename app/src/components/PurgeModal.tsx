import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { Button } from './Button'
import { Overlay } from './Overlay'
import { getBackupStatus, type BackupStatus } from '../lib/data'
import { previewPurge, runPurge, type PurgeKind, type PurgePreview } from '../lib/purge'
import { formatWita, toMillis } from '../lib/time'

const n = (v: number) => v.toLocaleString('id-ID')

/**
 * Penghapusan permanen proyek atau perusahaan (untuk membersihkan data uji). Menampilkan akibatnya, meminta nama diketik
 * ulang, lalu menghapus bertahap dengan kemajuan. Hanya Owner dan Developer (ditegakkan juga oleh server).
 */
export function PurgeModal({
  kind,
  id,
  name,
  onClose,
  onDone,
}: {
  kind: PurgeKind
  id: string
  name: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { state } = useAuth()
  const [pv, setPv] = useState<PurgePreview>()
  const [bk, setBk] = useState<BackupStatus>()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const canSeeBackup = state.status === 'in' && state.perms.has('audit')
  const label = kind === 'project' ? 'proyek' : 'perusahaan'

  useEffect(() => {
    let off = false
    previewPurge(kind, id)
      .then((p) => !off && setPv(p))
      .catch((e: unknown) => !off && setError(e instanceof Error ? e.message : 'Pratinjau gagal dimuat.'))
    if (canSeeBackup) {
      getBackupStatus()
        .then((b) => !off && setBk(b))
        .catch(() => {})
    }
    return () => {
      off = true
    }
  }, [kind, id, canSeeBackup])

  const match = typed.trim() === name.trim() && name.trim() !== ''

  async function go() {
    setBusy(true)
    setError('')
    try {
      await runPurge(kind, id, typed.trim(), (d) => setProgress(d))
      onDone(`${kind === 'project' ? 'Proyek' : 'Perusahaan'} "${name}" dihapus permanen.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Penghapusan gagal.')
      setBusy(false)
    }
  }

  return (
    <Overlay
      title={`Hapus ${label} permanen`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="danger" onClick={() => void go()} disabled={!match || busy || !pv}>
            {busy
              ? `Menghapus… ${n(progress)} dokumen`
              : pv?.deleting
                ? 'Lanjutkan penghapusan'
                : 'Hapus permanen'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          Anda akan menghapus {label} <b>{name}</b>
          {kind === 'company' ? ' beserta SEMUA proyeknya' : ''} <b>secara permanen</b>. Tindakan ini{' '}
          <b>tidak dapat dibatalkan</b>.
        </p>
        {!pv && !error && <div className="muted">Menghitung dampak…</div>}
        {pv && (
          <ul className="sm" style={{ margin: 0, paddingLeft: 18 }}>
            {kind === 'company' && <li>{n(pv.projects)} proyek akan dihapus</li>}
            <li>
              {n(pv.items)} barang proyek dan {n(pv.transactions)} transaksi (beserta total harian dan
              bulanan)
            </li>
            <li>
              {n(pv.users)} akun akan kehilangan penugasan{' '}
              {kind === 'project' ? 'proyek ini' : 'proyek perusahaan ini'} (akun tidak dihapus; yang tidak
              punya proyek lagi hanya dapat dikelola pemegang izin proyek)
            </li>
            <li>Perkiraan {n(pv.estimatedDocs)} dokumen</li>
            <li>Barang katalog tidak ikut terhapus (hapus terpisah di Katalog Barang bila tidak terpakai)</li>
            <li>Log Audit tetap menyimpan riwayatnya (tidak dapat dihapus)</li>
          </ul>
        )}
        {pv?.deleting && (
          <div className="hint" role="status">
            Penghapusan sebelumnya belum selesai. Tekan "Lanjutkan penghapusan" untuk meneruskannya.
          </div>
        )}
        {pv?.overDailyLimit && (
          <div className="form-error" role="alert">
            Perkiraan melebihi batas hapus harian paket gratis (±20.000 dokumen). Penghapusan akan berhenti
            saat kuota habis dan dapat dilanjutkan besok; data yang sudah terhapus tetap terhapus.
          </div>
        )}
        {canSeeBackup && bk && (
          <div className={bk.lastStatus === 'ok' ? 'hint' : 'form-error'} role="status">
            {bk.lastStatus === 'ok' && toMillis(bk.lastOkAt)
              ? `Cadangan Sheets terakhir berhasil: ${formatWita(bk.lastOkAt)}. Cadangan tidak ikut terhapus.`
              : 'Cadangan Sheets belum pernah berhasil. Jalankan cadangan dulu bila ini data nyata.'}
          </div>
        )}
        <div className="field">
          <label htmlFor="purge-name">
            Ketik nama {label} untuk mengonfirmasi: <b>{name}</b>
          </label>
          <input
            id="purge-name"
            className="in"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Overlay>
  )
}
