import { describe, expect, it } from 'vitest'
import { APP_VERSION, footerText } from './version'

describe('versi dan footer', () => {
  it('versi berformat vX.X.X', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/)
  })
  it('footer sesuai ketentuan pemilik', () => {
    expect(footerText('v1.2.3')).toBe(
      '© Copyright 2026 | PT. Wiratama Karya Nugraha | Dibuat di Makassar | @reza4official_ | v1.2.3',
    )
  })
})
