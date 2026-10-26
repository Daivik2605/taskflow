// Goals and targets (SPEC §17). Pure: every figure is a function of the data passed in.
//
// A goal row is one VERSION of a goal. Rows with the same `series_id` are one goal over time: changing the target (or pausing it)
// closes the current row (`ends_on`) and starts a new one (`starts_on`), so a past period is judged against the target it had then.
// A period (day / week / month) is judged against the version in force on its last elapsed day.

import { logDay, minutesByTag, type ActivityLog } from './activities'
import type { Area } from './areas'
import type { Counter, CounterEvent } from './counters'
import { tagIdsFor } from './tags'
import { completedDay, isTopLevel, type Task } from './tasks'
import { addDays, formatDay, formatMonth, monthBounds, weekBounds, type Day } from './time'

export type Metric = 'tag_minutes' | 'counter_count' | 'activity_count' | 'tasks_done'
export type Direction = 'at_least' | 'at_most'
export type GoalPeriod = 'day' | 'week' | 'month'

export interface Goal {
  id: string
  series_id: string
  name: string
  metric: Metric
  target_id: string | null
  direction: Direction
  amount: number // minutes for tag_minutes, otherwise a count
  period: GoalPeriod
  starts_on: Day
  ends_on: Day | null
  paused: boolean
  sort: number
}

export const METRICS: { value: Metric; label: string; targetLabel: string | null }[] = [
  { value: 'tag_minutes', label: 'Time on a tag', targetLabel: 'Tag' },
  { value: 'counter_count', label: 'Counter', targetLabel: 'Counter' },
  { value: 'activity_count', label: 'Activity', targetLabel: 'Activity' },
  { value: 'tasks_done', label: 'Tasks done', targetLabel: null },
]
export const PERIOD_LABEL: Record<GoalPeriod, string> = { day: 'day', week: 'week', month: 'month' }
export const DIRECTION_SIGN: Record<Direction, string> = { at_least: '≥', at_most: '≤' }

export interface GoalInputs {
  tasks: Task[]
  events: CounterEvent[]
  /** Time on tags: every stretch (activity-button logs and timer segments, an open one up to now). */
  sessions: ActivityLog[]
  /** Activity-button logs (for "Gym ≥ 3× / week"). */
  logs: ActivityLog[]
  areas: Area[]
  daysOff: ReadonlySet<Day>
  weekStart: number
}

export interface Window { from: Day; to: Day }

export function periodWindow(period: GoalPeriod, day: Day, weekStart = 1): Window {
  if (period === 'day') return { from: day, to: day }
  if (period === 'week') { const w = weekBounds(day, weekStart); return { from: w.start, to: w.end } }
  const m = monthBounds(day)
  return { from: m.start, to: m.end }
}

/** The window just before the one containing `day`. */
export function previousPeriod(period: GoalPeriod, day: Day, weekStart = 1): Window {
  const w = periodWindow(period, day, weekStart)
  return periodWindow(period, addDays(w.from, -1), weekStart)
}

// ───────────── Progress ─────────────
/** The goal's metric between two days inclusive. Minutes for tag goals, otherwise a count. */
export function metricValue(goal: Pick<Goal, 'metric' | 'target_id'>, w: Window, inputs: GoalInputs): number {
  const inWin = (d: Day | null) => d !== null && d >= w.from && d <= w.to
  switch (goal.metric) {
    case 'tag_minutes': {
      if (!goal.target_id) return 0
      const ids = tagIdsFor(inputs.areas, goal.target_id)
      let total = 0
      for (const [id, minutes] of minutesByTag(inputs.sessions, w.from, w.to)) if (ids.has(id)) total += minutes
      return Math.round(total)
    }
    case 'counter_count':
      return inputs.events.reduce((n, e) => (e.counter_id === goal.target_id && inWin(e.day) ? n + e.qty : n), 0)
    case 'activity_count':
      return inputs.logs.reduce((n, l) => (l.preset_id === goal.target_id && inWin(logDay(l)) ? n + 1 : n), 0)
    case 'tasks_done':
      return inputs.tasks.filter((t) => isTopLevel(t) && inWin(completedDay(t))).length
  }
}

/** hit/miss are final or decided; on-track is still open; at-limit is an at-most goal sitting exactly on its limit; off is a day off. */
export type Status = 'hit' | 'miss' | 'on-track' | 'at-limit' | 'off'
export interface Result { value: number; amount: number; status: Status; fraction: number }

/**
 * Judges one period against one version. `finished` = the period is over. Before it ends: an at-least goal is `hit` once met;
 * an at-most goal is `on-track`, `at-limit` at the limit and `miss` once over (it can't recover). After it ends it is simply met or not.
 */
export function judge(direction: Direction, amount: number, value: number, finished: boolean): Status {
  if (direction === 'at_least') return value >= amount ? 'hit' : finished ? 'miss' : 'on-track'
  if (value > amount) return 'miss'
  if (finished) return 'hit'
  return value === amount ? 'at-limit' : 'on-track'
}

export function evaluate(goal: Goal, w: Window, inputs: GoalInputs, today: Day): Result {
  const value = metricValue(goal, w, inputs)
  const finished = w.to < today
  return { value, amount: goal.amount, status: judge(goal.direction, goal.amount, value, finished), fraction: goal.amount > 0 ? value / goal.amount : 0 }
}

// ───────────── Versions ─────────────
export const seriesOf = (goals: Goal[], seriesId: string) => goals.filter((g) => g.series_id === seriesId)

/** The version in force on `day`, or null (before the goal existed, or after it was deleted... a deleted goal has no rows). */
export function versionOn(goals: Goal[], seriesId: string, day: Day): Goal | null {
  const hit = seriesOf(goals, seriesId).filter((g) => g.starts_on <= day && (g.ends_on === null || g.ends_on >= day))
  return hit.sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] ?? null
}

/** The current version of every goal (open `ends_on`), in list order. */
export const liveGoals = (goals: Goal[]) => goals.filter((g) => g.ends_on === null).sort((a, b) => a.sort - b.sort || a.starts_on.localeCompare(b.starts_on))
export const activeGoals = (goals: Goal[]) => liveGoals(goals).filter((g) => !g.paused)

const seriesStart = (goals: Goal[], seriesId: string): Day | null =>
  seriesOf(goals, seriesId).reduce<Day | null>((m, g) => (m === null || g.starts_on < m ? g.starts_on : m), null)

export interface PeriodResult { window: Window; version: Goal; result: Result }

/**
 * How one goal did in the `period` containing `day`, judged on the version in force on the period's last elapsed day.
 * Null when there is nothing to judge: no version then, it was paused, the version has a different period (changing the period
 * starts fresh), the goal started after the period began (a partial first period would be unfair), or — for a daily goal — a day off.
 */
export function periodResult(goals: Goal[], seriesId: string, period: GoalPeriod, day: Day, inputs: GoalInputs, today: Day, opts: { countPartial?: boolean } = {}): PeriodResult | null {
  const w = periodWindow(period, day, inputs.weekStart)
  const judgedOn = w.to < today ? w.to : today
  const version = versionOn(goals, seriesId, judgedOn)
  if (!version || version.paused || version.period !== period) return null
  const first = seriesStart(goals, seriesId)
  if (!opts.countPartial && first !== null && w.from < first) return null
  if (period === 'day' && inputs.daysOff.has(w.from)) return null
  return { window: w, version, result: evaluate(version, w, inputs, today) }
}

// ───────────── History, hit rate, streak ─────────────
export const LOOKBACK: Record<GoalPeriod, number> = { day: 90, week: 26, month: 12 }

export interface GoalStats {
  /** Completed periods that were judged (hit or miss), newest first. */
  history: PeriodResult[]
  hits: number
  total: number
  hitRate: number | null // 0..1, null when nothing has been judged yet
  streak: number // consecutive hit periods ending at the most recent judged one
  best: number
  /** The period running now (may be null: paused, a day off, or the goal starts later). */
  current: PeriodResult | null
}

/** Periods with nothing to judge (days off, paused, before the goal) neither break nor extend a streak. */
export function goalStats(goals: Goal[], seriesId: string, inputs: GoalInputs, today: Day, lookback?: number): GoalStats {
  const live = versionOn(goals, seriesId, today) ?? [...seriesOf(goals, seriesId)].sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0]
  if (!live) return { history: [], hits: 0, total: 0, hitRate: null, streak: 0, best: 0, current: null }
  const n = lookback ?? LOOKBACK[live.period]
  const first = seriesStart(goals, seriesId)!
  const history: PeriodResult[] = []
  let w = previousPeriod(live.period, today, inputs.weekStart)
  for (let i = 0; i < n && w.to >= first; i++) {
    const r = periodResult(goals, seriesId, live.period, w.from, inputs, today)
    if (r && (r.result.status === 'hit' || r.result.status === 'miss')) history.push(r)
    w = previousPeriod(live.period, w.from, inputs.weekStart)
  }
  const hits = history.filter((r) => r.result.status === 'hit').length
  let streak = 0
  for (const r of history) { if (r.result.status === 'hit') streak++; else break }
  let best = 0
  let run = 0
  for (const r of [...history].reverse()) { run = r.result.status === 'hit' ? run + 1 : 0; best = Math.max(best, run) }
  return {
    history, hits, total: history.length, hitRate: history.length ? hits / history.length : null, streak, best,
    current: periodResult(goals, seriesId, live.period, today, inputs, today, { countPartial: true }),
  }
}

// ───────────── The overview row ─────────────
export interface Progress { goal: Goal; result: Result; dayOff: boolean }

/** Every active goal's progress in its own current period: daily first, then weekly, then monthly; your own order within each. */
export function currentProgress(goals: Goal[], inputs: GoalInputs, today: Day): Progress[] {
  const order: Record<GoalPeriod, number> = { day: 0, week: 1, month: 2 }
  return activeGoals(goals)
    .filter((g) => g.starts_on <= today)
    .sort((a, b) => order[a.period] - order[b.period] || a.sort - b.sort)
    .map((goal) => ({ goal, result: evaluate(goal, periodWindow(goal.period, today, inputs.weekStart), inputs, today), dayOff: goal.period === 'day' && inputs.daysOff.has(today) }))
}

// ───────────── Counter pills ─────────────
export type LimitState = 'none' | 'ok' | 'at' | 'over'
export interface CounterLimit { state: LimitState; count: number; limit: number | null; period: GoalPeriod | null }

const RANK: Record<LimitState, number> = { none: 0, ok: 1, at: 2, over: 3 }

/** Today against the counter's "at most" goals. The worst state wins (ties prefer the daily goal). Days off don't switch a limit off. */
export function counterLimit(goals: Goal[], counterId: string, inputs: GoalInputs, today: Day): CounterLimit {
  let best: CounterLimit = { state: 'none', count: 0, limit: null, period: null }
  const order: Record<GoalPeriod, number> = { day: 0, week: 1, month: 2 }
  const mine = activeGoals(goals).filter((g) => g.metric === 'counter_count' && g.target_id === counterId && g.direction === 'at_most' && g.starts_on <= today)
  for (const g of mine.sort((a, b) => order[a.period] - order[b.period])) {
    const count = metricValue(g, periodWindow(g.period, today, inputs.weekStart), inputs)
    const state: LimitState = count > g.amount ? 'over' : count === g.amount ? 'at' : 'ok'
    if (RANK[state] > RANK[best.state]) best = { state, count, limit: g.amount, period: g.period }
  }
  return best
}

// ───────────── Editing = versioning ─────────────
export interface GoalInput {
  name: string
  metric: Metric
  target_id: string | null
  direction: Direction
  amount: number
  period: GoalPeriod
}

export type EditPlan =
  | { kind: 'inplace'; patch: Partial<Pick<Goal, 'name'>> }
  | { kind: 'version'; close: { id: string; ends_on: Day }; next: Goal }

const MATERIAL: (keyof GoalInput)[] = ['metric', 'target_id', 'direction', 'amount', 'period']

/**
 * How an edit is stored. A rename is in place. A change to the target is a new version starting today, and the old one ends yesterday —
 * unless the current version started today, when there is nothing yet to preserve and it is just updated.
 */
export function planEdit(current: Goal, input: GoalInput, today: Day, newId: string): EditPlan | { kind: 'inplace-all'; patch: GoalInput } {
  const changed = MATERIAL.some((k) => current[k] !== input[k])
  if (!changed) return { kind: 'inplace', patch: { name: input.name.trim() } }
  if (current.starts_on >= today) return { kind: 'inplace-all', patch: { ...input, name: input.name.trim() } }
  return {
    kind: 'version',
    close: { id: current.id, ends_on: addDays(today, -1) },
    next: { ...current, ...input, name: input.name.trim(), id: newId, starts_on: today, ends_on: null },
  }
}

/** Pausing and resuming are versions too, so the weeks you paused aren't judged and the weeks before keep their result. */
export function planPause(current: Goal, paused: boolean, today: Day, newId: string): EditPlan | { kind: 'inplace-all'; patch: { paused: boolean } } {
  if (current.paused === paused) return { kind: 'inplace', patch: {} }
  if (current.starts_on >= today) return { kind: 'inplace-all', patch: { paused } }
  return { kind: 'version', close: { id: current.id, ends_on: addDays(today, -1) }, next: { ...current, paused, id: newId, starts_on: today, ends_on: null } }
}

export const nextGoalSort = (goals: Goal[]) => goals.reduce((m, g) => Math.max(m, g.sort), -1) + 1

// ───────────── Validation and wording ─────────────
export interface TargetLists { areas: Area[]; counters: Pick<Counter, 'id' | 'name' | 'short_label'>[]; activities: { id: string; name: string }[] }

export function targetName(metric: Metric, targetId: string | null, t: TargetLists): string {
  if (metric === 'tasks_done') return 'Tasks done'
  if (metric === 'tag_minutes') return t.areas.find((a) => a.id === targetId)?.name ?? 'Unknown tag'
  if (metric === 'counter_count') return t.counters.find((c) => c.id === targetId)?.name ?? 'Unknown counter'
  return t.activities.find((a) => a.id === targetId)?.name ?? 'Unknown activity'
}

/** 90 → "1h 30m"-style for minutes goals would be noisy; goals read in hours: 900 → "15 h", 90 → "1.5 h". */
export function amountText(metric: Metric, amount: number): string {
  if (metric === 'tag_minutes') { const h = amount / 60; return `${Number.isInteger(h) ? h : h.toFixed(1)} h` }
  return metric === 'activity_count' ? `${amount}×` : String(amount)
}

/** "Cigarette ≤ 5 / day", "Gym ≥ 3× / week", "Study ≥ 15 h / week". */
export function goalTitle(g: Pick<Goal, 'name' | 'metric' | 'target_id' | 'direction' | 'amount' | 'period'>, t: TargetLists): string {
  const who = g.name.trim() || targetName(g.metric, g.target_id, t)
  return `${who} ${DIRECTION_SIGN[g.direction]} ${amountText(g.metric, g.amount)} / ${PERIOD_LABEL[g.period]}`
}

/** The value shown beside a bar: "3 / 5", "4h 30m / 15 h". */
export function valueText(metric: Metric, value: number, amount: number): string {
  if (metric === 'tag_minutes') return `${value >= 60 ? `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m` : `${value}m`} / ${amountText(metric, amount)}`
  return `${value} / ${amount}`
}

/** A message, or null when the goal can be saved. `ignoreSeries`: the goal being edited. */
export function validateGoal(input: GoalInput, live: Goal[], ignoreSeries?: string): string | null {
  if (!Number.isInteger(input.amount) || input.amount < 1) return 'The amount must be a whole number, 1 or more.'
  if (input.amount > 100_000) return 'That amount is too large.'
  if (input.metric !== 'tasks_done' && !input.target_id) return 'Pick what the goal is about.'
  if (input.metric === 'tasks_done' && input.target_id) return 'Tasks done has no target.'
  if (input.name.trim().length > 60) return 'Keep the name under 60 characters.'
  const dup = live.some((g) => g.series_id !== ignoreSeries && g.metric === input.metric && g.target_id === input.target_id && g.direction === input.direction && g.period === input.period)
  if (dup) return 'You already have that goal. Edit it instead.'
  return null
}

/** Hours (possibly fractional) typed in the form → whole minutes. */
export const hoursToMinutes = (hours: number) => Math.round(hours * 60)

/** "Mon 9 Nov" / "Nov 2026" / the day, for a period's label in the history strip. */
export function periodLabel(period: GoalPeriod, w: Window): string {
  return period === 'month' ? formatMonth(w.from) : period === 'week' ? `Wk ${formatDay(w.from)}` : formatDay(w.from)
}
