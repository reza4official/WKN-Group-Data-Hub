import mark from '../assets/logo-mark.png'

export function Logo({ width = 64 }: { width?: number }) {
  return (
    <span className="logo">
      <img src={mark} alt="Logo PT. Wiratama Karya Nugraha" style={{ width }} />
    </span>
  )
}
