/**
 * "Tunjukkan di aplikasi": membuka halaman lalu menandai elemen yang dimaksud dengan cincin dan balon petunjuk.
 * Hilang sendiri (12 detik), saat Esc, klik di mana saja, atau berpindah halaman.
 */
const RING = 'guide-ring'
const TIP = 'guide-tip'
let stop: (() => void) | null = null

export function clearHint(): void {
  stop?.()
  stop = null
}

async function waitFor(selector: string, ms: number): Promise<Element | null> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise((r) => setTimeout(r, 120))
  }
  return null
}

/** Mengembalikan true bila elemen ditemukan dan ditandai. */
export async function showHint(selector: string, text: string, route?: string): Promise<boolean> {
  clearHint()
  if (route !== undefined && location.hash.replace(/^#/, '').split('/')[0] !== route) location.hash = route
  const el = await waitFor(selector, 5000)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  await new Promise((r) => setTimeout(r, 350))

  const ring = document.createElement('div')
  ring.className = RING
  ring.setAttribute('aria-hidden', 'true')
  const tip = document.createElement('div')
  tip.className = TIP
  tip.setAttribute('role', 'status')
  tip.textContent = text
  document.body.append(ring, tip)

  const place = () => {
    const r = el.getBoundingClientRect()
    ring.style.cssText = `left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px`
    const below = r.bottom + 12 + 80 < innerHeight
    tip.style.top = `${below ? r.bottom + 12 : Math.max(8, r.top - 12 - tip.offsetHeight)}px`
    tip.style.left = `${Math.min(Math.max(8, r.left), innerWidth - tip.offsetWidth - 8)}px`
  }
  place()
  let raf = 0
  const onMove = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(place)
  }
  const done = () => clearHint()
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done()
  const timer = setTimeout(done, 12_000)
  window.addEventListener('scroll', onMove, true)
  window.addEventListener('resize', onMove)
  window.addEventListener('hashchange', done)
  window.addEventListener('keydown', onKey)
  const clickTimer = setTimeout(() => document.addEventListener('click', done, { once: true }), 400)
  stop = () => {
    clearTimeout(timer)
    clearTimeout(clickTimer)
    cancelAnimationFrame(raf)
    window.removeEventListener('scroll', onMove, true)
    window.removeEventListener('resize', onMove)
    window.removeEventListener('hashchange', done)
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('click', done)
    ring.remove()
    tip.remove()
  }
  return true
}
