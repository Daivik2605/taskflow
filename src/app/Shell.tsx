import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { CounterPills } from '../components/CounterPills'
import { ConnectionBanner } from './ConnectionBanner'
import { Icon } from './Icon'
import { MORE, MORE_PATHS, TABS, type NavItem } from './nav'

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
    isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`

export function Shell() {
  const { pathname } = useLocation()
  const sidebar: NavItem[] = [...TABS.filter((t) => t.to !== '/more'), ...MORE]

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-200 p-3 dark:border-slate-800 lg:flex">
        <div className="px-3 py-3 text-lg font-semibold">TaskFlow</div>
        <nav aria-label="Sidebar" className="flex flex-col gap-1">
          {sidebar.map((n, i) => (
            <div key={n.to}>
              {i === TABS.length - 1 && <div className="my-2 border-t border-slate-200 dark:border-slate-800" />}
              <NavLink to={n.to} end={n.to === '/'} className={sideLink}>
                <Icon name={n.icon} className="h-5 w-5" />{n.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <CounterPills />
        <ConnectionBanner />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 lg:hidden" aria-label="Main">
          {TABS.map((t) => {
            const active = t.to === '/more' ? MORE_PATHS.includes(pathname) : t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)
            return (
              // Link, not NavLink: "More" must read as current on every page under it, which NavLink can't express.
              <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                <Icon name={t.icon} />{t.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
