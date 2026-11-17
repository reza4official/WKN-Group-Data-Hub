import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger'
  size?: 'md' | 'sm'
  iconOnly?: boolean
  children: ReactNode
}

export function Button({
  variant = 'default',
  size = 'md',
  iconOnly,
  className,
  type = 'button',
  ...rest
}: Props) {
  const cls = [
    'btn',
    variant === 'primary' && 'pri',
    variant === 'danger' && 'bad',
    size === 'sm' && 'sm',
    iconOnly && 'ico',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={cls} {...rest} />
}
