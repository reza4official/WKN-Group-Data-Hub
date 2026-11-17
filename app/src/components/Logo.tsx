import full from '../assets/logo-full.png'
import mark from '../assets/logo-mark.png'

export function Logo({ width = 64, variant = 'mark' }: { width?: number; variant?: 'mark' | 'full' }) {
  return (
    <span className="logo">
      <img src={variant === 'full' ? full : mark} alt="Logo PT. Wiratama Karya Nugraha" style={{ width }} />
    </span>
  )
}
