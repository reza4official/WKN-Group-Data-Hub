import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { QuotaBanner } from '../components/QuotaBanner'
import { ToastProvider } from '../components/Toast'
import { fakeAuth } from '../test-utils'
import { BackupPage } from './BackupPage'

const mocks = vi.hoisted(() => ({ api: vi.fn(), getBackupStatus: vi.fn(), getUsage: vi.fn() }))
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class extends Error {} }))
vi.mock('../lib/data', () => ({ getBackupStatus: mocks.getBackupStatus, getUsage: mocks.getUsage }))

const ME = {
  uid: 'me',
  username: 'own',
  name: 'Owner',
  phone: '',
  emailContact: '',
  roleId: 'owner',
  level: 90,
  projectIds: [] as string[],
}
const as = (perms: string[]) =>
  fakeAuth({ state: { status: 'in', profile: ME, roleName: 'Owner', perms: new Set(perms) } })
const wrap = (ui: ReactNode, perms = ['audit']) =>
  render(
    <AuthContext.Provider value={as(perms)}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  )

const B = (o = {}) => ({
  lastStatus: 'ok',
  lastRunAt: '2026-11-18T19:00:00Z',
  lastOkAt: '2026-11-18T19:00:00Z',
  lastError: '',
  lastTrigger: 'cron',
  counts: { Transaksi: 1234, Pengguna: 7 },
  ...o,
})
const U = (o = {}) => ({
  status: 'ok',
  at: '2026-11-18T12:00:00Z',
  windowStart: '2026-11-18T08:00:00Z',
  reads: 10000,
  writes: 500,
  deletes: 0,
  limits: { reads: 50000, writes: 20000, deletes: 20000 },
  reason: '',
  ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.mockResolvedValue({ ok: true })
  mocks.getBackupStatus.mockResolvedValue(B())
  mocks.getUsage.mockResolvedValue(U())
})

describe('Cadangan & Kuota', () => {
  it('status berhasil: waktu WITA, sumber otomatis, jumlah baris per lembar', async () => {
    wrap(<BackupPage />)
    await screen.findByText('Berhasil')
    expect(screen.getByText(/Berhasil terakhir/).parentElement?.textContent).toMatch(/WITA.*otomatis/s)
    expect(screen.getByText(/Transaksi:/).textContent).toContain('1.234')
  })

  it.each([
    ['partial', /Sebagian/],
    ['error', /Gagal/],
    ['never', /Belum pernah berjalan/],
  ])('status %s ditampilkan', async (st, label) => {
    mocks.getBackupStatus.mockResolvedValue(
      B({ lastStatus: st, lastError: st === 'error' ? 'Apps Script menolak: unauthorized' : '' }),
    )
    wrap(<BackupPage />)
    await screen.findByText(label)
    if (st === 'error') expect(screen.getByRole('alert').textContent).toContain('unauthorized')
  })

  it('belum dikonfigurasi: petunjuk dan tombol nonaktif (bukan galat)', async () => {
    mocks.getBackupStatus.mockResolvedValue(B({ lastStatus: 'unconfigured', lastOkAt: null, counts: {} }))
    wrap(<BackupPage />)
    await screen.findByText(/Cadangan belum dikonfigurasi/)
    expect((screen.getByRole('button', { name: 'Cadangkan sekarang' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Cadangkan sekarang memanggil Worker dan memuat ulang; jeda (429) ditampilkan', async () => {
    wrap(<BackupPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cadangkan sekarang' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/backup/run', {}))
    await waitFor(() => expect(mocks.getBackupStatus).toHaveBeenCalledTimes(2))
    mocks.api.mockRejectedValue(new Error('Cadangan baru saja dijalankan. Coba lagi dalam 200 detik.'))
    fireEvent.click(screen.getByRole('button', { name: 'Cadangkan sekarang' }))
    expect((await screen.findByRole('alert')).textContent).toContain('200 detik')
  })

  it('kuota: persentase, batang berwarna sesuai tingkat, dan keterangan hari Pasifik', async () => {
    mocks.getUsage.mockResolvedValue(U({ reads: 41000, writes: 19500 }))
    wrap(<BackupPage />)
    await screen.findByText('82%')
    expect(screen.getByText('98%')).toBeTruthy()
    const bars = screen.getAllByRole('img')
    expect(bars[0].className).toContain('hi') // 82% peringatan
    expect(bars[1].className).toContain('vh') // 98% kritis
    expect(bars[2].className).not.toMatch(/hi|vh/)
    expect(screen.getByText(/tengah malam waktu Pasifik/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Segarkan' }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/usage/refresh', {}))
  })

  it('kuota tidak tersedia: alasan dan petunjuk, tanpa angka palsu', async () => {
    mocks.getUsage.mockResolvedValue(
      U({
        status: 'unavailable',
        reads: 0,
        reason: 'Akun layanan Worker belum diberi peran Monitoring Viewer di proyek Firebase.',
      }),
    )
    wrap(<BackupPage />)
    await screen.findByText(/Monitoring Viewer/)
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('galat pemuatan ditampilkan', async () => {
    mocks.getBackupStatus.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    wrap(<BackupPage />)
    await screen.findByText('Status cadangan tidak dapat dimuat')
  })
})

describe('QuotaBanner', () => {
  it('muncul pada 80% (status) dan 95% (alert) dengan rincian, hanya untuk pemegang izin audit', async () => {
    mocks.getUsage.mockResolvedValue(U({ reads: 41000 }))
    const a = wrap(<QuotaBanner />)
    await waitFor(() =>
      expect(document.querySelector('.quota-banner')?.textContent).toMatch(/Baca dokumen 82%/),
    )
    expect(document.querySelector('.quota-banner')?.getAttribute('role')).toBe('status')
    a.unmount()
    mocks.getUsage.mockResolvedValue(U({ reads: 49000 }))
    wrap(<QuotaBanner />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/hampir habis.*Baca dokumen 98%/)
  })

  it('tidak muncul di bawah 80%, saat data tidak tersedia, atau bagi akun tanpa izin audit (tanpa membaca apa pun)', async () => {
    const a = wrap(<QuotaBanner />)
    await waitFor(() => expect(mocks.getUsage).toHaveBeenCalled())
    expect(document.querySelector('.quota-banner')).toBeNull()
    a.unmount()
    mocks.getUsage.mockResolvedValue(U({ status: 'unavailable', reads: 99999 }))
    const b = wrap(<QuotaBanner />)
    await waitFor(() => expect(mocks.getUsage).toHaveBeenCalledTimes(2))
    expect(document.querySelector('.quota-banner')).toBeNull()
    b.unmount()
    mocks.getUsage.mockClear()
    wrap(<QuotaBanner />, ['dashboard'])
    await new Promise((r) => setTimeout(r, 30))
    expect(mocks.getUsage).not.toHaveBeenCalled()
  })
})
