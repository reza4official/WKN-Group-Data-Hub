/** Grafik SVG ringan (tanpa pustaka): warna dari token tema, dapat dibaca di mode terang dan gelap. */

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 })

function niceScale(max: number, n = 4): { top: number; ticks: number[] } {
  const m = Math.max(max, 1e-9)
  const raw = m / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
  const top = Math.ceil(m / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { top, ticks }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const dShort = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
const mShort = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

const W = 480

/** Sisa stok harian dengan garis batas minimum. */
export function StockLine({
  series,
  min,
  label,
}: {
  series: { date: string; value: number }[]
  min: number
  label: string
}) {
  const H = 250
  const L = 44
  const R = 12
  const T = 14
  const B = 26
  const iw = W - L - R
  const ih = H - T - B
  const n = series.length
  const sc = niceScale(Math.max(...series.map((s) => s.value), min * 1.15, 1))
  const X = (i: number) => L + (n <= 1 ? 0 : (i * iw) / (n - 1))
  const Y = (v: number) => T + ih - (v / sc.top) * ih
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(s.value).toFixed(1)}`).join('')
  const area = `${line}L${X(n - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z`
  const last = series[n - 1]?.value ?? 0
  const low = last <= min
  const ticksX = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {sc.ticks.map((v) => (
        <g key={v}>
          <line
            x1={L}
            x2={W - R}
            y1={Y(v)}
            y2={Y(v)}
            stroke="var(--line)"
            strokeWidth={v === 0 ? 1.2 : 0.6}
            strokeDasharray={v === 0 ? undefined : '3 3'}
          />
          <text x={L - 6} y={Y(v) + 3.5} fontSize="11.5" fill="var(--fg-3)" textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--wkn)" opacity=".12" />
      {min > 0 && (
        <>
          <line
            x1={L}
            x2={W - R}
            y1={Y(min)}
            y2={Y(min)}
            stroke="var(--bad)"
            strokeWidth="1.4"
            strokeDasharray="5 4"
          />
          <text
            x={L + 6}
            y={Y(min) - 6}
            fontSize="11.5"
            fontWeight="700"
            fill="var(--bad)"
            stroke="var(--surface)"
            strokeWidth="4"
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            Batas minimum {fmt(min)}
          </text>
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke="var(--wkn)"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {series.map((s, i) => (
        <circle key={s.date} cx={X(i)} cy={Y(s.value)} r="9" fill="transparent">
          <title>{`${dShort(s.date)}: ${fmt(s.value)}`}</title>
        </circle>
      ))}
      <circle
        cx={X(n - 1)}
        cy={Y(last)}
        r="5"
        fill={low ? 'var(--bad)' : 'var(--wkn-or)'}
        stroke={low ? 'var(--surface)' : 'var(--wkn)'}
        strokeWidth="2"
      />
      <text
        x={X(n - 1) - 9}
        y={Y(last) + (Y(last) < T + 22 ? 18 : -10)}
        fontSize="11"
        fontWeight="700"
        fill={low ? 'var(--bad)' : 'var(--wkn)'}
        stroke="var(--surface)"
        strokeWidth="4"
        paintOrder="stroke"
        textAnchor="end"
      >
        {fmt(last)}
      </text>
      {ticksX.map((i, k) => (
        <text
          key={`${i}-${k}`}
          x={X(i)}
          y={H - 7}
          fontSize="11.5"
          fill="var(--fg-3)"
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
        >
          {i === n - 1 ? 'Hari ini' : dShort(series[i].date)}
        </text>
      ))}
    </svg>
  )
}

/** Batang berpasangan masuk (hijau) dan keluar (merah) per bulan. */
export function MonthBars({
  data,
  label,
}: {
  data: { ym: string; masuk: number; keluar: number }[]
  label: string
}) {
  const H = 230
  const L = 44
  const R = 8
  const T = 10
  const B = 26
  const iw = W - L - R
  const ih = H - T - B
  const sc = niceScale(Math.max(...data.flatMap((d) => [d.masuk, d.keluar]), 1))
  const Y = (v: number) => T + ih - (v / sc.top) * ih
  const gw = iw / data.length
  const bw = Math.min(26, gw * 0.32)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {sc.ticks.map((v) => (
        <g key={v}>
          <line
            x1={L}
            x2={W - R}
            y1={Y(v)}
            y2={Y(v)}
            stroke="var(--line)"
            strokeWidth={v === 0 ? 1.2 : 0.6}
            strokeDasharray={v === 0 ? undefined : '3 3'}
          />
          <text x={L - 6} y={Y(v) + 3.5} fontSize="11.5" fill="var(--fg-3)" textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = L + i * gw + gw / 2
        return (
          <g key={d.ym}>
            <rect
              x={cx - bw - 1.5}
              y={Y(d.masuk)}
              width={bw}
              height={Math.max(0, Y(0) - Y(d.masuk))}
              rx="3"
              fill="var(--ok)"
            >
              <title>{`${mShort(d.ym)} masuk: ${fmt(d.masuk)}`}</title>
            </rect>
            <rect
              x={cx + 1.5}
              y={Y(d.keluar)}
              width={bw}
              height={Math.max(0, Y(0) - Y(d.keluar))}
              rx="3"
              fill="var(--bad)"
            >
              <title>{`${mShort(d.ym)} keluar: ${fmt(d.keluar)}`}</title>
            </rect>
            <text x={cx} y={H - 7} fontSize="11.5" fill="var(--fg-3)" textAnchor="middle">
              {mShort(d.ym)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
