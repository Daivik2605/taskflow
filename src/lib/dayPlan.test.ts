import { describe, expect, it } from 'vitest'
import { done, task } from './fixtures'
import {
  emptyDay, planCandidates, planCardVisible, rollToTomorrow, shutdownCardVisible, shutdownDue, shutdownMinutes, shutdownTasks, toggleTop3, tomorrowOf, top3Progress, top3Tasks, triage,
} from './dayPlan'
import { todayToronto } from './time'

const TODAY = '2026-11-10'

describe('shutdown time and the Toronto day', () => {
  it('parses HH:MM and falls back to 21:00 on junk', () => {
    expect(shutdownMinutes('21:30')).toBe(1290)
    expect(shutdownMinutes('00:00')).toBe(0)
    expect(shutdownMinutes('25:99')).toBe(1260)
  })
  it('is due from the set time, not before (a normal day)', () => {
    expect(shutdownDue('2026-11-10T01:59:00Z', '21:00')).toBe(false) // 20:59 EST
    expect(shutdownDue('2026-11-10T02:00:00Z', '21:00')).toBe(true) // 21:00 EST
  })
  it('just before and after midnight: 23:59 is the last minute of the day, 00:01 is a new day with no card due', () => {
    expect(todayToronto('2026-10-27T03:59:30Z')).toBe('2026-10-26') // 23:59:30 EDT
    expect(shutdownDue('2026-10-27T03:59:30Z', '23:59')).toBe(true)
    expect(shutdownDue('2026-10-27T03:58:30Z', '23:59')).toBe(false)
    expect(todayToronto('2026-10-27T04:01:00Z')).toBe('2026-10-27') // 00:01 EDT
    expect(shutdownDue('2026-10-27T04:01:00Z', '23:59')).toBe(false)
    expect(shutdownDue('2026-10-27T04:01:00Z', '00:00')).toBe(true) // a midnight shutdown time is due all day
    expect(tomorrowOf('2026-10-27T03:59:30Z')).toBe('2026-10-27')
    expect(tomorrowOf('2026-10-27T04:01:00Z')).toBe('2026-10-28')
  })
  it('on the autumn DST day (25 hours, 1 Nov 2026) 21:00 is still 21:00 on the wall clock', () => {
    expect(shutdownDue('2026-11-02T01:59:00Z', '21:00')).toBe(false) // 20:59 EST
    expect(shutdownDue('2026-11-02T02:01:00Z', '21:00')).toBe(true) // 21:01 EST
    expect(todayToronto('2026-11-02T04:59:00Z')).toBe('2026-11-01') // 23:59 EST
    expect(todayToronto('2026-11-02T05:00:00Z')).toBe('2026-11-02')
    expect(tomorrowOf('2026-11-01T17:00:00Z')).toBe('2026-11-02')
    // the repeated 01:30 hour: both passes are after a 01:30 shutdown time
    expect(shutdownDue('2026-11-01T04:59:00Z', '01:00')).toBe(false) // 00:59 EDT
    expect(shutdownDue('2026-11-01T05:30:00Z', '01:30')).toBe(true) // 01:30 EDT
    expect(shutdownDue('2026-11-01T06:30:00Z', '01:30')).toBe(true) // 01:30 EST (second time)
  })
  it('on the spring DST day (23 hours, 8 Mar 2026) a time inside the skipped hour is due once the clock passes it', () => {
    expect(shutdownDue('2026-03-09T00:59:00Z', '21:00')).toBe(false) // 20:59 EDT
    expect(shutdownDue('2026-03-09T01:01:00Z', '21:00')).toBe(true) // 21:01 EDT
    expect(shutdownDue('2026-03-08T06:59:00Z', '02:30')).toBe(false) // 01:59 EST
    expect(shutdownDue('2026-03-08T07:00:00Z', '02:30')).toBe(true) // 03:00 EDT; 02:30 never happens
    expect(tomorrowOf('2026-03-08T15:00:00Z')).toBe('2026-03-09')
  })
})

describe('cards', () => {
  it('the plan card shows until the plan is saved or dismissed, or the day is shut down', () => {
    expect(planCardVisible(null)).toBe(true)
    expect(planCardVisible(emptyDay(TODAY))).toBe(true)
    expect(planCardVisible({ ...emptyDay(TODAY), planned_at: '2026-11-10T13:00:00Z' })).toBe(false)
    expect(planCardVisible({ ...emptyDay(TODAY), plan_dismissed_at: '2026-11-10T13:00:00Z' })).toBe(false)
    expect(planCardVisible({ ...emptyDay(TODAY), reviewed_at: '2026-11-11T02:00:00Z' })).toBe(false)
  })
  it('the shutdown card needs the time to have come and the day not yet shut down', () => {
    expect(shutdownCardVisible(null, '2026-11-10T01:00:00Z', '21:00')).toBe(false)
    expect(shutdownCardVisible(null, '2026-11-10T02:30:00Z', '21:00')).toBe(true)
    expect(shutdownCardVisible({ ...emptyDay(TODAY), reviewed_at: '2026-11-10T02:40:00Z' }, '2026-11-10T02:50:00Z', '21:00')).toBe(false)
  })
})

describe('Top 3', () => {
  it('toggles, and refuses a fourth', () => {
    expect(toggleTop3(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleTop3(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleTop3(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c'])
  })
  it('keeps only open top-level tasks, in the order picked; progress counts done ones and ignores dropped', () => {
    const a = task({ title: 'A' }), b = task({ title: 'B' }), c = done(TODAY, '2026-11-10T14:00:00Z', { title: 'C' }), d = task({ title: 'D', status: 'dropped' }), e = task({ title: 'E', parent_id: 'x' })
    const row = { top3: [c.id, b.id, d.id, a.id, e.id] }
    expect(top3Tasks(row, [a, b, c, d, e]).map((t) => t.title)).toEqual(['B', 'A'])
    const p = top3Progress(row, [a, b, c, d, e])
    expect([p.open.length, p.done.length, p.total]).toEqual([2, 1, 3])
    expect(top3Tasks(null, [a])).toEqual([])
  })
  it('offers missed, deadlines, today, windows and undated tasks, not upcoming or dropped', () => {
    const ts = [task({ title: 'missed', due_on: '2026-11-08' }), task({ title: 'today', due_on: TODAY, start_on: TODAY }), task({ title: 'later', start_on: '2026-11-20', due_on: '2026-11-20' }),
      task({ title: 'none' }), task({ title: 'gone', status: 'dropped' }), task({ title: 'dl', due_on: '2026-11-15', hard_deadline: true })]
    expect(planCandidates(ts, TODAY).map((t) => t.title).sort()).toEqual(['dl', 'missed', 'none', 'today'])
  })
})

describe('shutdown triage', () => {
  const plain = { start_on: TODAY, due_on: TODAY, hard_deadline: false }
  const deadline = { start_on: null, due_on: '2026-11-10', hard_deadline: true }

  it('tomorrow moves a plain task to tomorrow', () => {
    expect(triage(plain, { kind: 'tomorrow' }, TODAY)).toEqual({ patch: { start_on: '2026-11-11', due_on: '2026-11-11' } })
    expect(triage({ start_on: null, due_on: '2026-11-05', hard_deadline: false }, { kind: 'tomorrow' }, TODAY).patch).toEqual({ start_on: '2026-11-11', due_on: '2026-11-11' }) // a missed one too
    expect(triage({ start_on: null, due_on: null, hard_deadline: false }, { kind: 'tomorrow' }, TODAY).patch).toEqual({ start_on: '2026-11-11', due_on: '2026-11-11' }) // a Top 3 task with no date
  })
  it('tomorrow keeps a hard deadline\'s due date (nothing to change) and a window that runs on', () => {
    expect(triage(deadline, { kind: 'tomorrow' }, TODAY).patch).toBeNull()
    expect(triage({ ...deadline, due_on: '2026-11-05' }, { kind: 'tomorrow' }, TODAY).patch).toBeNull() // a deadline already missed keeps its date too
    expect(triage({ start_on: '2026-11-08', due_on: '2026-11-14', hard_deadline: false }, { kind: 'tomorrow' }, TODAY).patch).toBeNull()
  })
  it('tomorrow across a DST day uses calendar days, not 24 hours', () => {
    expect(triage({ start_on: null, due_on: '2026-11-01', hard_deadline: false }, { kind: 'tomorrow' }, '2026-11-01').patch).toEqual({ start_on: '2026-11-02', due_on: '2026-11-02' })
    expect(triage({ start_on: null, due_on: '2026-03-08', hard_deadline: false }, { kind: 'tomorrow' }, '2026-03-08').patch).toEqual({ start_on: '2026-03-09', due_on: '2026-03-09' })
  })
  it('pick a day: plain tasks move; a deadline only gets a start day no later than its due date; the past is refused', () => {
    expect(triage(plain, { kind: 'day', day: '2026-11-14' }, TODAY).patch).toEqual({ start_on: '2026-11-14', due_on: '2026-11-14' })
    expect(triage({ ...deadline, due_on: '2026-11-20' }, { kind: 'day', day: '2026-11-14' }, TODAY).patch).toEqual({ start_on: '2026-11-14' })
    expect(triage({ ...deadline, due_on: '2026-11-20' }, { kind: 'day', day: '2026-11-21' }, TODAY).error).toMatch(/after its due date/)
    expect(triage(plain, { kind: 'day', day: '2026-11-09' }, TODAY).error).toMatch(/later day/)
  })
  it('no date clears a plain task and refuses a deadline; drop sets status dropped (never a delete)', () => {
    expect(triage(plain, { kind: 'none' }, TODAY).patch).toEqual({ start_on: null, due_on: null })
    expect(triage(deadline, { kind: 'none' }, TODAY).error).toMatch(/keeps its date/)
    expect(triage(plain, { kind: 'drop' }, TODAY).patch).toEqual({ status: 'dropped' })
    expect(triage(deadline, { kind: 'drop' }, TODAY).patch).toEqual({ status: 'dropped' })
  })
  it('lists due and missed open tasks plus the Top 3; never dropped, done, upcoming or sub-tasks', () => {
    const a = task({ title: 'due', due_on: TODAY }), b = task({ title: 'missed', due_on: '2026-11-08' }), c = task({ title: 'pinned' }), d = task({ title: 'dropped', due_on: TODAY, status: 'dropped' })
    const e = done(TODAY, '2026-11-10T14:00:00Z', { title: 'done' }), f = task({ title: 'upcoming', start_on: '2026-11-12', due_on: '2026-11-12' }), g = task({ title: 'sub', due_on: TODAY, parent_id: 'x' })
    const h = task({ title: 'deadline today', due_on: TODAY, hard_deadline: true }), i = task({ title: 'deadline later', due_on: '2026-11-30', hard_deadline: true })
    expect(shutdownTasks([a, b, c, d, e, f, g, h, i], { top3: [c.id] }, TODAY).map((t) => t.title).sort()).toEqual(['deadline today', 'due', 'missed', 'pinned'])
  })
  it('roll all: moves plain tasks, keeps every hard deadline on its date, and counts both', () => {
    const a = task({ due_on: TODAY, start_on: TODAY }), b = task({ due_on: '2026-11-07' }), d1 = task({ due_on: TODAY, hard_deadline: true }), d2 = task({ due_on: '2026-11-04', hard_deadline: true }), w = task({ start_on: '2026-11-08', due_on: '2026-11-14' })
    const r = rollToTomorrow([a, b, d1, d2, w], TODAY)
    expect(r.changes).toEqual([{ id: a.id, patch: { start_on: '2026-11-11', due_on: '2026-11-11' } }, { id: b.id, patch: { start_on: '2026-11-11', due_on: '2026-11-11' } }])
    expect(r.keptDeadlines).toBe(2)
    expect(r.unchanged).toBe(1)
    for (const c of r.changes) expect(c.patch).not.toHaveProperty('hard_deadline')
  })
})
