// Plan the day and shut down the day (SPEC §18). Pure rules; the cards in components/ only call these.
// Every day here is a Toronto calendar date (time.ts); "now" and "today" are passed in so midnight and DST are testable.

import { addDays, minuteOfDay, todayToronto, type Day, type Instant } from './time'
import { isOpen, isTopLevel, isUpcoming, todaySections, type Task } from './tasks'

/** One row of `taskflow_days` (or the empty row for a day that has none yet). */
export interface DayRow {
  day: Day
  top3: string[]
  plan_note: string | null
  plan_energy: number | null
  planned_at: string | null
  plan_dismissed_at: string | null
  mood: number | null
  energy: number | null
  review_note: string | null
  reviewed_at: string | null
}

export const emptyDay = (day: Day): DayRow => ({
  day, top3: [], plan_note: null, plan_energy: null, planned_at: null, plan_dismissed_at: null, mood: null, energy: null, review_note: null, reviewed_at: null,
})

export const TOP3_MAX = 3
export const DEFAULT_SHUTDOWN_TIME = '21:00'

// ───────────── Shutdown time ─────────────
export const isShutdownTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/** "21:30" → 1290. A malformed value falls back to the default rather than hiding the card forever. */
export function shutdownMinutes(time: string): number {
  const t = isShutdownTime(time) ? time : DEFAULT_SHUTDOWN_TIME
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
}

/**
 * True from the shutdown time until Toronto midnight, by the Toronto wall clock. At 00:01 it is a new day, so the card for the new day is not due yet.
 * On a DST day the clock skips (spring) or repeats (autumn) an hour; a time inside the skipped hour is due as soon as the clock passes it.
 */
export const shutdownDue = (now: Instant, shutdownTime: string): boolean => minuteOfDay(now) >= shutdownMinutes(shutdownTime)

export const tomorrowOf = (now: Instant): Day => addDays(todayToronto(now), 1)

// ───────────── Cards ─────────────
/** The morning card shows until the plan is saved or dismissed (or the day has been shut down). */
export const planCardVisible = (row: DayRow | null): boolean => !row || (!row.planned_at && !row.plan_dismissed_at && !row.reviewed_at)

/** The shutdown card appears at the set time and stays until the day is shut down. (The "Shut down the day" button is always there.) */
export const shutdownCardVisible = (row: DayRow | null, now: Instant, shutdownTime: string): boolean => !row?.reviewed_at && shutdownDue(now, shutdownTime)

// ───────────── Top 3 ─────────────
/** Add or remove a task from the Top 3. A fourth is refused (the list is returned unchanged). */
export function toggleTop3(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id)
  return ids.length >= TOP3_MAX ? ids : [...ids, id]
}

/** The Top 3 tasks, in the order picked. A task that is done, dropped, deleted or a sub-task falls off the list. */
export function top3Tasks(row: Pick<DayRow, 'top3'> | null, tasks: Task[]): Task[] {
  if (!row) return []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return row.top3.map((id) => byId.get(id)).filter((t): t is Task => !!t && isTopLevel(t) && isOpen(t)).slice(0, TOP3_MAX)
}

/** What the morning card offers: missed, deadlines coming, today, in a window and undated tasks, in the order Today lists them. */
export function planCandidates(tasks: Task[], today: Day): Task[] {
  const s = todaySections(tasks, today)
  return [...s.missed, ...s.deadlines, ...s.today, ...s.inWindow, ...s.noDate]
}

// ───────────── Shutdown triage ─────────────
/**
 * The open tasks the shutdown walks through: due today or missed (a deadline due today or already missed included),
 * plus anything in today's Top 3. Dropped and done tasks never appear; tasks that haven't started yet never appear.
 */
export function shutdownTasks(tasks: Task[], row: Pick<DayRow, 'top3'> | null, today: Day): Task[] {
  const top = new Set(row?.top3 ?? [])
  return tasks
    .filter((t) => isTopLevel(t) && isOpen(t) && !isUpcoming(t, today) && ((t.due_on !== null && t.due_on <= today) || top.has(t.id)))
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.sort - b.sort)
}

export type Triage = { kind: 'tomorrow' } | { kind: 'day'; day: Day } | { kind: 'none' } | { kind: 'drop' }
export interface TriagePatch { start_on?: Day | null; due_on?: Day | null; status?: 'dropped' }
/** `patch` null = nothing to change (with `note` saying why); `error` = refused. */
export interface TriageResult { patch: TriagePatch | null; note?: string; error?: string }

/**
 * What each shutdown button does to one task.
 *  tomorrow: a plain task moves to tomorrow; a hard deadline KEEPS its due date (it is never pushed past the real deadline);
 *            a task already due later (a window) keeps its window.
 *  day:      a plain task moves to that day; a deadline only gets a new "start working from" day, never later than its due date.
 *  none:     a plain task loses its dates; a deadline cannot (that would erase a real deadline).
 *  drop:     status 'dropped' (restorable from Tasks → Dropped); never a delete.
 */
export function triage(t: Pick<Task, 'start_on' | 'due_on' | 'hard_deadline'>, action: Triage, today: Day): TriageResult {
  const tomorrow = addDays(today, 1)
  switch (action.kind) {
    case 'drop': return { patch: { status: 'dropped' } }
    case 'tomorrow':
      if (t.hard_deadline) return { patch: null, note: t.due_on ? `deadline stays on ${t.due_on}` : 'deadline stays' }
      if (t.due_on !== null && t.due_on > today) return { patch: null, note: `already planned for ${t.due_on}` }
      return { patch: { start_on: tomorrow, due_on: tomorrow } }
    case 'day':
      if (action.day < today) return { patch: null, error: 'Pick today or a later day.' }
      if (t.hard_deadline) {
        if (t.due_on !== null && action.day > t.due_on) return { patch: null, error: `A deadline can't start after its due date (${t.due_on}).` }
        return { patch: { start_on: action.day } }
      }
      return { patch: { start_on: action.day, due_on: action.day } }
    case 'none':
      if (t.hard_deadline) return { patch: null, error: 'A deadline keeps its date. Drop it, or pick a start day.' }
      return { patch: { start_on: null, due_on: null } }
  }
}

/** "Roll everything to tomorrow": the patches to send and how many deadlines kept their dates. */
export function rollToTomorrow(tasks: Task[], today: Day): { changes: { id: string; patch: TriagePatch }[]; keptDeadlines: number; unchanged: number } {
  const changes: { id: string; patch: TriagePatch }[] = []
  let keptDeadlines = 0
  let unchanged = 0
  for (const t of tasks) {
    const r = triage(t, { kind: 'tomorrow' }, today)
    if (r.patch) changes.push({ id: t.id, patch: r.patch })
    else if (t.hard_deadline) keptDeadlines++
    else unchanged++
  }
  return { changes, keptDeadlines, unchanged }
}

export const MOODS = [1, 2, 3, 4, 5] as const
export const validScale = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 5)

/** Top 3 progress: the ones still open, the ones done, and how many there are (dropped or deleted ones don't count). */
export function top3Progress(row: Pick<DayRow, 'top3'> | null, tasks: Task[]): { open: Task[]; done: Task[]; total: number } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const picked = (row?.top3 ?? []).map((id) => byId.get(id)).filter((t): t is Task => !!t && isTopLevel(t) && t.status !== 'dropped')
  const open = picked.filter(isOpen)
  const done = picked.filter((t) => t.status === 'done')
  return { open, done, total: open.length + done.length }
}
