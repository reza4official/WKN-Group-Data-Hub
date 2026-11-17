import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { ROUTES } from './layout/routes'
import { footerText } from './lib/version'

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

describe('kerangka aplikasi', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('id rute unik', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length)
  })

  it('membuka Dashboard secara bawaan dan menampilkan footer berversi', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Dashboard')
    expect(screen.getByText(footerText())).toBeTruthy()
  })

  it('setiap menu membuka halaman dengan judul yang sesuai', () => {
    render(<App />)
    for (const r of ROUTES) {
      go(r.id)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(r.label)
      expect(screen.getByRole('link', { name: r.label }).getAttribute('aria-current')).toBe('page')
    }
  })

  it('rute tak dikenal kembali ke Dashboard', () => {
    render(<App />)
    go('tidak-ada')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Dashboard')
  })
})
