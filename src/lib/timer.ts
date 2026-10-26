// Timer (SPEC §4): a session is a list of segments; pause closes the open segment, resume opens a new one, stop closes it.
// Elapsed time is always computed from the stored timestamps, so it survives closing the app and switching devices.
// Pure functions only. A "time interval" is any stretch of time on a tag: a timer segment or an activity-button log
// (shaped as ActivityLog so lib/activities.ts `minutesByTag` and the goal maths read both the same way).

import type { ActivityLog } from './activities'
import { minutesByTag } from './activities'
import type { Area, TagKind } from './areas'
import { effectiveKind } from './tags'
import type { Task } from './tasks'
import { splitByDay, type Day } from './time'

export type SessionState = 'running' | 'paused' | 'stopped'
export type SessionSource = 'timer' | 'manual' | 'preset'

export interface Segment { id: string; session_id: string; started_at: string; ended_at: string | null }
export interface Session {
  id: string
  area_id: string
  task_id: string | null
  source: SessionSource
  preset_id: string | null
  comment: string | null
  started_at: string
  ended_at: string | null
  state: SessionState
  segments: Segment[]
}

/** One stretch of time on a tag (a segment, or an activity log). */
export interface Interval extends ActivityLog { task_id?: string | null }

export const MAX_SESSION_MINUTES = 24 * 60
const MIN = 60_000

export const isActive = (s: Session) => s.state !== 'stopped'
export const activeSession = (list: Session[]): Session | null => list.find(isActive) ?? null
export const openSegment = (s: Session): Segment | null => s.segments.find((g) => g.ended_at === null) ?? null

const ms = (iso: string) => new Date(iso).getTime()

/** Milliseconds worked: closed segments plus the open one up to `now`. A stopped session with no segment rows (should not happen) falls back to start–end. */
export function elapsedMs(s: Session, now: Date): number {
  if (s.segments.length === 0) return s.ended_at ? Math.max(0, ms(s.ended_at) - ms(s.started_at)) : 0
  return s.segments.reduce((n, g) => n + Math.max(0, (g.ended_at ? ms(g.ended_at) : now.getTime()) - ms(g.started_at)), 0)
}
export const elapsedMinutes = (s: Session, now: Date) => elapsedMs(s, now) / MIN

/** `1:05:09` for a running clock. */
export function clock(totalMs: number): string {
  const t = Math.max(0, Math.floor(totalMs / 1000))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Every segment as an interval (an open one runs to `now`). */
export function sessionIntervals(sessions: Session[], now: Date): Interval[] {
  const out: Interval[] = []
  for (const s of sessions) {
    if (s.segments.length === 0 && s.ended_at) { out.push({ id: s.id, area_id: s.area_id, preset_id: s.preset_id, started_at: s.started_at, ended_at: s.ended_at, task_id: s.task_id }); continue }
    for (const g of s.segments) {
      const end = g.ended_at ?? now.toISOString()
      if (ms(end) > ms(g.started_at)) out.push({ id: g.id, area_id: s.area_id, preset_id: s.preset_id, started_at: g.started_at, ended_at: end, task_id: s.task_id })
    }
  }
  return out
}

/** Minutes per Toronto day for one session; a segment across midnight is split between the two days. */
export function minutesByDayOf(s: Session, now: Date): Map<Day, number> {
  const out = new Map<Day, number>()
  for (const i of sessionIntervals([s], now)) for (const seg of splitByDay(i.started_at, i.ended_at)) out.set(seg.day, (out.get(seg.day) ?? 0) + seg.minutes)
  return out
}

/** Minutes of a session that fall on one day. */
export const minutesOnDay = (s: Session, day: Day, now: Date) => minutesByDayOf(s, now).get(day) ?? 0

/** Sessions with any time on `day`, in start order. */
export const sessionsOnDay = (list: Session[], day: Day, now: Date) =>
  list.filter((s) => minutesOnDay(s, day, now) > 0).sort((a, b) => a.started_at.localeCompare(b.started_at))

export const tagMinutes = (intervals: Interval[], from: Day, to: Day) => minutesByTag(intervals, from, to)

export interface TagRow { tag: Area; general: number; kids: { tag: Area; minutes: number }[]; total: number }

/** Parent tags with their sub-tags and minutes, parents with no time left out. `byTag` is minutes per tag id. */
export function tagRows(tree: { tag: Area; children: Area[] }[], byTag: Map<string, number>): TagRow[] {
  return tree.map((n) => {
    const kids = n.children.map((c) => ({ tag: c, minutes: byTag.get(c.id) ?? 0 })).filter((k) => k.minutes > 0)
    const general = byTag.get(n.tag.id) ?? 0
    return { tag: n.tag, general, kids, total: general + kids.reduce((m, k) => m + k.minutes, 0) }
  }).filter((r) => r.total > 0)
}

/** Minutes per Toronto day, per parent tag (a sub-tag counts toward its parent): the stacked bar in Insights. */
export function minutesByDayByParent(intervals: Interval[], areas: Area[], from: Day, to: Day): Map<Day, Map<string, number>> {
  const out = new Map<Day, Map<string, number>>()
  for (const i of intervals) {
    const tag = areas.find((a) => a.id === i.area_id)
    const parent = tag?.parent_id ?? tag?.id ?? i.area_id
    for (const seg of splitByDay(i.started_at, i.ended_at)) {
      if (seg.day < from || seg.day > to) continue
      const day = out.get(seg.day) ?? new Map<string, number>()
      day.set(parent, (day.get(parent) ?? 0) + seg.minutes)
      out.set(seg.day, day)
    }
  }
  return out
}

/** Minutes between two days on tags of the given kinds (a sub-tag takes its parent's kind). */
export function minutesOfKinds(intervals: Interval[], areas: Area[], kinds: TagKind[], from: Day, to: Day): number {
  const ok = new Set(areas.filter((a) => kinds.includes(effectiveKind(areas, a.parent_id, a.kind))).map((a) => a.id))
  let total = 0
  for (const [id, m] of minutesByTag(intervals, from, to)) if (ok.has(id)) total += m
  return total
}

/** All-time minutes per task id. */
export function taskMinutes(intervals: Interval[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const i of intervals) {
    if (!i.task_id) continue
    out.set(i.task_id, (out.get(i.task_id) ?? 0) + (ms(i.ended_at) - ms(i.started_at)) / MIN)
  }
  return out
}

/** Tasks ranked by time inside a day range (most first). */
export function topTasks(intervals: Interval[], from: Day, to: Day, limit = 5): { task_id: string; minutes: number }[] {
  const out = new Map<string, number>()
  for (const i of intervals) {
    if (!i.task_id) continue
    for (const seg of splitByDay(i.started_at, i.ended_at)) if (seg.day >= from && seg.day <= to) out.set(i.task_id, (out.get(i.task_id) ?? 0) + seg.minutes)
  }
  return [...out].map(([task_id, minutes]) => ({ task_id, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, limit)
}

export interface EstimateRow { task: Task; estimate: number; actual: number; over: boolean }

/** Tasks that have an estimate and some logged time, with how far over or under they are (actual is all-time minutes). */
export function estimateVsActual(tasks: Task[], byTask: Map<string, number>, only?: Set<string>): EstimateRow[] {
  return tasks
    .filter((t) => t.estimate_minutes && byTask.has(t.id) && (!only || only.has(t.id)))
    .map((t) => { const actual = byTask.get(t.id)!; return { task: t, estimate: t.estimate_minutes!, actual, over: actual > t.estimate_minutes! } })
    .sort((a, b) => b.actual / b.estimate - a.actual / a.estimate)
}

// ───────────── State changes (pure; the database writes mirror these) ─────────────
export function newSession(id: string, segmentId: string, input: { areaId: string; taskId?: string | null; comment?: string | null }, now: Date): Session {
  const iso = now.toISOString()
  return { id, area_id: input.areaId, task_id: input.taskId ?? null, source: 'timer', preset_id: null, comment: input.comment?.trim() || null, started_at: iso, ended_at: null, state: 'running',
    segments: [{ id: segmentId, session_id: id, started_at: iso, ended_at: null }] }
}

export function pause(s: Session, now: Date): Session {
  if (s.state !== 'running') return s
  const iso = now.toISOString()
  return { ...s, state: 'paused', segments: s.segments.map((g) => (g.ended_at === null ? { ...g, ended_at: iso } : g)) }
}

export function resume(s: Session, segmentId: string, now: Date): Session {
  if (s.state !== 'paused') return s
  return { ...s, state: 'running', segments: [...s.segments, { id: segmentId, session_id: s.id, started_at: now.toISOString(), ended_at: null }] }
}

/** Stops the session. `endedAt` ("it ended at…") closes the open segment earlier than now; it can't be before that segment began. */
export function stop(s: Session, now: Date, opts: { endedAt?: Date; comment?: string | null } = {}): Session {
  if (s.state === 'stopped') return s
  const open = openSegment(s)
  const end = opts.endedAt ?? now
  const iso = end.toISOString()
  const segments = s.segments.map((g) => (g.ended_at === null ? { ...g, ended_at: iso } : g))
  const last = segments.reduce<string>((m, g) => (g.ended_at && g.ended_at > m ? g.ended_at : m), s.started_at)
  const comment = opts.comment === undefined ? s.comment : opts.comment?.trim() || null
  return { ...s, state: 'stopped', ended_at: open ? iso : last, segments, comment }
}

/** A message, or null if "it ended at" is acceptable for this session. */
export function validateEndedAt(s: Session, endedAt: Date, now: Date): string | null {
  if (Number.isNaN(endedAt.getTime())) return 'Pick a date and time.'
  if (endedAt.getTime() > now.getTime() + MIN) return 'That time is in the future.'
  const open = openSegment(s)
  if (open && endedAt.getTime() < ms(open.started_at)) return 'That is before this stretch began.'
  return null
}

/** A message, or null when a finished session from `start` to `end` can be saved. */
export function validateSpan(start: Date, end: Date, now: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Pick a start and an end.'
  if (end.getTime() <= start.getTime()) return 'The end must be after the start.'
  if (end.getTime() > now.getTime() + MIN) return 'That time is in the future.'
  if ((end.getTime() - start.getTime()) / MIN > MAX_SESSION_MINUTES) return 'A session can be at most 24 hours.'
  return null
}

/** The row a manual (past) session or an edited one becomes: one stopped segment. */
export function pastSession(id: string, segmentId: string, input: { areaId: string; taskId?: string | null; comment?: string | null; start: Date; end: Date }): Session {
  return { id, area_id: input.areaId, task_id: input.taskId ?? null, source: 'manual', preset_id: null, comment: input.comment?.trim() || null,
    started_at: input.start.toISOString(), ended_at: input.end.toISOString(), state: 'stopped',
    segments: [{ id: segmentId, session_id: id, started_at: input.start.toISOString(), ended_at: input.end.toISOString() }] }
}

/** "Still going?" — a running (not paused) session whose current stretch is at least `hours` old. */
export function stillGoing(s: Session | null, now: Date, hours: number): boolean {
  if (!s || s.state !== 'running' || !(hours > 0)) return false
  const open = openSegment(s)
  return !!open && now.getTime() - ms(open.started_at) >= hours * 3600_000
}

// ───────────── Realtime merge ─────────────
export type TimerChange =
  | { table: 'session'; type: 'INSERT' | 'UPDATE' | 'DELETE'; row?: Omit<Session, 'segments'>; id?: string }
  | { table: 'segment'; type: 'INSERT' | 'UPDATE' | 'DELETE'; row?: Segment; id?: string; session_id?: string }

const timerSource = (src: string) => src !== 'preset' // activity-button sessions belong to the activities provider

/** Folds one realtime event into the list. Returns `null` when the event refers to a session we don't hold yet (the caller reloads). */
export function applyTimerChange(list: Session[], c: TimerChange): Session[] | null {
  if (c.table === 'session') {
    if (c.type === 'DELETE') return c.id ? list.filter((s) => s.id !== c.id) : list
    const r = c.row
    if (!r) return list
    if (!timerSource(r.source)) return list.filter((s) => s.id !== r.id)
    const have = list.find((s) => s.id === r.id)
    const next: Session = { ...r, segments: have?.segments ?? [] }
    return have ? list.map((s) => (s.id === r.id ? next : s)) : [...list, next]
  }
  if (c.type === 'DELETE') return c.id ? list.map((s) => ({ ...s, segments: s.segments.filter((g) => g.id !== c.id) })) : list
  const g = c.row
  if (!g) return list
  const owner = list.find((s) => s.id === g.session_id)
  if (!owner) return null
  return list.map((s) => (s.id !== g.session_id ? s : { ...s, segments: [...s.segments.filter((x) => x.id !== g.id), g].sort((a, b) => a.started_at.localeCompare(b.started_at)) }))
}

export const byStart = (a: Session, b: Session) => a.started_at.localeCompare(b.started_at)
