import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from './PasswordInput'

describe('PasswordInput', () => {
  it('mengikuti autoComplete dari pemakai (agar pengelola password bisa mengisi form login)', () => {
    render(<PasswordInput label="Password" autoComplete="current-password" />)
    expect((screen.getByLabelText('Password') as HTMLInputElement).autocomplete).toBe('current-password')
  })

  it('menampilkan dan menyembunyikan karakter lewat ikon mata', () => {
    render(<PasswordInput label="Password" />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan password' }))
    expect(input.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan password' }))
    expect(input.type).toBe('password')
  })
})
