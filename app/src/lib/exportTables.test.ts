import { describe, expect, it } from 'vitest'
import { fileSlug, meta, summaryTable, transactionTable } from './exportTables'
import { buildRows, type LedgerEntry } from './ledger'
import { summarizeItem, type DashItem } from './dashboard'

describe('tabel ekspor', () => {
  const item = {
    id: 'i1',
    name: 'Semen',
    unit: 'Sak',
    openingQty: 100,
    openingDate: '2026-09-01',
    currentStock: 140,
  }
  const e = (o: Partial<LedgerEntry>): LedgerEntry => ({
    id: 'e1',
    itemId: 'i1',
    date: '2026-09-10',
    ym: '2026-09',
    type: 'masuk',
    in: 40,
    out: 0,
    seq: 1,
    note: 'Kiriman',
    createdByName: 'Siti',
    createdByRole: 'Admin',
    createdAt: '2026-09-10T02:00:00Z',
    refEntryId: null,
    ...o,
  })
  it('transaksi: kolom sesuai model data, saldo awal dan pencatat ikut', () => {
    const rows = buildRows(
      [item],
      { i1: [{ id: '2026-09', in: 40, out: 0, corrIn: 0, corrOut: 0 }] },
      [e({})],
      '2026-09',
    )
    const t = transactionTable(rows)
    expect(t.head.slice(0, 7)).toEqual([
      'Hari',
      'Tanggal',
      'Nama Barang',
      'Satuan',
      'Masuk',
      'Keluar',
      'Tersisa',
    ])
    expect(t.rows[0][7]).toBe('Saldo awal')
    expect(t.rows[1]).toEqual([
      'Kamis',
      '2026-09-10',
      'Semen',
      'Sak',
      40,
      null,
      140,
      'Kiriman',
      'Siti',
      expect.stringContaining('WITA'),
    ])
  })
  it('ringkasan', () => {
    const d: DashItem = {
      ...item,
      projectId: 'p1',
      category: '',
      minStock: 20,
      lastTxDate: null,
      txCount: 0,
      active: true,
      currentStock: 100,
    }
    const r = summarizeItem(d, [], '2026-11', '2026-11-18')!
    const t = summaryTable([r])
    expect(t.rows[0].slice(0, 6)).toEqual(['Semen', 'Sak', 100, 0, 0, 100])
    expect(t.head).toHaveLength(t.rows[0].length)
  })
  it('meta dan nama berkas', () => {
    expect(meta('T', 'P', 'Nov', 'Budi', 'PM', new Date('2026-11-18T03:00:00Z')).printedAt).toContain('11:00')
    expect(fileSlug('Transaksi', 'Jalan Maros–Pangkep', '2026-11')).toBe(
      'wkn-transaksi-jalan-maros-pangkep-2026-11',
    )
  })
})
