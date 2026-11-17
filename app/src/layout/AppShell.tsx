import { useEffect, useState, type ReactNode } from 'react'
import { COMPANY } from '../lib/version'
import { Footer } from './Footer'
import { Sidebar } from './Sidebar'
import type { RouteDef } from './routes'
import { Topbar } from './Topbar'

type Props = { routes: RouteDef[]; current: string; title: string; children: ReactNode }

export function AppShell({ routes, current, title, children }: Props) {
  const [open, setOpen] = useState(false)
  const [prev, setPrev] = useState(current)
  // Menu seluler menutup sendiri saat berpindah halaman (disetel saat render, bukan di efek).
  if (prev !== current) {
    setPrev(current)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="app">
      <Sidebar id="sidebar" routes={routes} current={current} open={open} />
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <Topbar
          crumb={COMPANY}
          title={title}
          menuId="sidebar"
          menuOpen={open}
          onMenu={() => setOpen((v) => !v)}
        />
        <main className="content" id="konten" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
