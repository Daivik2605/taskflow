import { describe, expect, it } from 'vitest'
import { counterStats, type Counter, type CounterEvent } from './counters'
import { done, task } from './fixtures'
import { resolveRange } from './insights'
import { OVERVIEW_LINKS, deadlineLabel, overview, previousWindow, type Period } from './overview'
import { rangeStats, counts } from './tasks'

const TODAY = '2026-11-10' // Tuesday
const cig: Counter = { id: 'c1', name: 'Cigarette', short_label: 'Cig', color: '#000', sort: 0, archived: false, reasons: null }
const weed: Counter = { id: 'c2', name: 'Weed', short_label: 'Weed', color: '#0a0', sort: 1, archived: false, reasons: null }
const old: Counter = { id: 'c3', name: 'Old', short_label: null, color: '#000', sort: 2, archived: true, reasons: null }
let n = 0
const ev = (day: string, counter_id = 'c1', qty = 1): CounterEvent => ({ id: `e${++n}`, counter_id, at: `${day}T15:00:00.000Z`, day, qty, note: null, reason: null })

const tasks = [
  task({ title: 'Missed A', start_on: '2026-11-03', due_on: '2026-11-03' }), // missed, last week
  task({ title: 'Missed B', start_on: '2026-11-09', due_on: '2026-11-09' }), // missed, this week
  task({ title: 'Renew passport', due_on: '2026-11-08', hard_deadline: true }), // deadline missed
  task({ title: 'Call Mom', start_on: TODAY, due_on: TODAY }),
  task({ title: 'Window', start_on: '2026-11-08', due_on: '2026-11-14' }),
  task({ title: 'Tax return', due_on: '2026-11-20', hard_deadline: true }),
  task({ title: 'G2', due_on: '2026-12-26', hard_deadline: true }),
  task({ title: 'Starts later', start_on: '2026-11-12', due_on: '2026-11-12' }),
  task({ title: 'Someday' }),
  task({ title: 'Sub', parent_id: 'x', due_on: TODAY }),
  done('2026-11-10', '2026-11-10T14:00:00Z'),
  done('2026-11-05', '2026-11-09T14:00:00Z'), // done late, this week
  done('2026-11-01', '2026-11-01T14:00:00Z'),
  done(null, '2026-10-20T14:00:00Z'),
  task({ title: 'Dropped', due_on: TODAY, status: 'dropped' }),
]
const events = [
  ev(TODAY), ev(TODAY), ev(TODAY, 'c2'), ev('2026-11-09'), ev('2026-11-09'), ev('2026-11-09'), ev('2026-11-09', 'c2'),
  ev('2026-11-03'), ev('2026-11-02', 'c1', 2), ev('2026-10-31'), ev('2026-10-12'),
]

describe('overview numbers equal Insights', () => {
  for (const [period, kind] of [['today', 'day'], ['week', 'week'], ['month', 'month']] as const) {
    it(`${period}: completed, missed, deadlines missed and counters`, () => {
      const o = overview(tasks, events, [cig, weed, old], TODAY, period)
      const r = resolveRange(kind, TODAY, 1)
      const s = rangeStats(tasks, r.from, r.to, TODAY)
      expect(o.completed).toBe(s.done.length)
      expect(o.missed).toEqual({ tasks: s.missed.length, deadlines: s.deadlinesMissed.length })
      expect({ from: o.from, to: o.to }).toEqual({ from: r.from, to: r.to })
      const stats = counterStats(events.filter((e) => e.counter_id === 'c1'), TODAY, 1)
      expect(o.counters.find((c) => c.counter.id === 'c1')!.total).toBe(period === 'today' ? stats.today : period === 'week' ? stats.week : stats.month)
    })
  }
  it('follows the week-start setting', () => {
    const o = overview(tasks, events, [cig], TODAY, 'week', 0)
    const r = resolveRange('week', TODAY, 0)
    expect(o.from).toBe(r.from)
    expect(o.completed).toBe(rangeStats(tasks, r.from, r.to, TODAY).done.length)
  })
})

describe('overview cards', () => {
  const o = overview(tasks, events, [cig, weed, old], TODAY, 'today')
  it('Missed and Completed count what the spec says', () => {
    expect(o.missed).toEqual({ tasks: 0, deadlines: 0 }) // nothing due today is missed
    expect(o.completed).toBe(1)
    expect(overview(tasks, events, [], TODAY, 'week').missed).toEqual({ tasks: 1, deadlines: 0 }) // Missed B (passport is Sun 8 Nov, last week)
    expect(overview(tasks, events, [], TODAY, 'month').missed).toEqual({ tasks: 3, deadlines: 1 }) // Missed A, Missed B, done late; passport
  })
  it('To do = active, not missed, due in the period, plus undated', () => {
    expect(o.todo).toBe(counts(tasks, TODAY, 'today').left + 1)
    expect(o.todo).toBe(2) // Call Mom + Someday
    expect(overview(tasks, events, [], TODAY, 'week').todo).toBe(3) // Call Mom, Window (due Sat 14), Someday; Tax return is 20 Nov
  })
  it('snapshots ignore the period', () => {
    for (const p of ['today', 'week', 'month'] as Period[]) {
      const x = overview(tasks, events, [], TODAY, p)
      expect([x.dueToday, x.upcoming, x.deadlines.count]).toEqual([1, 1, 1])
    }
  })
  it('Deadlines counts the next 14 days and names the nearest, even beyond the horizon', () => {
    expect(o.deadlines.nearest).toMatchObject({ title: 'Tax return', days: 10 })
    const far = overview(tasks.filter((t) => t.title !== 'Tax return'), [], [], TODAY, 'today').deadlines
    expect(far.count).toBe(0)
    expect(far.nearest).toMatchObject({ title: 'G2', days: 46 })
    expect(deadlineLabel({ id: 'x', title: 'G2', days: 16 })).toBe('G2 in 16 days')
    expect(deadlineLabel({ id: 'x', title: 'G2', days: 0 })).toBe('G2 today')
    expect(deadlineLabel({ id: 'x', title: 'G2', days: 1 })).toBe('G2 tomorrow')
  })
  it('ignores sub-tasks, dropped tasks and archived counters', () => {
    expect(o.dueToday).toBe(1) // Call Mom only
    expect(o.counters.map((c) => c.counter.name)).toEqual(['Cigarette', 'Weed'])
  })
  it('counter change compares like for like', () => {
    const c = (p: Period, id = 'c1') => overview(tasks, events, [cig, weed], TODAY, p).counters.find((x) => x.counter.id === id)!
    expect(c('today')).toMatchObject({ total: 2, previous: 3, change: -1 }) // vs yesterday
    expect(c('week')).toMatchObject({ total: 5, previous: 3, change: 2 }) // Mon–Tue 9–10 Nov vs Mon–Tue 2–3 Nov (2 Nov was a ×2 tap)
    expect(c('today', 'c2')).toMatchObject({ total: 1, previous: 1, change: 0 })
  })
  it('an empty app is all zeros', () => {
    const e = overview([], [], [], TODAY, 'week')
    expect([e.todo, e.dueToday, e.upcoming, e.completed, e.missed.tasks, e.deadlines.count]).toEqual([0, 0, 0, 0, 0, 0])
    expect(e.deadlines.nearest).toBeNull()
  })
})

describe('previousWindow', () => {
  it('today → yesterday', () => { expect(previousWindow('today', TODAY)).toEqual({ from: '2026-11-09', to: '2026-11-09' }) })
  it('week so far → the same days last week', () => {
    expect(previousWindow('week', TODAY, 1)).toEqual({ from: '2026-11-02', to: '2026-11-03' })
    expect(previousWindow('week', TODAY, 0)).toEqual({ from: '2026-11-01', to: '2026-11-03' }) // Sun-start
  })
  it('month so far → the same days last month, clipped to a short month', () => {
    expect(previousWindow('month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-10' })
    expect(previousWindow('month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousWindow('month', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-05' })
  })
  it('works across a DST change and the year end', () => {
    expect(previousWindow('week', '2026-11-02', 1)).toEqual({ from: '2026-10-26', to: '2026-10-26' })
    expect(previousWindow('week', '2027-01-01', 1)).toEqual({ from: '2026-12-21', to: '2026-12-25' })
  })
})

describe('links', () => {
  it('open the matching view', () => {
    expect(OVERVIEW_LINKS.dueToday).toBe('/tasks?view=today')
    expect(OVERVIEW_LINKS.upcoming).toBe('/tasks?view=upcoming')
    expect(OVERVIEW_LINKS.deadlines).toBe('/tasks?view=deadlines')
    expect(OVERVIEW_LINKS.missed('today')).toBe('/insights?tab=range&range=day')
    expect(OVERVIEW_LINKS.completed('month')).toBe('/insights?tab=range&range=month')
    expect(OVERVIEW_LINKS.counter('c1')).toBe('/insights?tab=counters&counter=c1')
  })
})

describe('timeCard (phase 4)', () => {
  it('study, hustle and work minutes for the period, from the same intervals as Insights', async () => {
    const { timeCard } = await import('./overview')
    const { pastSession, sessionIntervals } = await import('./timer')
    const { area } = await import('./fixtures')
    const areas = [area({ id: 'st', name: 'st', kind: 'study' }), area({ id: 'dsa', name: 'dsa', kind: 'study', parent_id: 'st' }), area({ id: 'hu', name: 'hu', kind: 'hustle' }), area({ id: 'wk', name: 'wk', kind: 'work' }), area({ id: 'pe', name: 'pe', kind: 'personal' })]
    const mk = (id: string, tag: string, start: string, min: number) => pastSession(id, id + 'g', { areaId: tag, start: new Date(start), end: new Date(new Date(start).getTime() + min * 60_000) })
    const iv = sessionIntervals([mk('a', 'dsa', '2026-11-10T14:00:00Z', 90), mk('b', 'hu', '2026-11-10T16:00:00Z', 30), mk('c', 'wk', '2026-11-09T14:00:00Z', 60), mk('d', 'pe', '2026-11-10T18:00:00Z', 45)], new Date('2026-11-10T20:00:00Z'))
    expect(timeCard(iv, areas, '2026-11-10', 'today')).toEqual({ study: 90, hustle: 30, work: 0, total: 120 })
    expect(timeCard(iv, areas, '2026-11-10', 'week')).toEqual({ study: 90, hustle: 30, work: 60, total: 180 })
  })
})
