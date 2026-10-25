// Task rules (SPEC §3, revision 2). Pure functions — components and the data layer only call these.
// "today" is always passed in (a Toronto day from time.ts) so every rule is testable around midnight and DST.
//
// Dates follow Things 3 / OmniFocus: `start_on` controls when a task shows up, `due_on` is the day (or window end) it
// must be done by, and `hard_deadline` marks a real external deadline.
//   No date   → start null, due null          On a day → start = due = day
//   Window    → start < due, not a deadline   Deadline → due set, hard_deadline true, optional start ("start working from")
// A task with a due date and no start (everything created before revision 2) is active now and shows "N days left".

import { addDays, dayOf, diffDays, formatDay, formatDuration, isDay, monthBounds, weekBounds, type Day } from './time'

export type TaskStatus = 'todo' | 'doing' | 'done' | 'dropped'

export interface Task {
  id: string
  user_id?: string
  title: string
  description: string | null
  area_id: string | null // the task's tag
  project_id: string | null
  parent_id: string | null
  start_on: Day | null
  due_on: Day | null
  hard_deadline: boolean
  estimate_minutes: number | null
  priority: number // 1 = high, 2 = normal, 3 = low
  status: TaskStatus
  owner: string
  waiting_on: string | null
  tags: string[] // shown as "Labels"
  completed_at: string | null
  sort: number
  from_note_id: string | null
  created_at: string
  updated_at: string
}

export const PRIORITY_LABEL: Record<number, string> = { 1: 'High', 2: 'Normal', 3: 'Low' }
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done', dropped: 'Dropped' }
export const DEADLINE_HORIZON_DAYS = 14

// ───────────── Basic state ─────────────
export const isOpen = (t: Task) => t.status === 'todo' || t.status === 'doing'
export const isTopLevel = (t: Task) => t.parent_id === null

/** Not started yet: hidden from Today until its start day. */
export const isUpcoming = (t: Task, today: Day) => isOpen(t) && t.start_on !== null && t.start_on > today
/** Open and already started (or never had a start day). */
export const isActive = (t: Task, today: Day) => isOpen(t) && !isUpcoming(t, today)

/** Missed is computed, never stored. A task is missed when its day (or window) ended without it being done… */
export const isTaskMissed = (t: Task, today: Day) => isOpen(t) && !t.hard_deadline && t.due_on !== null && t.due_on < today
/** …and a deadline is missed when a hard deadline passed. Counted separately. */
export const isDeadlineMissed = (t: Task, today: Day) => isOpen(t) && t.hard_deadline && t.due_on !== null && t.due_on < today
export const isMissed = (t: Task, today: Day) => isTaskMissed(t, today) || isDeadlineMissed(t, today)

/** The Toronto day a task was completed, or null. */
export const completedDay = (t: Task): Day | null => (t.status === 'done' && t.completed_at ? dayOf(t.completed_at) : null)

/** Finished after its due day. Still counts as missed (task or deadline) in history. */
export function isDoneLate(t: Task): boolean {
  const c = completedDay(t)
  return c !== null && t.due_on !== null && c > t.due_on
}

/** Moving a task to/from `done` keeps completed_at honest. */
export function applyStatus(t: Pick<Task, 'status' | 'completed_at'>, status: TaskStatus, now: Date): { status: TaskStatus; completed_at: string | null } {
  if (status === 'done') return { status, completed_at: t.status === 'done' && t.completed_at ? t.completed_at : now.toISOString() }
  return { status, completed_at: null }
}

// ───────────── "When" ─────────────
export type WhenKind = 'none' | 'day' | 'window' | 'deadline'
export type WhenValue =
  | { kind: 'none' }
  | { kind: 'day'; day: Day }
  | { kind: 'window'; start: Day | null; end: Day } // start null = "from now" (tasks made before revision 2)
  | { kind: 'deadline'; due: Day; startFrom: Day | null }

export function whenOf(t: Pick<Task, 'start_on' | 'due_on' | 'hard_deadline'>): WhenValue {
  if (t.hard_deadline && t.due_on) return { kind: 'deadline', due: t.due_on, startFrom: t.start_on }
  if (!t.due_on) return { kind: 'none' }
  if (t.start_on === t.due_on) return { kind: 'day', day: t.due_on }
  return { kind: 'window', start: t.start_on, end: t.due_on }
}

export function whenPatch(w: WhenValue): { start_on: Day | null; due_on: Day | null; hard_deadline: boolean } {
  switch (w.kind) {
    case 'none': return { start_on: null, due_on: null, hard_deadline: false }
    case 'day': return { start_on: w.day, due_on: w.day, hard_deadline: false }
    case 'window': return { start_on: w.start, due_on: w.end, hard_deadline: false }
    case 'deadline': return { start_on: w.startFrom, due_on: w.due, hard_deadline: true }
  }
}

/** A message, or null when the When value can be saved. */
export function validateWhen(w: WhenValue): string | null {
  const bad = (d: Day | null) => d !== null && !isDay(d)
  switch (w.kind) {
    case 'none': return null
    case 'day': return isDay(w.day) ? null : 'Pick a day.'
    case 'window':
      if (!isDay(w.end)) return 'Pick the day the window ends.'
      if (bad(w.start)) return 'The window start is not a real day.'
      return w.start !== null && w.start > w.end ? 'The window must end on or after its start.' : null
    case 'deadline':
      if (!isDay(w.due)) return 'Pick the deadline day.'
      if (bad(w.startFrom)) return '“Start working from” is not a real day.'
      return w.startFrom !== null && w.startFrom > w.due ? '“Start working from” must be on or before the deadline.' : null
  }
}

export type WindowPreset = 'this_week' | 'next_7' | 'next_14' | 'this_month'
export const WINDOW_PRESETS: { key: WindowPreset; label: string }[] = [
  { key: 'this_week', label: 'This week' }, { key: 'next_7', label: 'Next 7 days' },
  { key: 'next_14', label: 'Next 2 weeks' }, { key: 'this_month', label: 'This month' },
]

/** Presets start today and end at the week's last day (per the week-start setting), 6 or 13 days on, or month end. */
export function windowPreset(key: WindowPreset, today: Day, weekStart: number): { start: Day; end: Day } {
  switch (key) {
    case 'this_week': return { start: today, end: weekBounds(today, weekStart).end }
    case 'next_7': return { start: today, end: addDays(today, 6) }
    case 'next_14': return { start: today, end: addDays(today, 13) }
    case 'this_month': return { start: today, end: monthBounds(today).end }
  }
}

// ───────────── Chips ─────────────
export interface Chip { text: string; tone: 'neutral' | 'info' | 'amber' | 'red' | 'green' }
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** What the row shows about timing: starts, today, window days left, deadline countdown, Missed / Late. */
export function taskChips(t: Task, today: Day): Chip[] {
  const chips: Chip[] = []
  if (t.status === 'dropped') return [{ text: 'Dropped', tone: 'neutral' }]
  if (t.status === 'done') {
    if (isDoneLate(t)) chips.push({ text: t.hard_deadline ? '⚑ Deadline late' : 'Late', tone: 'amber' })
  } else if (t.due_on) {
    if (isUpcoming(t, today)) {
      chips.push({ text: `Starts ${t.start_on === addDays(today, 1) ? 'tomorrow' : formatDay(t.start_on!)}`, tone: 'neutral' })
    } else if (isDeadlineMissed(t, today)) {
      chips.push({ text: '⚑ Deadline missed', tone: 'red' })
    } else if (isTaskMissed(t, today)) {
      chips.push({ text: 'Missed', tone: 'red' })
    } else if (t.hard_deadline) {
      const n = diffDays(today, t.due_on)
      chips.push({ text: n === 0 ? '⚑ Deadline today' : n === 1 ? '⚑ Deadline tomorrow' : `⚑ Deadline in ${n} days`, tone: n <= 2 ? 'red' : n <= 7 ? 'amber' : 'neutral' })
    } else if (t.due_on === today && (t.start_on === null || t.start_on === t.due_on)) {
      chips.push({ text: 'Today', tone: 'info' })
    } else if (t.start_on === t.due_on) {
      chips.push({ text: t.due_on === addDays(today, 1) ? 'Tomorrow' : formatDay(t.due_on), tone: 'neutral' })
    } else {
      const left = diffDays(today, t.due_on) + 1 // counting today
      const label = left === 1 ? 'last day' : `${plural(left, 'day')} left`
      chips.push({ text: t.start_on ? `Window · ${label}` : label, tone: left <= 1 ? 'amber' : 'neutral' })
    }
  }
  if (t.estimate_minutes) chips.push({ text: `est ${formatDuration(t.estimate_minutes)}`, tone: 'neutral' })
  return chips
}

// ───────────── Counters ─────────────
export type WindowKey = 'today' | 'week' | 'month' | 'all'
export interface DayWindow { from: Day | null; to: Day | null } // null = unbounded
export interface Counts { done: number; missed: number; deadlinesMissed: number; left: number }

export function windowFor(key: WindowKey, today: Day, weekStart = 1): DayWindow {
  if (key === 'today') return { from: today, to: today }
  if (key === 'week') { const w = weekBounds(today, weekStart); return { from: w.start, to: w.end } }
  if (key === 'month') { const m = monthBounds(today); return { from: m.start, to: m.end } }
  return { from: null, to: null }
}

const inWindow = (d: Day | null, w: DayWindow) => d !== null && (w.from === null || d >= w.from) && (w.to === null || d <= w.to)

/**
 * done            = completed (on time or late) with its completion day in the window
 * missed          = a normal task due in the window that is still open past due, or was finished late
 * deadlinesMissed = the same for hard deadlines
 * left            = active open tasks, not yet overdue, due in the window; for "all time", every active open task (undated too)
 * Only top-level tasks count (sub-tasks are checklist items). Dropped tasks count nowhere.
 */
export function counts(tasks: Task[], today: Day, key: WindowKey, weekStart = 1): Counts {
  const w = windowFor(key, today, weekStart)
  const out: Counts = { done: 0, missed: 0, deadlinesMissed: 0, left: 0 }
  for (const t of tasks) {
    if (!isTopLevel(t) || t.status === 'dropped') continue
    if (inWindow(completedDay(t), w)) out.done++
    if (inWindow(t.due_on, w) && (isMissed(t, today) || isDoneLate(t))) {
      if (t.hard_deadline) out.deadlinesMissed++
      else out.missed++
    }
    if (isActive(t, today) && !isMissed(t, today) && (key === 'all' || (t.due_on !== null && t.due_on >= today && inWindow(t.due_on, w)))) out.left++
  }
  return out
}

export interface RangeStats { done: Task[]; missed: Task[]; deadlinesMissed: Task[] }

/** Insights → Range: what was done, and what was missed (tasks and deadlines apart), between two days inclusive. */
export function rangeStats(tasks: Task[], from: Day, to: Day, today: Day): RangeStats {
  const w: DayWindow = { from, to }
  const top = tasks.filter((t) => isTopLevel(t) && t.status !== 'dropped')
  const late = (t: Task) => isMissed(t, today) || isDoneLate(t)
  const byDue = (a: Task, b: Task) => (a.due_on ?? '').localeCompare(b.due_on ?? '') || compareTasks(a, b)
  return {
    done: top.filter((t) => inWindow(completedDay(t), w)).sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? '')),
    missed: top.filter((t) => !t.hard_deadline && inWindow(t.due_on, w) && late(t)).sort(byDue),
    deadlinesMissed: top.filter((t) => t.hard_deadline && inWindow(t.due_on, w) && late(t)).sort(byDue),
  }
}

/** Insights → Day: everything finished that day (sub-tasks included), in the order it was done. */
export function completedOn(tasks: Task[], day: Day): Task[] {
  return tasks.filter((t) => completedDay(t) === day).sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
}

// ───────────── Ordering ─────────────
export function compareTasks(a: Task, b: Task): number {
  if (a.sort !== b.sort) return a.sort - b.sort
  if (a.due_on !== b.due_on) return a.due_on === null ? 1 : b.due_on === null ? -1 : a.due_on < b.due_on ? -1 : 1
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

/** Sort value for a new task: the bottom of the list. */
export function nextSort(tasks: Task[]): number {
  return tasks.reduce((m, t) => Math.max(m, t.sort), 0) + 10
}

/**
 * Move one item up or down inside its (already ordered) group. Returns only the sort changes to write.
 * Reuses the group's existing sort slots so hidden items keep their relative place; if slots collide (all 0), renumbers 10, 20, …
 */
export function reorderWithin<T extends { id: string; sort: number }>(group: T[], id: string, dir: 'up' | 'down'): { id: string; sort: number }[] {
  const i = group.findIndex((t) => t.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= group.length) return []
  const order = [...group]
  ;[order[i], order[j]] = [order[j], order[i]]
  let slots = group.map((t) => t.sort).sort((a, b) => a - b)
  if (new Set(slots).size !== slots.length) slots = group.map((_, k) => (k + 1) * 10)
  const changes: { id: string; sort: number }[] = []
  order.forEach((t, k) => { if (t.sort !== slots[k]) changes.push({ id: t.id, sort: slots[k] }) })
  return changes
}

// ───────────── Views (Tasks screen) ─────────────
export type ViewKey = 'today' | 'upcoming' | 'deadlines' | 'anytime' | 'done'
export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'deadlines', label: 'Deadlines' },
  { key: 'anytime', label: 'Anytime' }, { key: 'done', label: 'Done' },
]

export interface TaskGroup { key: string; label: string; tasks: Task[] }

const deadlineSoon = (t: Task, today: Day) => t.hard_deadline && t.due_on !== null && t.due_on <= addDays(today, DEADLINE_HORIZON_DAYS)

export function inView(t: Task, view: ViewKey, today: Day): boolean {
  switch (view) {
    case 'today': return isActive(t, today) && t.due_on !== null && (!t.hard_deadline || deadlineSoon(t, today))
    case 'upcoming': return isUpcoming(t, today)
    case 'deadlines': return isOpen(t) && t.hard_deadline
    case 'anytime': return isOpen(t) && t.due_on === null && t.start_on === null
    case 'done': return t.status === 'done' || t.status === 'dropped'
  }
}

const dayLabel = (d: Day, today: Day) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : d === addDays(today, -1) ? 'Yesterday' : formatDay(d))
const byDueThenOrder = (a: Task, b: Task) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || compareTasks(a, b)

/** The tasks of one view, grouped for display. Expects the tasks already filtered by the user's tag/project/owner/label filter. */
export function groupForView(tasks: Task[], view: ViewKey, today: Day): TaskGroup[] {
  const list = tasks.filter((t) => inView(t, view, today))
  const make = (key: string, label: string, ts: Task[], cmp: (a: Task, b: Task) => number = compareTasks): TaskGroup[] =>
    ts.length ? [{ key, label, tasks: [...ts].sort(cmp) }] : []

  switch (view) {
    case 'today':
      return [
        ...make('missed', 'Missed', list.filter((t) => isMissed(t, today)), byDueThenOrder),
        ...make('deadlines', 'Deadlines coming up', list.filter((t) => !isMissed(t, today) && t.hard_deadline), byDueThenOrder),
        ...make('today', 'Today', list.filter((t) => !isMissed(t, today) && !t.hard_deadline && t.due_on === today)),
        ...make('window', 'In a window', list.filter((t) => !isMissed(t, today) && !t.hard_deadline && t.due_on !== today), byDueThenOrder),
      ]
    case 'upcoming': {
      const days = [...new Set(list.map((t) => t.start_on!))].sort()
      return days.flatMap((d) => make(d, dayLabel(d, today), list.filter((t) => t.start_on === d)))
    }
    case 'deadlines':
      return [
        ...make('missed', 'Missed', list.filter((t) => t.due_on! < today), byDueThenOrder),
        ...make('soon', 'Within 7 days', list.filter((t) => t.due_on! >= today && t.due_on! <= addDays(today, 7)), byDueThenOrder),
        ...make('later', 'Later', list.filter((t) => t.due_on! > addDays(today, 7)), byDueThenOrder),
      ]
    case 'anytime':
      return make('anytime', 'No date', list)
    case 'done': {
      const days = [...new Set(list.map(completedDay).filter((d): d is Day => d !== null))].sort().reverse()
      const newest = (a: Task, b: Task) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
      return [
        ...days.flatMap((d) => make(d, dayLabel(d, today), list.filter((t) => completedDay(t) === d), newest)),
        ...make('dropped', 'Dropped', list.filter((t) => completedDay(t) === null)),
      ]
    }
  }
}

/** What the Today screen lists (top-level tasks only), plus what was finished today so it can be un-ticked. */
export function todaySections(tasks: Task[], today: Day) {
  const top = tasks.filter(isTopLevel)
  const open = top.filter((t) => isActive(t, today))
  const horizon = addDays(today, DEADLINE_HORIZON_DAYS)
  return {
    missed: open.filter((t) => isMissed(t, today)).sort(byDueThenOrder),
    deadlines: open.filter((t) => t.hard_deadline && t.due_on !== null && t.due_on >= today && t.due_on <= horizon).sort(byDueThenOrder),
    today: open.filter((t) => !t.hard_deadline && t.due_on === today).sort(compareTasks),
    inWindow: open.filter((t) => !t.hard_deadline && t.due_on !== null && t.due_on > today).sort(byDueThenOrder),
    noDate: open.filter((t) => t.due_on === null).sort(compareTasks),
    doneToday: top.filter((t) => completedDay(t) === today).sort(compareTasks),
  }
}

// ───────────── Filters ─────────────
export interface TaskFilter {
  areaIds?: Set<string> // a tag; for a parent, the parent and its sub-tags (tags.ts tagIdsFor)
  project?: string
  owner?: string
  label?: string
}
export const NO_FILTER: TaskFilter = {}

export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  return tasks.filter((t) => {
    if (f.areaIds && (t.area_id === null || !f.areaIds.has(t.area_id))) return false
    if (f.project && t.project_id !== f.project) return false
    if (f.owner && t.owner !== f.owner) return false
    if (f.label && !t.tags.includes(f.label)) return false
    return true
  })
}

// ───────────── Sub-tasks ─────────────
export const childrenOf = (tasks: Task[], parentId: string) => tasks.filter((t) => t.parent_id === parentId).sort(compareTasks)

export function subtaskProgress(tasks: Task[], parentId: string): { done: number; total: number } {
  const kids = tasks.filter((t) => t.parent_id === parentId && t.status !== 'dropped')
  return { done: kids.filter((t) => t.status === 'done').length, total: kids.length }
}

// ───────────── Input ─────────────
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))]
}

export interface NewTaskInput {
  title: string
  due_on?: Day | null // quick add: a date means "on that day" (start = due)
  area_id?: string | null
  project_id?: string | null
  parent_id?: string | null
}

/** Builds a full row for a new task, or null if the title is empty or the date is not a real day. */
export function buildNewTask(input: NewTaskInput, sort: number, now: Date, id: string): Task | null {
  const title = input.title.trim()
  if (!title) return null
  if (input.due_on && !isDay(input.due_on)) return null
  const iso = now.toISOString()
  const due = input.due_on || null
  return {
    id, title, description: null,
    area_id: input.area_id ?? null, project_id: input.project_id ?? null, parent_id: input.parent_id ?? null,
    start_on: due, due_on: due, hard_deadline: false, estimate_minutes: null,
    priority: 2, status: 'todo', owner: 'me', waiting_on: null, tags: [],
    completed_at: null, sort, from_note_id: null, created_at: iso, updated_at: iso,
  }
}

// ───────────── Realtime merge ─────────────
export interface TaskChange { type: 'INSERT' | 'UPDATE' | 'DELETE'; row?: Task; id?: string }

/** Folds one realtime event into the list. Ignores an event older than what we already hold (out-of-order echo of our own write). */
export function applyChange(tasks: Task[], c: TaskChange): Task[] {
  if (c.type === 'DELETE') {
    if (!c.id) return tasks
    return tasks.filter((t) => t.id !== c.id && t.parent_id !== c.id)
  }
  const row = c.row
  if (!row) return tasks
  const i = tasks.findIndex((t) => t.id === row.id)
  if (i < 0) return [...tasks, row]
  if (row.updated_at < tasks[i].updated_at) return tasks
  const next = [...tasks]
  next[i] = row
  return next
}
