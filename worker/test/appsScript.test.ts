import { describe, expect, it } from 'vitest'
import { loadAppsScript } from './sheetsFake'

const SECRET = 'rahasia-cadangan-0123456789'
const mk = (props: Record<string, string> = {}) => loadAppsScript({ SECRET, SHEET_ID: 'S1', ...props })
const body = (tables: unknown, secret: unknown = SECRET) => JSON.stringify({ v: 1, secret, tables })
const T = (over: Record<string, unknown>) => ({ sheet: 'X', mode: 'upsert', header: ['ID', 'Nama'], rows: [], ...over })

describe('Code.gs: keamanan', () => {
  it('rahasia salah, kosong, atau berbeda panjang ditolak; tidak ada data tertulis', () => {
    const gs = mk()
    expect(gs.post(JSON.stringify({ v: 1, tables: [T({})] })).error).toBe('unauthorized') // tanpa kunci secret sama sekali
    for (const s of ['salah', '', null, SECRET + 'x', SECRET.slice(1), 123, [SECRET]]) {
      expect(gs.post(body([T({ rows: [['1', 'a']] })], s))).toEqual({ ok: false, error: 'unauthorized' })
    }
    expect(gs.ss.sheets.size).toBe(0)
  })

  it('rahasia di Script Properties kosong atau terlalu pendek: SEMUA permintaan ditolak (gagal tertutup)', () => {
    for (const props of [{ SECRET: '' }, { SECRET: 'pendek' }]) {
      const gs = mk(props)
      expect(gs.post(body([T({})], props.SECRET)).error).toBe('unauthorized')
      expect(gs.post(JSON.stringify({ tables: [T({})] })).error).toBe('unauthorized')
    }
    const gs = loadAppsScript({ SHEET_ID: 'S1' })
    expect(gs.post(body([T({})], '')).error).toBe('unauthorized')
  })

  it('doGet tidak mengembalikan data', () => {
    const gs = mk()
    gs.post(body([T({ rows: [['1', '0812-RAHASIA']] })]))
    const txt = JSON.stringify(gs.get())
    expect(txt).not.toContain('RAHASIA')
    expect(gs.get()).toEqual({ ok: false, error: 'POST saja' })
  })

  it('badan bukan JSON atau tabel tidak valid: galat jelas, tanpa runtuh', () => {
    const gs = mk()
    expect(gs.post('bukan json').ok).toBe(false)
    expect(gs.post(body('x')).error).toContain('tables')
    expect(gs.post(body([T({ mode: 'hapus' })])).error).toContain('mode')
    expect(gs.post(body([T({ sheet: '' })])).error).toContain('lembar')
    expect(gs.post(body([T({ header: [] })])).error).toContain('judul')
    expect(gs.post(body([]))).toMatchObject({ ok: false })
  })

  it('kunci (lock) selalu dilepas, juga saat galat; SHEET_ID tak ada ditolak', () => {
    const gs = mk()
    gs.post(body('x'))
    gs.post(body([T({ rows: [['1', 'a']] })]))
    expect(gs.heldLocks()).toBe(0)
    const noId = loadAppsScript({ SECRET })
    expect(noId.post(body([T({})])).error).toContain('SHEET_ID')
    expect(noId.heldLocks()).toBe(0)
  })

  it('rumus dinetralkan juga di sisi Apps Script (lapisan kedua)', () => {
    const gs = mk()
    gs.post(body([T({ rows: [['1', '=IMPORTXML("http://x")'], ['2', '+62812'], ['3', '@SUM(A1)'], ['4', "'sudah"], ['5', 'aman']] })]))
    expect(gs.ss.data('X').slice(1).map((r) => r[1])).toEqual(["'=IMPORTXML(\"http://x\")", "'+62812", "'@SUM(A1)", "'sudah", 'aman'])
  })
})

describe('Code.gs: mode penulisan', () => {
  it('replace: isi lembar diganti seluruhnya (akun yang dihapus hilang)', () => {
    const gs = mk()
    gs.post(body([T({ mode: 'replace', rows: [['1', 'a'], ['2', 'b']] })]))
    const r = gs.post(body([T({ mode: 'replace', rows: [['2', 'b2']] })]))
    expect(gs.ss.data('X')).toEqual([['ID', 'Nama'], ['2', 'b2']])
    expect(r.counts).toEqual({ X: 1 })
  })

  it('upsert: baris diperbarui menurut kolom pertama, baris baru ditambah, yang tak dikirim dipertahankan', () => {
    const gs = mk()
    gs.post(body([T({ rows: [['1', 'a'], ['2', 'b']] })]))
    gs.post(body([T({ rows: [['2', 'B-baru'], ['3', 'c']] })]))
    expect(gs.ss.data('X')).toEqual([['ID', 'Nama'], ['1', 'a'], ['2', 'B-baru'], ['3', 'c']])
    gs.post(body([T({ rows: [['3', 'c'], ['3', 'c-lagi']] })])) // kembar dalam satu kiriman: yang terakhir menang, tanpa baris ganda
    expect(gs.ss.data('X').filter((r) => r[0] === '3')).toEqual([['3', 'c-lagi']])
  })

  it('append: baris yang kuncinya sudah ada dilewati (idempoten), kembar dalam kiriman tidak ganda, judul ditulis sekali', () => {
    const gs = mk()
    const t = T({ mode: 'append', rows: [['a', '1'], ['b', '2'], ['b', '2']] })
    gs.post(body([t]))
    gs.post(body([t]))
    gs.post(body([{ ...t, rows: [['c', '3'], ['a', 'DIUBAH']] }]))
    expect(gs.ss.data('X')).toEqual([['ID', 'Nama'], ['a', '1'], ['b', '2'], ['c', '3']]) // transaksi tidak pernah ditimpa
  })

  it('baris lebih pendek dari judul dilengkapi; fungsi murni dapat dipanggil langsung', () => {
    const gs = mk()
    gs.post(body([T({ header: ['A', 'B', 'C'], rows: [['1']] })]))
    expect(gs.ss.data('X')[1]).toEqual(['1', '', ''])
    const plan = gs.call('planAppend', ['x'], ['K', 'V'], [['x', 1], ['y', 2]]) as { fresh: unknown[][]; skipped: number }
    expect(plan.fresh).toEqual([['y', 2]])
    expect(plan.skipped).toBe(1)
  })
})
