import { Link } from 'react-router-dom'
import { Icon } from '../app/Icon'
import { moreItems } from '../app/nav'
import { useSettings } from '../data/settings'

export function More() {
  const { hideUnfinished } = useSettings()
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">More</h1>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {moreItems(hideUnfinished).map((m) => (
          <li key={m.to}>
            <Link to={m.to} className="flex min-h-14 items-center gap-3 px-4 text-base font-medium">
              <Icon name={m.icon} className="h-5 w-5 text-slate-500" />{m.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
