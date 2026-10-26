import { Link } from 'react-router-dom'
import { useNow } from '../app/useNow'
import { useToday } from '../app/useToday'
import { useDays } from '../data/days'
import { useSettings } from '../data/settings'
import { shutdownCardVisible } from '../lib/dayPlan'
import { card } from './ui'

/** The evening card: appears from the shutdown time (Toronto) until the day is shut down. */
export function ShutdownCard() {
  const today = useToday()
  const now = useNow(60_000)
  const { get } = useDays()
  const { shutdownTime } = useSettings()
  if (!shutdownCardVisible(get(today), now, shutdownTime)) return null
  return (
    <Link to="/shutdown" className={`${card} flex min-h-14 items-center justify-between gap-3 border-indigo-400 p-3 dark:border-indigo-700`}>
      <span><span className="block font-semibold">Shut down the day</span><span className="text-sm text-slate-500">Roll what's left, log your mood. About a minute.</span></span>
      <span aria-hidden="true">→</span>
    </Link>
  )
}
