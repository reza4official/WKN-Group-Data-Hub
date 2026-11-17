import { useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { applyTheme, effectiveTheme } from '../lib/theme'

type Props = { crumb: string; title: string; onMenu: () => void; menuOpen: boolean; menuId: string }

export function Topbar({ crumb, title, onMenu, menuOpen, menuId }: Props) {
  const [, force] = useState(0)
  const toggleTheme = () => {
    applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark')
    force((n) => n + 1)
  }
  return (
    <header className="top">
      <Button
        className="burger"
        iconOnly
        onClick={onMenu}
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
      >
        <Icon name="menu" />
      </Button>
      <h1>
        <span className="crumb">{crumb}</span>
        {title}
      </h1>
      <Button
        className="themebtn"
        iconOnly
        onClick={toggleTheme}
        aria-label={effectiveTheme() === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
        title="Ganti tema"
      >
        <Icon name="sun" />
      </Button>
    </header>
  )
}
