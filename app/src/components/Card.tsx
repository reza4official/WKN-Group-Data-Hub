import type { ReactNode } from 'react'

type Props = { title?: string; subtitle?: string; actions?: ReactNode; children?: ReactNode; flush?: boolean }

export function Card({ title, subtitle, actions, children, flush }: Props) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="hd">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="sm muted">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      {flush ? children : <div className="bd">{children}</div>}
    </section>
  )
}
