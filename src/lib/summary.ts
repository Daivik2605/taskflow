// One summary of a span of Toronto days (SPEC §18), shared by the evening shutdown, the weekly review and Insights → Range.
// It is built ONLY from the functions Insights already uses (rangeStats, tagMinutes, totalBetween, periodResult), never from its own
// arithmetic, so the shutdown and the review can't disagree with Insights for the same range. summary.test.ts proves it.

import type { Activity, ActivityLog } from './activities'
import { logDay } from './activities'
import { activeActivities } from './activities'
import { activeCounters, forCounter, totalBetween, type Counter } from './counters'
import { periodResult, type Goal, type GoalInputs, type PeriodResult } from './goals'
import { buildTree } from './tags'
import { rangeStats, type RangeStats } from './tasks'
import { tagMinutes, tagRows as buildTagRows, type TagRow } from './timer'
import { addDays, diffDays, monthBounds, type Day } from './time'

export interface SummaryInputs extends GoalInputs {
  goals: Goal[]
  counters: Counter[]
  activities: Activity[]
}

/** Time by parent tag and sub-tag, exactly the table under Insights → Range → Time by tag. */
export function tagSummary(inputs: Pick<GoalInputs, 'areas' | 'sessions'>, from: Day, to: Day): { rows: TagRow[]; totalMinutes: number } {
  const byTag = tagMinutes(inputs.sessions, from, to)
  const rows = buildTagRows(buildTree(inputs.areas), byTag)
  return { rows, totalMinutes: rows.reduce((n, r) => n + r.total, 0) }
}

/** Tasks done / missed / deadlines missed: the lists and counts under Insights → Range (late finishes count as missed; dropped count nowhere). */
export const taskSummary = (tasks: GoalInputs['tasks'], from: Day, to: Day, today: Day): RangeStats => rangeStats(tasks, from, to, today)

export interface CounterLine { counter: Counter; total: number }
/** Taps per active counter, as in Insights → Range → Counters. */
export const counterSummary = (counters: Counter[], events: GoalInputs['events'], from: Day, to: Day): CounterLine[] =>
  activeCounters(counters).map((counter) => ({ counter, total: totalBetween(forCounter(events, counter.id), from, to) }))

export interface ActivityLine { activity: Activity; count: number; target: number | null }
/** Activity-button logs in the span (a log belongs to the day it ended on) against the weekly target. */
export function activitySummary(activities: Activity[], logs: ActivityLog[], from: Day, to: Day): ActivityLine[] {
  return activeActivities(activities).map((activity) => ({
    activity,
    count: logs.filter((l) => l.preset_id === activity.id && logDay(l) >= from && logDay(l) <= to).length,
    target: activity.weekly_target,
  }))
}

/** A goal judged over the span: one result for a week or month goal, one per day for a daily goal. */
export interface GoalLine {
  series_id: string
  goal: Goal // the version in force at the end of the span
  results: PeriodResult[]
  passing: number // periods met, or (for a limit) not broken
  judged: number
}

/**
 * Met = an "at least" goal reached, or an "at most" limit not broken. A period still running isn't failed yet, so a limit in progress passes.
 */
export const isPassing = (r: PeriodResult): boolean => (r.version.direction === 'at_least' ? r.result.status === 'hit' : r.result.status !== 'miss')

const MAX_SPAN_DAYS = 400

export function goalSummary(inputs: SummaryInputs, from: Day, to: Day, today: Day): GoalLine[] {
  const series = [...new Set(inputs.goals.map((g) => g.series_id))]
  const lines: GoalLine[] = []
  for (const id of series) {
    const results: PeriodResult[] = []
    for (const period of ['day', 'week', 'month'] as const) {
      if (period === 'day') {
        const days = Math.min(diffDays(from, to) + 1, MAX_SPAN_DAYS)
        for (let i = 0; i < days; i++) { const r = periodResult(inputs.goals, id, 'day', addDays(from, i), inputs, today); if (r) results.push(r) }
      } else if (period === 'week') {
        // A week goal is judged when the span covers its whole week (a review week, a month); a single shutdown day doesn't judge it.
        const r = periodResult(inputs.goals, id, 'week', to, inputs, today)
        if (r && r.window.from >= from && r.window.to <= to) results.push(r)
      } else {
        const m = monthBounds(to)
        if (from <= m.start && to >= m.end) { const r = periodResult(inputs.goals, id, 'month', to, inputs, today); if (r) results.push(r) }
      }
    }
    if (results.length === 0) continue
    lines.push({ series_id: id, goal: results[results.length - 1]!.version, results, passing: results.filter(isPassing).length, judged: results.length })
  }
  return lines.sort((a, b) => a.goal.sort - b.goal.sort)
}

export interface PeriodSummary {
  from: Day
  to: Day
  days: number
  tags: TagRow[]
  totalMinutes: number
  tasks: RangeStats
  counters: CounterLine[]
  activities: ActivityLine[]
  goals: GoalLine[]
}

export function periodSummary(inputs: SummaryInputs, from: Day, to: Day, today: Day): PeriodSummary {
  const tags = tagSummary(inputs, from, to)
  return {
    from, to, days: diffDays(from, to) + 1,
    tags: tags.rows, totalMinutes: tags.totalMinutes,
    tasks: taskSummary(inputs.tasks, from, to, today),
    counters: counterSummary(inputs.counters, inputs.events, from, to),
    activities: activitySummary(inputs.activities, inputs.logs, from, to),
    goals: goalSummary(inputs, from, to, today),
  }
}
