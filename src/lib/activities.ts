// Activities (SPEC §16): the repeat things — Kriya, Padmasadna, Home Workout, Gym — that are one-tap buttons, not tasks.
// An activity is a row of `taskflow_presets`; one tap is a stopped `taskflow_sessions` row (source 'preset') with one segment.
// Pure functions only. A log belongs to the Toronto day it ENDED on, so "Gym this week" never double-counts a session across midnight.

import { dayOf, splitByDay, weekBounds, type Day, type DaySegment, type Instant } from './time'

export interface Activity {
  id: string
  name: string
  area_id: string
  default_minutes: number
  weekly_target: number | null
  sort: number
  archived: boolean
}

/** A stopped activity session (what an activity-button tap writes). */
export interface ActivityLog {
  id: string
  area_id: string
  preset_id: string | null
  started_at: string
  ended_at: string
}

export const MAX_ACTIVITY_MINUTES = 1440

export const byActivitySort = (a: Activity, b: Activity) => a.sort - b.sort || a.name.localeCompare(b.name)
export const activeActivities = (list: Activity[]) => list.filter((a) => !a.archived).sort(byActivitySort)
export const nextActivitySort = (list: Activity[]) => list.reduce((m, a) => Math.max(m, a.sort), -1) + 1

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A message, or null when the activity can be saved. Names are unique (archived ones count: the database key does too). */
export function validateActivity(input: { name: string; default_minutes: number; weekly_target: number | null }, list: Activity[], ignoreId?: string): string | null {
  if (!input.name.trim()) return 'Give the activity a name.'
  if (list.some((a) => a.id !== ignoreId && sameName(a.name, input.name))) return 'An activity with that name already exists.'
  if (!Number.isInteger(input.default_minutes) || input.default_minutes < 1 || input.default_minutes > MAX_ACTIVITY_MINUTES) return 'Default minutes must be between 1 and 1440.'
  if (input.weekly_target !== null && (!Number.isInteger(input.weekly_target) || input.weekly_target < 1 || input.weekly_target > 99)) return 'The weekly target must be a whole number, or empty for none.'
  return null
}

/** A message, or null when a log of `minutes` ending at `endedAt` can be written. */
export function validateLog(minutes: number, endedAt: Date, now: Date): string | null {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ACTIVITY_MINUTES) return 'Minutes must be between 1 and 1440.'
  if (Number.isNaN(endedAt.getTime())) return 'Pick a date and time.'
  if (endedAt.getTime() > now.getTime() + 60_000) return 'That time is in the future.'
  return null
}

/** The row an activity tap writes (also what the screen shows before the database confirms). The id is chosen by the client so a retry can't duplicate. */
export function buildLog(activity: Pick<Activity, 'id' | 'area_id'>, minutes: number, endedAt: Instant, id: string): ActivityLog {
  const end = new Date(endedAt)
  return { id, area_id: activity.area_id, preset_id: activity.id, started_at: new Date(end.getTime() - minutes * 60_000).toISOString(), ended_at: end.toISOString() }
}

export const logMinutes = (l: ActivityLog) => Math.round((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 60_000)
export const logDay = (l: ActivityLog): Day => dayOf(l.ended_at)
export const logsOf = (logs: ActivityLog[], activityId: string) => logs.filter((l) => l.preset_id === activityId)

/** This week's logs of one activity, newest first (week per the week-start setting). */
export function weekLogs(logs: ActivityLog[], activityId: string, today: Day, weekStart = 1): ActivityLog[] {
  const w = weekBounds(today, weekStart)
  return logsOf(logs, activityId).filter((l) => { const d = logDay(l); return d >= w.start && d <= w.end }).sort((a, b) => b.ended_at.localeCompare(a.ended_at))
}

export const weekCount = (logs: ActivityLog[], activityId: string, today: Day, weekStart = 1) => weekLogs(logs, activityId, today, weekStart).length
export const doneToday = (logs: ActivityLog[], activityId: string, today: Day) => logsOf(logs, activityId).some((l) => logDay(l) === today)

/** "2 this week", or "2/3 this week" with a target. */
export const weekLabel = (count: number, target: number | null) => (target ? `${count}/${target} this week` : `${count} this week`)

/** Minutes per Toronto day for a set of logs; a log across midnight is split between the two days (23 h / 25 h days included). */
export function minutesByDay(logs: ActivityLog[]): Map<Day, number> {
  const out = new Map<Day, number>()
  for (const l of logs) for (const s of splitByDay(l.started_at, l.ended_at)) out.set(s.day, (out.get(s.day) ?? 0) + s.minutes)
  return out
}

export const segmentsOf = (l: ActivityLog): DaySegment[] => splitByDay(l.started_at, l.ended_at)

/** Total minutes of logs between two days inclusive, per tag id. */
export function minutesByTag(logs: ActivityLog[], from: Day, to: Day): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of logs) {
    const m = segmentsOf(l).filter((s) => s.day >= from && s.day <= to).reduce((n, s) => n + s.minutes, 0)
    if (m > 0) out.set(l.area_id, (out.get(l.area_id) ?? 0) + m)
  }
  return out
}

// ───────────── Realtime merge ─────────────
export interface LogChange { type: 'INSERT' | 'UPDATE' | 'DELETE'; row?: ActivityLog & { source?: string; state?: string }; id?: string }

/** Folds one realtime event on taskflow_sessions into the list; only stopped preset sessions are activity logs. */
export function applyLogChange(logs: ActivityLog[], c: LogChange): ActivityLog[] {
  if (c.type === 'DELETE') return c.id ? logs.filter((l) => l.id !== c.id) : logs
  const r = c.row
  if (!r) return logs
  const isLog = r.source === 'preset' && r.state === 'stopped' && !!r.ended_at
  const rest = logs.filter((l) => l.id !== r.id)
  if (!isLog) return rest
  return [...rest, { id: r.id, area_id: r.area_id, preset_id: r.preset_id, started_at: r.started_at, ended_at: r.ended_at }]
}
