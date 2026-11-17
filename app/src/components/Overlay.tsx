import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  variant?: 'modal' | 'drawer'
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Modal atau panel samping: Escape menutup, fokus dijaga di dalam, fokus kembali ke pemicu. */
export function Overlay({ title, onClose, children, footer, variant = 'modal' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = box.current
    el?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])

  const drawer = variant === 'drawer'
  return (
    <div
      className={`ov${drawer ? ' end' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        className={drawer ? 'drawer' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mh">
          <h2>{title}</h2>
          <Button size="sm" iconOnly onClick={onClose} aria-label="Tutup">
            <Icon name="x" />
          </Button>
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}
