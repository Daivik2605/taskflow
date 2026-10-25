import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useToday } from '../app/useToday'
import { useCounters } from '../data/counters'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { OVERVIEW_LINKS, PERIODS, deadlineLabel, isPeriod, overview, type Period } from '../lib/overview'
import { card } from './ui'

const KEY = 'taskflow-overview-period'

function storedPeriod(): Period {
  try {
    const v = localStorage.getItem(KEY)
    return isPeriod(v) ? v : 'today'
  } catch {
    return 'today'
  }
}

interface CardProps { label: string; to: string; value: ReactNode; sub?: ReactNode; aria: string; now?: boolean; tone?: string }

function OverviewCard({ label, to, value, sub, aria, now, tone = '' }: CardProps) {
  return (
    <Link to={to} aria-label={aria} className={`${card} flex min-h-20 min-w-0 flex-col justify-between p-3 hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-500 lg:flex-1`}>
      <span className="flex items-center justify-between gap-1 text-xs text-slate-500">
        <span className="truncate">{label}</span>
        {now && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800">now</span>}
      </span>
      <span className={`text-2xl font-bold ${tone}`}>{value}</span>
      <span className="min-h-4 truncate text-xs text-slate-500">{sub}</span>
    </Link>
  )
}

const Skeleton = () => <div className={`${card} min-h-20 animate-pulse bg-slate-100 lg:flex-1 dark:bg-slate-800`} aria-hidden="true" />

/** SPEC §3 overview strip: Today · Week · Month cards. Every figure comes from lib/overview.ts, i.e. the same functions as Insights. */
export function OverviewStrip({ children }: { children?: ReactNode }) { // children: the phase-4 Time card goes here
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const { tasks, loading: tasksLoading } = useTasks()
  const { counters, events, loading: countersLoading } = useCounters()
  const [period, setPeriodState] = useState<Period>(storedPeriod)
  const setPeriod = (p: Period) => {
    setPeriodState(p)
    try { localStorage.setItem(KEY, p) } catch { /* private mode: the choice just won't persist */ }
  }
  const o = useMemo(() => overview(tasks, events, counters, today, period, weekStartsOn), [tasks, events, counters, today, period, weekStartsOn])
  const when = PERIODS.find((p) => p.key === period)!.label.toLowerCase()

  return (
    <section aria-label="Overview" className="space-y-2">
      <div role="radiogroup" aria-label="Overview period" className="grid grid-cols-3 gap-2 sm:max-w-xs">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={period === p.key} onClick={() => setPeriod(p.key)}
            className={`min-h-11 rounded-lg border text-sm font-medium ${period === p.key ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{p.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:flex" role="group" aria-label="Overview cards">
        {tasksLoading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} />) : (
          <>
            <OverviewCard label="To do" to={OVERVIEW_LINKS.todo} value={o.todo} aria={`To do ${when}: ${o.todo}`} sub={`due ${when} or no date`} />
            <OverviewCard label="Due today" now to={OVERVIEW_LINKS.dueToday} value={o.dueToday} aria={`Due today, now: ${o.dueToday}`} />
            <OverviewCard label="Upcoming" now to={OVERVIEW_LINKS.upcoming} value={o.upcoming} aria={`Upcoming, now: ${o.upcoming}`} sub="not started yet" />
            <OverviewCard label="Deadlines" now to={OVERVIEW_LINKS.deadlines} value={o.deadlines.count} tone={o.deadlines.count ? 'text-amber-600 dark:text-amber-400' : ''}
              aria={`Deadlines in the next 14 days, now: ${o.deadlines.count}${o.deadlines.nearest ? `. Nearest: ${deadlineLabel(o.deadlines.nearest)}` : ''}`}
              sub={o.deadlines.nearest ? deadlineLabel(o.deadlines.nearest) : 'none open'} />
            <OverviewCard label="Missed" to={OVERVIEW_LINKS.missed(period)} tone={o.missed.tasks + o.missed.deadlines ? 'text-red-600 dark:text-red-400' : ''}
              value={<>{o.missed.tasks} <span className="text-slate-400">/</span> {o.missed.deadlines}</>} sub="tasks / deadlines"
              aria={`Missed ${when}: ${o.missed.tasks} tasks, ${o.missed.deadlines} deadlines`} />
            <OverviewCard label="Completed" to={OVERVIEW_LINKS.completed(period)} value={o.completed} tone="text-emerald-600 dark:text-emerald-400" aria={`Completed ${when}: ${o.completed}`} />
          </>
        )}
        {countersLoading ? <><Skeleton /><Skeleton /></> : o.counters.map(({ counter, total, change }) => (
          <OverviewCard key={counter.id} label={counter.name} to={OVERVIEW_LINKS.counter(counter.id)}
            value={<><span aria-hidden="true">{counter.emoji} </span>{total}</>}
            sub={change === 0 ? '= same as before' : <span className={change > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>{change > 0 ? '▲' : '▼'} {Math.abs(change)}</span>}
            aria={`${counter.name} ${when}: ${total}, ${change === 0 ? 'no change' : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}`} versus the previous ${period === 'today' ? 'day' : period}`} />
        ))}
        {children}
      </div>
    </section>
  )
}
