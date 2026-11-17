import { useId, useState, type InputHTMLAttributes } from 'react'
import { Icon } from './Icon'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; error?: string }

/** Input password dengan ikon mata. Dipakai di semua formulir yang memuat password. */
export function PasswordInput({ label, error, id, ...rest }: Props) {
  const auto = useId()
  const inputId = id ?? auto
  const [shown, setShown] = useState(false)
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="pw">
        <input
          {...rest}
          id={inputId}
          className="in"
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-err` : undefined}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Sembunyikan password' : 'Tampilkan password'}
          aria-pressed={shown}
        >
          <Icon name={shown ? 'eyeoff' : 'eye'} />
        </button>
      </div>
      {error && (
        <div className="err" id={`${inputId}-err`} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
