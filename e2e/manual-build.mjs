// Menyusun Manual Book dari docs/manual/MANUAL-BOOK.md + docs/manual/shots.json + docs/manual/img/*.png
// menjadi MANUAL-BOOK.html (satu berkas, gambar tertanam) dan MANUAL-BOOK.pdf (A4, nomor halaman, daftar isi berhalaman).
// Pakai:  node manual-build.mjs   (butuh playwright dan pdftotext)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const REPO = process.env.REPO_DIR ?? new URL('..', import.meta.url).pathname
const DIR = `${REPO}docs/manual`
const md = readFileSync(`${DIR}/MANUAL-BOOK.md`, 'utf8').split('\n')
const SPEC = JSON.parse(readFileSync(`${DIR}/shots.json`, 'utf8'))
const VERSION = JSON.parse(readFileSync(`${REPO}app/package.json`, 'utf8')).version
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const w = new Date(Date.now() + 8 * 3_600_000)
const DATE = `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}`

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s<)]+)/g, '<span class="url">$1</span>')
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

let figN = 0
const missing = []
const usedFigs = new Set()
const figure = (key) => {
  const sp = SPEC[key]
  const file = `${DIR}/img/${key}.png`
  if (!sp || !existsSync(file)) { missing.push(key); return `<p class="warn">[gambar ${key} belum ada]</p>` }
  usedFigs.add(key)
  figN++
  const buf = readFileSync(file)
  const cssW = Math.round(buf.readUInt32BE(16) / 1.5) // lebar piksel PNG (IHDR) dibagi skala tangkapan 1,5
  const b64 = buf.toString('base64')
  const legend = sp.marks.length
    ? `<ol class="legend">${sp.marks.map((m) => `<li><span class="mk">${m.n}</span>${inline(m.label)}</li>`).join('')}</ol>`
    : ''
  return `<figure><img src="data:image/png;base64,${b64}" style="width:min(100%,${cssW}px)" alt="${esc(sp.caption)}"><figcaption><b>Gambar ${figN}.</b> ${inline(sp.caption)}${legend}</figcaption></figure>`
}

const heads = []
let out = ''
let i = 0
const isTable = (l) => l.trim().startsWith('|')
while (i < md.length) {
  const l = md[i]
  if (!l.trim()) { i++; continue }
  let m
  if (l.trim() === '<!--pagebreak-->') { out += '<div class="pb"></div>'; i++; continue }
  if (l.trim() === '{{toc}}') { out += '<!--TOC-->'; i++; continue }
  if ((m = l.match(/^\{\{fig:([a-z0-9-]+)\}\}$/))) { out += figure(m[1]); i++; continue }
  if ((m = l.match(/^(#{1,3}) (.+)$/))) {
    const lvl = m[1].length
    const id = `h-${heads.length}-${slug(m[2])}`
    if (lvl <= 2 && !(lvl === 1 && heads.length === 0 && /^Manual Book/.test(m[2]))) heads.push({ lvl, id, text: m[2] })
    out += lvl === 1 && /^Manual Book/.test(m[2]) ? `<h1 class="cover-title">${inline(m[2])}</h1>` : `<h${lvl} id="${id}">${inline(m[2])}</h${lvl}>`
    i++
    continue
  }
  if (isTable(l)) {
    const rows = []
    while (i < md.length && isTable(md[i])) rows.push(md[i++])
    const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const head = cells(rows[0])
    const body = rows.slice(2).map(cells)
    out += `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    continue
  }
  if (l.startsWith('>')) {
    const buf = []
    while (i < md.length && md[i].startsWith('>')) buf.push(md[i++].replace(/^>\s?/, ''))
    const t = buf.join(' ')
    const cls = /^\*\*Perhatian/.test(t) ? 'warn' : /^\*\*Tips/.test(t) ? 'tip' : 'note'
    out += `<div class="callout ${cls}">${inline(t)}</div>`
    continue
  }
  if (/^- /.test(l)) {
    const items = []
    while (i < md.length && /^- /.test(md[i])) items.push(md[i++].slice(2))
    out += `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`
    continue
  }
  if (/^\d+\. /.test(l)) {
    const items = []
    while (i < md.length && /^\d+\. /.test(md[i])) items.push(md[i++].replace(/^\d+\. /, ''))
    out += `<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`
    continue
  }
  const buf = []
  while (i < md.length && md[i].trim() && !/^(#|\||>|- |\d+\. |\{\{|<!--)/.test(md[i])) buf.push(md[i++])
  if (buf.length === 0) { buf.push(md[i++]) }
  const cls = buf.length === 1 && /^PT\./.test(buf[0]) ? ' class="cover-sub"' : buf.length === 1 && /^\*\*Panduan lengkap/.test(buf[0]) ? ' class="cover-tag"' : ''
  out += `<p${cls}>${inline(buf.join(' '))}</p>`
}

const unusedFigs = Object.keys(SPEC).filter((k) => !usedFigs.has(k))
const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm }
*{box-sizing:border-box}
body{font:10.5pt/1.5 "Segoe UI",Carlito,Calibri,Arial,sans-serif;color:#1b2330;margin:0}
h1{font-size:20pt;margin:0 0 10px;padding-bottom:6px;border-bottom:3px solid #1414e0;page-break-before:always;color:#0e0e8f}
h1.cover-title{border:0;page-break-before:avoid;font-size:30pt;margin-top:70mm;color:#1414e0}
h2{font-size:14pt;margin:20px 0 6px;color:#16206b;break-after:avoid}
h3{font-size:11.5pt;margin:14px 0 4px;break-after:avoid}
p{margin:6px 0}.cover-tag{font-size:14pt;color:#334}.cover-sub{margin-top:30mm;font-size:12pt}
.pb{page-break-after:always}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9.5pt;break-inside:auto}
th{background:#1414e0;color:#fff;text-align:left;padding:5px 7px}
td{border:1px solid #d5d9e2;padding:5px 7px;vertical-align:top}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f4f6fb}
code{background:#eef0f6;padding:1px 4px;border-radius:3px;font:9pt Consolas,monospace}
ul,ol{margin:6px 0 6px 20px;padding:0}li{margin:2px 0}
.callout{margin:10px 0;padding:8px 12px;border-left:5px solid #1414e0;background:#eef1ff;border-radius:4px;break-inside:avoid}
.callout.tip{border-color:#17803d;background:#ecf8ef}.callout.warn{border-color:#c2410c;background:#fff1e8}
figure{margin:12px 0;break-inside:avoid;border:1px solid #d5d9e2;border-radius:8px;padding:8px;background:#fff}
figure img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:4px}
figcaption{margin-top:8px;font-size:9.5pt}
.legend{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}
.legend li{display:flex;gap:6px;align-items:flex-start;margin:0}
.mk{flex:none;display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#c2410c;color:#fff;font:700 9pt sans-serif;margin-top:1px}
.toc{margin:0;padding:0;list-style:none}.toc li{display:flex;gap:6px;margin:2px 0}.toc li.l1{margin-top:8px;font-weight:700}.toc li.l2{padding-left:18px;font-size:10pt}
.toc .dots{flex:1;border-bottom:1px dotted #99a;margin-bottom:4px}.toc a{color:inherit;text-decoration:none}
.url{color:#1414e0;word-break:break-all}.warn{color:#b42318}
h1:first-of-type{}
`
const build = (pages) => {
  const toc = `<h1 style="page-break-before:avoid;margin-top:0">Daftar Isi</h1><ul class="toc">${heads.map((h) => `<li class="l${h.lvl}"><a href="#${h.id}">${inline(h.text.replace(/\s*\([①-⑩]\)/g, ''))}</a><span class="dots"></span><span>${pages?.[h.id] ?? ''}</span></li>`).join('')}</ul>`
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Manual Book WKN Group Data Hub v${VERSION}</title><style>${CSS}</style></head><body>${out.replace('<!--TOC-->', toc).replace('Versi aplikasi **v1.0.0**', '')}</body></html>`.replace(/(Versi aplikasi <b>v)[0-9.]+/g, `$1${VERSION}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
const footer = `<div style="font:8pt sans-serif;color:#667;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Manual Book WKN Group Data Hub v${VERSION} · ${DATE}</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>`
const render = async (html, path) => {
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer, margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' } })
}
// putaran 1: tanpa nomor halaman -> cari halaman tiap judul -> putaran 2 dengan nomor
const tmp = '/tmp/manual-pass1.pdf'
await render(build(null), tmp)
const nPages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [tmp]).toString())?.[1] ?? 0)
const pageText = []
for (let p = 1; p <= nPages; p++) pageText.push(execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', tmp, '-']).toString().replace(/\s+/g, ' '))
const pages = {}
let from = 2 // lewati sampul dan daftar isi
for (const h of heads) {
  const needle = h.text.replace(/\s+/g, ' ').slice(0, 40)
  let p = pageText.findIndex((t, idx) => idx >= from - 1 && t.includes(needle) && idx >= 2)
  if (p < 0) p = pageText.findIndex((t, idx) => idx >= 2 && t.includes(needle))
  if (p >= 0) { pages[h.id] = p + 1; from = p + 1 }
}
const html = build(pages)
writeFileSync(`${DIR}/MANUAL-BOOK.html`, html)
await render(html, `${DIR}/MANUAL-BOOK.pdf`)
await browser.close()
console.log(`Halaman: ${nPages}; gambar dipakai: ${usedFigs.size}/${Object.keys(SPEC).length}; judul berhalaman: ${Object.keys(pages).length}/${heads.length}`)
if (missing.length) console.log('GAMBAR HILANG:', missing.join(', '))
if (unusedFigs.length) console.log('GAMBAR TAK DIPAKAI:', unusedFigs.join(', '))
process.exit(missing.length ? 1 : 0)
