import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import type { RouteDef } from './routes'

type Props = { routes: RouteDef[]; current: string; open: boolean; id: string }

function groupRoutes(routes: RouteDef[]) {
  return routes.reduce<{ name: string; items: RouteDef[] }[]>((acc, r) => {
    const last = acc[acc.length - 1]
    if (last && last.name === r.group) last.items.push(r)
    else acc.push({ name: r.group, items: [r] })
    return acc
  }, [])
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

export function Sidebar({ routes, current, open, id }: Props) {
  const { state, logout } = useAuth()
  return (
    <aside className={`side${open ? ' open' : ''}`} id={id} aria-label="Menu utama">
      <div className="brand">
        <Logo />
        <div>
          <div className="t">
            WKN Group
            <br />
            Data Hub
          </div>
          <div className="s">PT. Wiratama Karya Nugraha</div>
        </div>
      </div>
      <nav className="nav">
        {groupRoutes(routes).map((g) => (
          <div key={g.name} style={{ display: 'contents' }}>
            <h4>{g.name}</h4>
            {g.items.map((r) => (
              <a key={r.id} href={`#${r.id}`} aria-current={r.id === current ? 'page' : undefined}>
                <Icon name={r.icon} />
                <span>{r.label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>
      {state.status === 'in' && (
        <div className="me">
          <div className="av" aria-hidden="true">
            {initials(state.profile.name || state.profile.username)}
          </div>
          <div className="who">
            <div className="n">{state.profile.name || state.profile.username}</div>
            <div className="r">{state.roleName}</div>
          </div>
          <Button size="sm" iconOnly onClick={() => void logout()} aria-label="Keluar" title="Keluar">
            <Icon name="out" />
          </Button>
        </div>
      )}
    </aside>
  )
}
