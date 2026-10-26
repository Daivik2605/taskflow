// Weekly review (SPEC §18): last week against the week before. Pure; every number comes from summary.ts, which Insights shares.

import { isPassing, periodSummary, type GoalLine, type PeriodSummary, type SummaryInputs } from './summary'
import { DEADLINE_HORIZON_DAYS, isOpen, isTopLevel, type Task } from './tasks'
import { addDays, weekBounds, type Day } from './time'
import type { DayRow } from './dayPlan'

export interface WeekRow { week_start: Day; note: string | null; reviewed_at: string | null }
export interface SleepRow { day: Day; minutes: number }

export interface Span { from: Day; to: Day }

/** The week containing `day`, and the week before it. */
export function weekPair(day: Day, weekStart = 1): { week: Span; before: Span } {
  const w = weekBounds(day, weekStart)
  const b = weekBounds(addDays(w.start, -1), weekStart)
  return { week: { from: w.start, to: w.end }, before: { from: b.start, to: b.end } }
}

/** The week a review on `today` is about: the week just finished, except on the last day of the week, when it is the week ending today. */
export function reviewWeekFor(today: Day, weekStart = 1): Span {
  const w = weekBounds(today, weekStart)
  return today === w.end ? { from: w.start, to: w.end } : weekPair(addDays(w.start, -1), weekStart).week
}

export const average = (nums: number[]): number | null => (nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length)

export interface Averages { mood: number | null; energy: number | null; sleepMinutes: number | null }

export function averages(days: Pick<DayRow, 'day' | 'mood' | 'energy'>[], sleep: SleepRow[], span: Span): Averages {
  const inSpan = (d: Day) => d >= span.from && d <= span.to
  return {
    mood: average(days.filter((d) => inSpan(d.day) && d.mood !== null).map((d) => d.mood!)),
    energy: average(days.filter((d) => inSpan(d.day) && d.energy !== null).map((d) => d.energy!)),
    sleepMinutes: average(sleep.filter((s) => inSpan(s.day)).map((s) => s.minutes)),
  }
}

export interface TagCompare { tag: { id: string; name: string; color: string }; now: number; before: number; delta: number }

/** Hours by parent tag this week against the week before (minutes), tags with time in either week, biggest first. */
export function compareTags(now: PeriodSummary, before: PeriodSummary): TagCompare[] {
  const ids = new Map<string, TagCompare['tag']>()
  for (const r of [...now.tags, ...before.tags]) ids.set(r.tag.id, { id: r.tag.id, name: r.tag.name, color: r.tag.color })
  const minutes = (s: PeriodSummary, id: string) => s.tags.find((r) => r.tag.id === id)?.total ?? 0
  return [...ids.values()]
    .map((tag) => ({ tag, now: minutes(now, tag.id), before: minutes(before, tag.id), delta: minutes(now, tag.id) - minutes(before, tag.id) }))
    .sort((a, b) => b.now - a.now || b.before - a.before)
}

/** Open hard deadlines due in the next 14 days from `today` (today included), soonest first. Missed ones are in the missed list, not here. */
export function deadlinesAhead(tasks: Task[], today: Day): Task[] {
  const end = addDays(today, DEADLINE_HORIZON_DAYS)
  return tasks.filter((t) => isTopLevel(t) && isOpen(t) && t.hard_deadline && t.due_on !== null && t.due_on >= today && t.due_on <= end)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!) || a.sort - b.sort)
}

/** Planned vs actual: each goal's target for the week against what happened (weekly goals; daily goals show days met). */
export interface PlannedVsActual { line: GoalLine; planned: number; actual: number | null }

export function plannedVsActual(lines: GoalLine[]): PlannedVsActual[] {
  return lines.map((line) => {
    const week = line.results.length === 1 ? line.results[0]! : null
    return { line, planned: line.goal.amount, actual: week && line.goal.period !== 'day' ? week.result.value : null }
  })
}

export interface WeekReview {
  week: PeriodSummary
  before: PeriodSummary
  tagCompare: TagCompare[]
  averages: Averages
  averagesBefore: Averages
  plan: PlannedVsActual[]
  goalsHit: number
  goalsJudged: number
  deadlines: Task[]
}

export function buildWeekReview(inputs: SummaryInputs, days: Pick<DayRow, 'day' | 'mood' | 'energy'>[], sleep: SleepRow[], span: Span, today: Day, weekStart = 1): WeekReview {
  const prev = weekPair(span.from, weekStart).before
  const week = periodSummary(inputs, span.from, span.to, today)
  const before = periodSummary(inputs, prev.from, prev.to, today)
  const goals = week.goals
  return {
    week, before,
    tagCompare: compareTags(week, before),
    averages: averages(days, sleep, span),
    averagesBefore: averages(days, sleep, prev),
    plan: plannedVsActual(goals),
    goalsHit: goals.reduce((n, g) => n + g.results.filter(isPassing).length, 0),
    goalsJudged: goals.reduce((n, g) => n + g.results.length, 0),
    deadlines: deadlinesAhead(inputs.tasks, today),
  }
}

export const weekLabelOf = (s: Span) => `${s.from} – ${s.to}`
