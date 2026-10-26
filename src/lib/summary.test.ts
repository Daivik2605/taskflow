import { describe, expect, it } from 'vitest'
import type { Activity, ActivityLog } from './activities'
import { logDay } from './activities'
import type { Counter, CounterEvent } from './counters'
import { area, done, task } from './fixtures'
import type { Goal } from './goals'
import { periodSummary, type SummaryInputs } from './summary'
import { completedDay, isDoneLate, type Task } from './tasks'
import { dayOf } from './time'
import { average, buildWeekReview, compareTags, deadlinesAhead, reviewWeekFor, weekPair } from './weekReview'

// Week Mon 2 Nov – Sun 8 Nov 2026; "today" is Tue 10 Nov. The week before is 26 Oct – 1 Nov.
const TODAY = '2026-11-10'
const FROM = '2026-11-02'
const TO = '2026-11-08'

const areas = [
  area({ id: 'study', name: 'Study', kind: 'study' }),
  area({ id: 'dsa', name: 'DSA', kind: 'study', parent_id: 'study' }),
  area({ id: 'work', name: 'Work', kind: 'work' }),
]
const counters: Counter[] = [{ id: 'cig', name: 'Cigarette', short_label: 'Cig', color: '#000', sort: 0, archived: false, reasons: null }]
const ev = (id: string, day: string, qty = 1): CounterEvent => ({ id, counter_id: 'cig', at: `${day}T15:00:00Z`, day, qty, note: null, reason: null })
const events = [ev('e1', '2026-11-03', 3), ev('e2', '2026-11-04'), ev('e3', '2026-10-30', 5), ev('e4', '2026-11-09', 9)]
const activities: Activity[] = [{ id: 'gym', name: 'Gym', area_id: 'work', default_minutes: 60, weekly_target: 3, allow_multiple: false, sort: 0, archived: false }]
const log = (id: string, area_id: string, preset: string | null, start: string, end: string): ActivityLog => ({ id, area_id, preset_id: preset, started_at: start, ended_at: end })
const sessions: ActivityLog[] = [
  log('s1', 'dsa', null, '2026-11-03T15:00:00Z', '2026-11-03T16:00:00Z'), // 60 min study/DSA
  log('s2', 'work', 'gym', '2026-11-04T15:00:00Z', '2026-11-04T15:30:00Z'), // 30 min work (a gym log)
  log('s3', 'work', 'gym', '2026-11-05T15:00:00Z', '2026-11-05T15:45:00Z'), // 45 min work (a gym log)
  log('s4', 'study', null, '2026-10-29T15:00:00Z', '2026-10-29T17:00:00Z'), // the week before: 120 min study
]
const logs = sessions.filter((s) => s.preset_id !== null)

const tasks: Task[] = [
  done('2026-11-04', '2026-11-04T15:00:00Z', { title: 'on time' }),
  done('2026-11-03', '2026-11-06T15:00:00Z', { title: 'done late' }), // finished after its day: still missed
  task({ title: 'open missed', due_on: '2026-11-05' }),
  task({ title: 'deadline missed', due_on: '2026-11-06', hard_deadline: true }),
  done('2026-11-02', '2026-11-04T16:00:00Z', { title: 'deadline done late', hard_deadline: true }),
  task({ title: 'dropped', due_on: '2026-11-04', status: 'dropped' }),
  task({ title: 'dropped deadline', due_on: '2026-11-04', hard_deadline: true, status: 'dropped' }),
  done('2026-10-30', '2026-10-30T15:00:00Z', { title: 'last week' }),
  done('2026-11-04', '2026-11-04T17:00:00Z', { title: 'a sub-task', parent_id: 'x' }),
  task({ title: 'next deadline', due_on: '2026-11-18', hard_deadline: true }),
  task({ title: 'far deadline', due_on: '2026-12-31', hard_deadline: true }),
]

const goal = (over: Partial<Goal>): Goal => ({ id: 'g', series_id: 'g', name: '', metric: 'tag_minutes', target_id: 'study', direction: 'at_least', amount: 120, period: 'week', starts_on: '2026-10-01', ends_on: null, paused: false, sort: 0, ...over })
const goals: Goal[] = [
  goal({ id: 'g1', series_id: 'g1', metric: 'tag_minutes', target_id: 'study', amount: 120, period: 'week' }),
  goal({ id: 'g2', series_id: 'g2', metric: 'counter_count', target_id: 'cig', direction: 'at_most', amount: 2, period: 'day', sort: 1 }),
]

const inputs: SummaryInputs = { tasks, events, sessions, logs, areas, daysOff: new Set(), weekStart: 1, goals, counters, activities }

// Independent re-computation from the raw rows (no summary.ts / tasks.ts range helpers), to check the shared functions against.
function naive(from: string, to: string) {
  const inR = (d: string | null) => d !== null && d >= from && d <= to
  const top = tasks.filter((t) => t.parent_id === null && t.status !== 'dropped')
  const lateOrMissed = (t: Task) => (t.status === 'todo' && t.due_on !== null && t.due_on < TODAY) || isDoneLate(t)
  return {
    done: top.filter((t) => inR(completedDay(t))).map((t) => t.title).sort(),
    missed: top.filter((t) => !t.hard_deadline && inR(t.due_on) && lateOrMissed(t)).map((t) => t.title).sort(),
    deadlinesMissed: top.filter((t) => t.hard_deadline && inR(t.due_on) && lateOrMissed(t)).map((t) => t.title).sort(),
    minutes: sessions.filter((s) => inR(dayOf(s.started_at))).reduce((n, s) => n + (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000, 0),
    cig: events.filter((e) => inR(e.day)).reduce((n, e) => n + e.qty, 0),
    gym: logs.filter((l) => l.preset_id === 'gym' && inR(logDay(l))).length,
  }
}

describe('periodSummary equals Insights and the raw rows for the same range', () => {
  const s = periodSummary(inputs, FROM, TO, TODAY)
  const n = naive(FROM, TO)

  it('tasks: done, missed and deadlines missed, including a deadline-missed task and a done-late task (still missed)', () => {
    const titles = (ts: Task[]) => ts.map((t) => t.title).sort()
    expect(titles(s.tasks.done)).toEqual(n.done)
    expect(titles(s.tasks.missed)).toEqual(n.missed)
    expect(titles(s.tasks.deadlinesMissed)).toEqual(n.deadlinesMissed)
    // the hand-counted numbers
    expect(titles(s.tasks.done)).toEqual(['deadline done late', 'done late', 'on time'])
    expect(titles(s.tasks.missed)).toEqual(['done late', 'open missed'])
    expect(titles(s.tasks.deadlinesMissed)).toEqual(['deadline done late', 'deadline missed'])
    // dropped counts nowhere, sub-tasks aren't counted
    for (const list of [s.tasks.done, s.tasks.missed, s.tasks.deadlinesMissed]) expect(titles(list)).not.toContain('dropped')
    expect(titles(s.tasks.done)).not.toContain('a sub-task')
  })
  it('time by tag adds up to the raw minutes, with the sub-tag under its parent', () => {
    expect(s.totalMinutes).toBe(n.minutes)
    expect(s.totalMinutes).toBe(135)
    expect(s.tags.map((r) => [r.tag.name, r.total])).toEqual([['Study', 60], ['Work', 75]])
    expect(s.tags[0]!.kids.map((k) => [k.tag.name, k.minutes])).toEqual([['DSA', 60]])
  })
  it('counters and activities', () => {
    expect(s.counters.map((c) => c.total)).toEqual([n.cig])
    expect(n.cig).toBe(4)
    expect(s.activities.map((a) => [a.activity.name, a.count, a.target])).toEqual([['Gym', n.gym, 3]])
    expect(n.gym).toBe(2)
  })
  it('goals: a week goal judged once, a daily limit judged per day', () => {
    const [week, day] = s.goals
    expect(week!.results).toHaveLength(1)
    expect(week!.results[0]!.result).toMatchObject({ value: 60, amount: 120, status: 'miss' })
    expect(week!.passing).toBe(0)
    expect(day!.judged).toBe(7)
    expect(day!.passing).toBe(6) // 3 cigarettes on Tue 3 Nov broke the limit of 2
  })
  it('a single day (the shutdown) agrees with a one-day range', () => {
    const d = periodSummary(inputs, '2026-11-04', '2026-11-04', TODAY)
    const nd = naive('2026-11-04', '2026-11-04')
    expect(d.tasks.done.map((t) => t.title).sort()).toEqual(nd.done)
    expect(d.totalMinutes).toBe(nd.minutes)
    expect(d.counters[0]!.total).toBe(nd.cig)
    expect(d.goals.find((g) => g.series_id === 'g1')).toBeUndefined() // a week goal isn't judged on one day
  })
  it('the previous week is summarised the same way', () => {
    const p = weekPair(FROM).before
    const b = periodSummary(inputs, p.from, p.to, TODAY)
    const nb = naive(p.from, p.to)
    expect(b.tasks.done.map((t) => t.title).sort()).toEqual(nb.done)
    expect(b.totalMinutes).toBe(nb.minutes)
    expect(b.counters[0]!.total).toBe(nb.cig)
  })
})

describe('weekly review', () => {
  it('picks the finished week, or the week ending today', () => {
    expect(reviewWeekFor('2026-11-10')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(reviewWeekFor('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }) // Sunday: that week
    expect(reviewWeekFor('2026-11-09')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(reviewWeekFor('2026-11-08', 0)).toEqual({ from: '2026-11-01', to: '2026-11-07' }) // Sunday-start weeks
  })
  it('compares hours by tag with the week before, biggest first', () => {
    const r = buildWeekReview(inputs, [], [], { from: FROM, to: TO }, TODAY)
    expect(r.tagCompare.map((c) => [c.tag.name, c.now, c.before, c.delta])).toEqual([['Work', 75, 0, 75], ['Study', 60, 120, -60]])
    expect(compareTags(r.week, r.before)).toEqual(r.tagCompare)
  })
  it('counts goals met, lists the next 14 days of deadlines and averages mood, energy and sleep', () => {
    const days = [{ day: '2026-11-03', mood: 4, energy: 2 }, { day: '2026-11-04', mood: 2, energy: null }, { day: '2026-10-30', mood: 5, energy: 5 }]
    const r = buildWeekReview(inputs, days, [{ day: '2026-11-03', minutes: 420 }, { day: '2026-11-04', minutes: 480 }], { from: FROM, to: TO }, TODAY)
    expect([r.goalsHit, r.goalsJudged]).toEqual([6, 8])
    expect(r.deadlines.map((t) => t.title)).toEqual(['next deadline'])
    expect(r.averages).toEqual({ mood: 3, energy: 2, sleepMinutes: 450 })
    expect(r.averagesBefore).toEqual({ mood: 5, energy: 5, sleepMinutes: null })
    expect(average([])).toBeNull()
    expect(deadlinesAhead(tasks, '2026-12-20').map((t) => t.title)).toEqual(['far deadline'])
  })
  it('planned vs actual lists the target and the real value for a weekly goal', () => {
    const r = buildWeekReview(inputs, [], [], { from: FROM, to: TO }, TODAY)
    expect(r.plan.map((p) => [p.planned, p.actual])).toEqual([[120, 60], [2, null]])
  })
})
