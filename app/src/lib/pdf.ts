/** PDF ekspor berkop (jsPDF dimuat hanya saat diperlukan). */
import type { ExportMeta, Table } from './exportTables'

const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 })

export async function buildPdf(m: ExportMeta, tables: Table[], logoDataUrl?: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  let x = 40
  if (logoDataUrl) {
    try {
      const p = doc.getImageProperties(logoDataUrl)
      const h = 36
      doc.addImage(logoDataUrl, 'PNG', 40, 28, (p.width / p.height) * h, h)
      x = 40 + (p.width / p.height) * h + 14
    } catch {
      /* logo gagal dibaca: tetap cetak tanpa logo */
    }
  }
  doc.setFont('helvetica', 'bold').setFontSize(14).text(`PT. Wiratama Karya Nugraha — ${m.title}`, x, 44)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(`Proyek: ${m.project}   |   Periode: ${m.period}`, x, 58)
  doc.text(`Dibuat oleh: ${m.by} (${m.role})   |   Dicetak: ${m.printedAt}`, x, 70)
  let y = 90
  for (const t of tables) {
    doc.setFont('helvetica', 'bold').setFontSize(11).text(t.title, 40, y)
    autoTable(doc, {
      startY: y + 6,
      head: [t.head],
      body: t.rows.map((r) => r.map((v) => (v === null ? '' : typeof v === 'number' ? fmtNum(v) : v))),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 20, 224], textColor: 255 },
      columnStyles: Object.fromEntries(t.numeric.map((i) => [i, { halign: 'right' }])),
      margin: { left: 40, right: 40, bottom: 36 },
      didDrawPage: () => {
        const n = doc.getNumberOfPages()
        doc.setFont('helvetica', 'normal').setFontSize(8)
        doc.text(
          `© Copyright 2026 | PT. Wiratama Karya Nugraha | Halaman ${n}`,
          W / 2,
          doc.internal.pageSize.getHeight() - 18,
          { align: 'center' },
        )
      },
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 24
  }
  return doc.output('blob')
}
