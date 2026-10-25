// Overview strip (SPEC §3). Pure: composes the rules in tasks.ts and counters.ts, so these numbers are the same ones Insights shows.
// Done / Missed / counters follow the Today · Week · Month toggle; Due today, Upcoming and Deadlines are "now" snapshots.

import { activeCounters, forCounter, totalBetween, type Counter, type CounterEvent } from './counters'
import { counts, DEADLINE_HORIZON_DAYS, isActive, isOpen, isTopLevel, isUpcoming, windowFor, type Task } from './tasks'
import { addDays, addMonths, diffDays, monthBounds, type Day } from './time'

export type Period = 'today' | 'week' | 'month'
export const PERIODS: { key: Period; label: string }[] = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }]
export const isPeriod = (v: unknown): v is Period => PERIODS.some((p) => p.key === v)

export interface NearestDeadline { id: string; title: string; days: number }
export interface CounterCard { counter: Counter; total: number; previous: number; change: number }

export interface Overview {
  period: Period
  from: Day
  to: Day
  previous: { from: Day; to: Day }
  // snapshots (do not follow the toggle)
  dueToday: number
  upcoming: number
  deadlines: { count: number; nearest: NearestDeadline | null }
  // follow the toggle
  todo: number // active, not missed, due in the period — plus undated ones
  missed: { tasks: number; deadlines: number }
  completed: number
  counters: CounterCard[]
}

/**
 * The previous period, cut to the same number of elapsed days as this one so the comparison is fair:
 * Tue of this week vs Mon–Tue of last week; the 10th vs the 1st–10th of last month (clipped to a short month).
 */
export function previousWindow(period: Period, today: Day, weekStart = 1): { from: Day; to: Day } {
  const w = windowFor(period, today, weekStart)
  const from = w.from!
  const elapsed = diffDays(from, today) // days after the first one
  if (period === 'today') return { from: addDays(today, -1), to: addDays(today, -1) }
  if (period === 'week') return { from: addDays(from, -7), to: addDays(from, -7 + elapsed) }
  const prevFrom = addMonths(from, -1)
  const end = addDays(prevFrom, elapsed)
  const last = monthBounds(prevFrom).end
  return { from: prevFrom, to: end > last ? last : end }
}

export function overview(tasks: Task[], events: CounterEvent[], counters: Counter[], today: Day, period: Period, weekStart = 1): Overview {
  const w = windowFor(period, today, weekStart)
  const prev = previousWindow(period, today, weekStart)
  const c = counts(tasks, today, period, weekStart)
  const top = tasks.filter(isTopLevel)

  const openDeadlines = top
    .filter((t) => isOpen(t) && t.hard_deadline && t.due_on !== null && t.due_on >= today)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!) || a.created_at.localeCompare(b.created_at))
  const horizon = addDays(today, DEADLINE_HORIZON_DAYS)
  const nearest = openDeadlines[0]

  return {
    period, from: w.from!, to: w.to!, previous: prev,
    dueToday: top.filter((t) => isActive(t, today) && t.due_on === today).length,
    upcoming: top.filter((t) => isUpcoming(t, today)).length,
    deadlines: {
      count: openDeadlines.filter((t) => t.due_on! <= horizon).length,
      nearest: nearest ? { id: nearest.id, title: nearest.title, days: diffDays(today, nearest.due_on!) } : null,
    },
    todo: c.left + top.filter((t) => isActive(t, today) && t.due_on === null).length,
    missed: { tasks: c.missed, deadlines: c.deadlinesMissed },
    completed: c.done,
    counters: activeCounters(counters).map((counter) => {
      const mine = forCounter(events, counter.id)
      const total = totalBetween(mine, w.from!, w.to!)
      const previous = totalBetween(mine, prev.from, prev.to)
      return { counter, total, previous, change: total - previous }
    }),
  }
}

/** Where each card opens. Missed and Completed open Insights → Range on the same period. */
export const OVERVIEW_LINKS = {
  todo: '/tasks',
  dueToday: '/tasks?view=today',
  upcoming: '/tasks?view=upcoming',
  deadlines: '/tasks?view=deadlines',
  missed: (p: Period) => `/insights?tab=range&range=${p === 'today' ? 'day' : p}`,
  completed: (p: Period) => `/insights?tab=range&range=${p === 'today' ? 'day' : p}`,
  counter: (id: string) => `/insights?tab=counters&counter=${id}`,
}

/** "G2 in 16 days" / "G2 today" / "G2 tomorrow". */
export function deadlineLabel(d: NearestDeadline): string {
  return `${d.title} ${d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${d.days} days`}`
}
