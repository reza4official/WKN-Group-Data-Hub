import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Props = { icon: IconName; title: string; children?: ReactNode }

export function EmptyState({ icon, title, children }: Props) {
  return (
    <div className="empty">
      <span className="badge">
        <Icon name={icon} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}
