/** 2026-09-01 -> 1 Sep 2026 */
export const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][
    Number(m) - 1
  ]
  return `${Number(day)} ${mon} ${y}`
}
