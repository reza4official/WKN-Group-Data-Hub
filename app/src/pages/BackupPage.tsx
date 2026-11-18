import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Pill, type PillTone } from '../components/Pill'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { getBackupStatus, getUsage, type BackupStatus } from '../lib/data'
import { quotaItems, type QuotaLevel } from '../lib/quota'
import { formatWita, toMillis } from '../lib/time'
import { useLoad } from '../lib/useLoad'

const STATUS: Record<BackupStatus['lastStatus'], { tone: PillTone; label: string }> = {
  ok: { tone: 'ok', label: 'Berhasil' },
  partial: { tone: 'warn', label: 'Sebagian (berlanjut di putaran berikutnya)' },
  error: { tone: 'bad', label: 'Gagal' },
  unconfigured: { tone: 'mute', label: 'Belum dikonfigurasi' },
  never: { tone: 'mute', label: 'Belum pernah berjalan' },
}
const BAR: Record<QuotaLevel, string> = { ok: '', warn: 'hi', bad: 'vh' }
const when = (v: unknown) => (toMillis(v) ? formatWita(v) : '—')

/** Cadangan & Kuota: status cermin Google Sheets dan pemakaian kuota Firestore hari ini (izin "audit"). */
export function BackupPage() {
  const { toast } = useToast()
  const backup = useLoad(getBackupStatus, 'backup-status')
  const usage = useLoad(getUsage, 'usage')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function run(kind: 'backup' | 'usage') {
    setBusy(kind)
    setError('')
    try {
      await api(kind === 'backup' ? '/backup/run' : '/usage/refresh', {})
      toast(kind === 'backup' ? 'Cadangan dijalankan.' : 'Kuota disegarkan.')
      if (kind === 'backup') backup.reload()
      usage.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal.')
    } finally {
      setBusy('')
    }
  }

  const b = backup.data
  const u = usage.data
  return (
    <>
      <Card
        title="Cadangan ke Google Sheets"
        subtitle="Salinan satu arah (bukan sumber kebenaran). Berjalan otomatis tiap hari pukul 03:00 WITA."
        actions={
          <Button
            variant="primary"
            onClick={() => void run('backup')}
            disabled={!!busy || b?.lastStatus === 'unconfigured'}
          >
            {busy === 'backup' ? 'Mencadangkan…' : 'Cadangkan sekarang'}
          </Button>
        }
      >
        {backup.error ? (
          <EmptyState icon="alert" title="Status cadangan tidak dapat dimuat">
            {backup.error}
          </EmptyState>
        ) : !b ? (
          <div className="muted">Memuat…</div>
        ) : (
          <div className="stack">
            <div className="tools">
              <Pill tone={STATUS[b.lastStatus].tone}>{STATUS[b.lastStatus].label}</Pill>
              <span className="sm muted">
                Berhasil terakhir: <b>{when(b.lastOkAt)}</b> · Putaran terakhir: {when(b.lastRunAt)}
                {b.lastTrigger ? ` (${b.lastTrigger === 'cron' ? 'otomatis' : 'manual'})` : ''}
              </span>
            </div>
            {b.lastStatus === 'unconfigured' && (
              <div className="hint" role="status">
                Cadangan belum dikonfigurasi. Pasang web app Apps Script dan dua rahasia Worker
                (BACKUP_WEBHOOK_URL dan BACKUP_SECRET) mengikuti panduan Tahap 9.
              </div>
            )}
            {b.lastError && (
              <div className="form-error" role="alert">
                {b.lastError}
              </div>
            )}
            {Object.keys(b.counts).length > 0 && (
              <div className="sm">
                {Object.entries(b.counts).map(([sheet, n]) => (
                  <span key={sheet} style={{ marginRight: 14 }}>
                    {sheet}: <b className="num">{n.toLocaleString('id-ID')}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="form-error" role="alert" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </Card>

      <Card
        title="Kuota Firestore hari ini"
        subtitle="Paket gratis (Spark). Hari kuota berganti tengah malam waktu Pasifik, bukan WITA."
        actions={
          <Button onClick={() => void run('usage')} disabled={!!busy}>
            {busy === 'usage' ? 'Menyegarkan…' : 'Segarkan'}
          </Button>
        }
      >
        {usage.error ? (
          <EmptyState icon="alert" title="Data kuota tidak dapat dimuat">
            {usage.error}
          </EmptyState>
        ) : !u ? (
          <div className="muted">Memuat…</div>
        ) : u.status !== 'ok' ? (
          <div className="hint" role="status">
            {u.status === 'never'
              ? 'Belum ada data. Pemantau berjalan tiap jam; tekan Segarkan untuk memeriksa sekarang.'
              : u.reason || 'Data kuota tidak tersedia.'}
          </div>
        ) : (
          <div className="hb">
            {quotaItems(u).map((i) => (
              <div className="hr" key={i.key}>
                <div className="hrt">
                  <span>{i.label}</span>
                  <b className="num">{Math.round(i.pct)}%</b>
                </div>
                <div
                  className={`bar ${BAR[i.level]}`}
                  role="img"
                  aria-label={`${i.label}: ${Math.round(i.pct)} persen dari kuota harian`}
                >
                  <i style={{ width: `${Math.min(100, i.pct)}%` }} />
                </div>
                <div className="sm muted num">
                  {i.used.toLocaleString('id-ID')} dari {i.limit.toLocaleString('id-ID')}
                </div>
              </div>
            ))}
            <div className="sm muted">
              Diperbarui {when(u.at)} · hari kuota dimulai {when(u.windowStart)}. Sumber: Cloud Monitoring
              (termasuk bacaan oleh aplikasi di perangkat).
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
