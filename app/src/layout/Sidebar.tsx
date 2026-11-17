import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { ROUTES, type RouteDef } from './routes'

const GROUPS = ROUTES.reduce<{ name: string; items: RouteDef[] }[]>((acc, r) => {
  const last = acc[acc.length - 1]
  if (last && last.name === r.group) last.items.push(r)
  else acc.push({ name: r.group, items: [r] })
  return acc
}, [])

type Props = { current: string; open: boolean; id: string }

export function Sidebar({ current, open, id }: Props) {
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
        {GROUPS.map((g) => (
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
    </aside>
  )
}
