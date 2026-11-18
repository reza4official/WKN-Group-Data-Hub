import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { getUsage, type UsageStatus } from '../lib/data'
import { worstLevel } from '../lib/quota'

const fmt = (n: number) => n.toLocaleString('id-ID')

/**
 * Peringatan kuota harian Firestore. Hanya untuk pemegang izin "audit" (satu pembacaan dokumen per pemuatan aplikasi);
 * akun lain tidak membaca apa pun. Muncul pada 80% (peringatan) dan 95% (kritis) dari kuota baca, tulis, atau hapus.
 */
export function QuotaBanner() {
  const { state } = useAuth()
  const allowed = state.status === 'in' && state.perms.has('audit')
  const [usage, setUsage] = useState<UsageStatus>()
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    getUsage()
      .then((u) => !cancelled && setUsage(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [allowed])
  const { level, items } = worstLevel(usage)
  if (!allowed || level === 'ok') return null
  const hot = items.filter((i) => i.level !== 'ok')
  return (
    <div className={`quota-banner ${level}`} role={level === 'bad' ? 'alert' : 'status'}>
      <b>
        {level === 'bad' ? 'Kuota harian Firestore hampir habis.' : 'Kuota harian Firestore mulai tinggi.'}
      </b>{' '}
      {hot.map((i) => `${i.label} ${Math.round(i.pct)}% (${fmt(i.used)} dari ${fmt(i.limit)})`).join(' · ')}.{' '}
      <a href="#backup">Lihat rincian</a>
    </div>
  )
}
