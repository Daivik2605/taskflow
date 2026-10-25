// Counters (SPEC §13): cigarettes, weed — counts only, no time, no cost. Every figure here is a pure function of the event
// list, with days taken from each event's stored Toronto `day` (the database keeps it in step with `at`).

import { addDays, addMonths, dayOf, diffDays, formatDay, formatDuration, formatMonth, monthBounds, weekBounds, type Day, type Instant } from './time'

export interface Counter { id: string; name: string; short_label: string | null; color: string; sort: number; archived: boolean }

/** What the header pills and tight spaces show: the short label, or the full name when there is none. */
export const counterLabel = (c: Pick<Counter, 'name' | 'short_label'>) => c.short_label?.trim() || c.name
export interface CounterEvent { id: string; counter_id: string; at: string; day: Day; qty: number; note: string | null }

export const byCounterSort = (a: Counter, b: Counter) => a.sort - b.sort || a.name.localeCompare(b.name)
export const activeCounters = (cs: Counter[]) => cs.filter((c) => !c.archived).sort(byCounterSort)

export const nextCounterSort = (cs: Counter[]) => cs.reduce((m, c) => Math.max(m, c.sort), -1) + 1

export function validateCounterName(name: string, cs: Counter[], ignoreId?: string): string | null {
  const t = name.trim()
  if (!t) return 'Give the counter a name.'
  if (cs.some((c) => c.id !== ignoreId && c.name.trim().toLowerCase() === t.toLowerCase())) return 'A counter with that name already exists.'
  return null
}

/** A new event for a tap: `at` is the tap time (or the past time the user chose), `day` its Toronto day. */
export function buildEvent(counterId: string, at: Date, id: string, qty = 1, note: string | null = null): CounterEvent {
  return { id, counter_id: counterId, at: at.toISOString(), day: dayOf(at), qty, note }
}

export const forCounter = (events: CounterEvent[], counterId: string) => events.filter((e) => e.counter_id === counterId)
export const sumQty = (events: CounterEvent[]) => events.reduce((n, e) => n + e.qty, 0)

/** Total between two days, inclusive. */
export const totalBetween = (events: CounterEvent[], from: Day, to: Day) => sumQty(events.filter((e) => e.day >= from && e.day <= to))

export function totalsByDay(events: CounterEvent[]): Map<Day, number> {
  const m = new Map<Day, number>()
  for (const e of events) m.set(e.day, (m.get(e.day) ?? 0) + e.qty)
  return m
}

export const todaysEvents = (events: CounterEvent[], counterId: string, today: Day) =>
  forCounter(events, counterId).filter((e) => e.day === today).sort((a, b) => b.at.localeCompare(a.at))

export function lastEvent(events: CounterEvent[], counterId: string): CounterEvent | null {
  return forCounter(events, counterId).reduce<CounterEvent | null>((best, e) => (!best || e.at > best.at ? e : best), null)
}

/** "just now", "5m ago", "2h 10m ago", "2 days ago" — real elapsed time, not calendar days. */
export function sinceLabel(at: Instant, now: Instant): string {
  const ms = new Date(now).getTime() - new Date(at).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${formatDuration(minutes)} ago`
  const days = Math.floor(minutes / (24 * 60))
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export interface CounterStats {
  today: number; week: number; month: number; allTime: number
  avg7: number; avg30: number // average per day over the last 7 / 30 days, today included
  daysSinceLast: number | null // 0 = tapped today; null = never
  zeroDaysThisMonth: number // days from the 1st up to yesterday with no taps — today counts once it's over
}

export function counterStats(events: CounterEvent[], today: Day, weekStart = 1): CounterStats {
  const w = weekBounds(today, weekStart)
  const m = monthBounds(today)
  const days = totalsByDay(events)
  const past = events.filter((e) => e.day <= today)
  const lastDay = past.reduce<Day | null>((best, e) => (best === null || e.day > best ? e.day : best), null)
  let zero = 0
  for (let d = m.start; d < today; d = addDays(d, 1)) if (!days.has(d)) zero++
  return {
    today: totalBetween(events, today, today),
    week: totalBetween(events, w.start, w.end),
    month: totalBetween(events, m.start, m.end),
    allTime: sumQty(events),
    avg7: totalBetween(events, addDays(today, -6), today) / 7,
    avg30: totalBetween(events, addDays(today, -29), today) / 30,
    daysSinceLast: lastDay === null ? null : diffDays(lastDay, today),
    zeroDaysThisMonth: zero,
  }
}

export interface Bucket { key: string; label: string; from: Day; to: Day; total: number }

/** The last `n` days ending today, zero-filled, oldest first. */
export function perDay(events: CounterEvent[], today: Day, n = 30): Bucket[] {
  const days = totalsByDay(events)
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(today, i - (n - 1))
    return { key: d, label: formatDay(d), from: d, to: d, total: days.get(d) ?? 0 }
  })
}

/** The last `n` weeks ending with the current one (weeks start on `weekStart`), zero-filled, oldest first. */
export function perWeek(events: CounterEvent[], today: Day, n = 12, weekStart = 1): Bucket[] {
  const thisStart = weekBounds(today, weekStart).start
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(thisStart, 7 * (i - (n - 1)))
    const to = addDays(from, 6)
    return { key: from, label: formatDay(from), from, to, total: totalBetween(events, from, to) }
  })
}

/** The last `n` months ending with the current one, zero-filled, oldest first. */
export function perMonth(events: CounterEvent[], today: Day, n = 12): Bucket[] {
  return Array.from({ length: n }, (_, i) => {
    const from = addMonths(today, i - (n - 1))
    const to = monthBounds(from).end
    return { key: from.slice(0, 7), label: formatMonth(from), from, to, total: totalBetween(events, from, to) }
  })
}

export interface EventChange { type: 'INSERT' | 'UPDATE' | 'DELETE'; row?: CounterEvent; id?: string }

/** Folds one realtime event into the list (our own echo never duplicates). */
export function applyEventChange(events: CounterEvent[], c: EventChange): CounterEvent[] {
  if (c.type === 'DELETE') return c.id ? events.filter((e) => e.id !== c.id) : events
  if (!c.row) return events
  const i = events.findIndex((e) => e.id === c.row!.id)
  if (i < 0) return [...events, c.row]
  const next = [...events]
  next[i] = c.row
  return next
}
