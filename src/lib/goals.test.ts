import { describe, expect, it } from 'vitest'
import { area, done } from './fixtures'
import type { CounterEvent } from './counters'
import {
  activeGoals, amountText, counterLimit, currentProgress, evaluate, goalStats, goalTitle, judge, metricValue, periodResult, periodWindow, planEdit, planPause,
  validateGoal, valueText, versionOn, type Goal, type GoalInputs,
} from './goals'

let n = 0
const goal = (over: Partial<Goal> = {}): Goal => {
  n++
  return { id: `g${n}`, series_id: `s${n}`, name: '', metric: 'counter_count', target_id: 'c-cig', direction: 'at_most', amount: 5, period: 'day', starts_on: '2026-01-01', ends_on: null, paused: false, sort: 0, ...over }
}
const tap = (day: string, qty = 1, counter = 'c-cig'): CounterEvent => { n++; return { id: `e${n}`, counter_id: counter, at: `${day}T15:00:00.000Z`, day, qty, note: null, reason: null } }
const session = (tag: string, day: string, minutes: number) => ({ id: `l${++n}`, area_id: tag, preset_id: null, started_at: `${day}T14:00:00.000Z`, ended_at: new Date(Date.parse(`${day}T14:00:00.000Z`) + minutes * 60_000).toISOString() })
const log = (preset: string, day: string, minutes = 60) => ({ ...session('a-study', day, minutes), preset_id: preset })

const AREAS = [area({ id: 'a-study', name: 'Study', kind: 'study' }), area({ id: 'a-dsa', name: 'DSA', kind: 'study', parent_id: 'a-study' }), area({ id: 'a-work', name: 'Work', kind: 'work' })]
const inputs = (over: Partial<GoalInputs> = {}): GoalInputs => ({ tasks: [], events: [], sessions: [], logs: [], areas: AREAS, daysOff: new Set(), weekStart: 1, ...over })
const TODAY = '2026-11-11' // Wednesday; the week is Mon 9 – Sun 15

describe('periodWindow', () => {
  it('day, week (per week start) and month', () => {
    expect(periodWindow('day', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(periodWindow('week', TODAY, 1)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(periodWindow('week', TODAY, 0)).toEqual({ from: '2026-11-08', to: '2026-11-14' })
    expect(periodWindow('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })
})

describe('metricValue', () => {
  it('counter: sums qty of that counter in the window only', () => {
    const i = inputs({ events: [tap('2026-11-11', 2), tap('2026-11-11'), tap('2026-11-10'), tap('2026-11-11', 4, 'c-weed')] })
    expect(metricValue(goal(), { from: TODAY, to: TODAY }, i)).toBe(3)
  })
  it('tag minutes: a parent includes its sub-tags, a sub-tag only itself', () => {
    const i = inputs({ sessions: [session('a-dsa', TODAY, 30), session('a-study', TODAY, 20), session('a-work', TODAY, 99)] })
    const w = { from: TODAY, to: TODAY }
    expect(metricValue(goal({ metric: 'tag_minutes', target_id: 'a-study' }), w, i)).toBe(50)
    expect(metricValue(goal({ metric: 'tag_minutes', target_id: 'a-dsa' }), w, i)).toBe(30)
  })
  it('activity: counts logs of that activity', () => {
    const i = inputs({ logs: [log('act-gym', '2026-11-09'), log('act-gym', '2026-11-11'), log('act-kriya', '2026-11-11'), log('act-gym', '2026-11-02')] })
    expect(metricValue(goal({ metric: 'activity_count', target_id: 'act-gym' }), periodWindow('week', TODAY), i)).toBe(2)
  })
  it('tasks done: top-level tasks completed in the window', () => {
    const i = inputs({ tasks: [done(null, '2026-11-11T15:00:00Z'), done(null, '2026-11-11T16:00:00Z'), done(null, '2026-11-10T16:00:00Z'), done(null, '2026-11-11T16:00:00Z', { parent_id: 't1' })] })
    expect(metricValue(goal({ metric: 'tasks_done', target_id: null }), { from: TODAY, to: TODAY }, i)).toBe(2)
  })
})

describe('judge', () => {
  it('at least: hit once met, miss only when finished short', () => {
    expect(judge('at_least', 3, 2, false)).toBe('on-track')
    expect(judge('at_least', 3, 3, false)).toBe('hit')
    expect(judge('at_least', 3, 2, true)).toBe('miss')
  })
  it('at most: on-track, at-limit on the limit, miss once over, hit when the period ends within the limit', () => {
    expect(judge('at_most', 5, 4, false)).toBe('on-track')
    expect(judge('at_most', 5, 5, false)).toBe('at-limit')
    expect(judge('at_most', 5, 6, false)).toBe('miss')
    expect(judge('at_most', 5, 5, true)).toBe('hit')
    expect(judge('at_most', 5, 6, true)).toBe('miss')
  })
  it('evaluate reports the fraction for the bar', () => {
    const r = evaluate(goal({ amount: 4 }), { from: TODAY, to: TODAY }, inputs({ events: [tap(TODAY, 3)] }), TODAY)
    expect(r).toMatchObject({ value: 3, status: 'on-track', fraction: 0.75 })
  })
})

describe('counter limit (the pill)', () => {
  const g = [goal({ amount: 5 })]
  it('ok below, at the limit, over above', () => {
    expect(counterLimit(g, 'c-cig', inputs({ events: [tap(TODAY, 4)] }), TODAY)).toMatchObject({ state: 'ok', count: 4, limit: 5 })
    expect(counterLimit(g, 'c-cig', inputs({ events: [tap(TODAY, 5)] }), TODAY).state).toBe('at')
    expect(counterLimit(g, 'c-cig', inputs({ events: [tap(TODAY, 6)] }), TODAY).state).toBe('over')
  })
  it('no goal, a paused goal, a different counter or an at-least goal: no limit', () => {
    const i = inputs({ events: [tap(TODAY, 9)] })
    expect(counterLimit([], 'c-cig', i, TODAY).state).toBe('none')
    expect(counterLimit([goal({ paused: true })], 'c-cig', i, TODAY).state).toBe('none')
    expect(counterLimit(g, 'c-weed', i, TODAY).state).toBe('none')
    expect(counterLimit([goal({ direction: 'at_least' })], 'c-cig', i, TODAY).state).toBe('none')
  })
  it('the worst of a daily and a weekly limit wins', () => {
    const both = [goal({ amount: 5 }), goal({ amount: 8, period: 'week' })]
    const i = inputs({ events: [tap('2026-11-09', 6), tap(TODAY, 3)] })
    expect(counterLimit(both, 'c-cig', i, TODAY)).toMatchObject({ state: 'over', period: 'week', limit: 8, count: 9 })
  })
  it('a version that starts later does not apply yet', () => {
    expect(counterLimit([goal({ starts_on: '2026-11-12' })], 'c-cig', inputs({ events: [tap(TODAY, 9)] }), TODAY).state).toBe('none')
  })
})

describe('versions: editing keeps the past true', () => {
  const old = goal({ series_id: 'S', id: 'v1', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 3, period: 'week', starts_on: '2026-10-05' })
  it('a changed amount ends the old version yesterday and starts a new one today', () => {
    const plan = planEdit(old, { name: '', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 5, period: 'week' }, TODAY, 'v2')
    expect(plan).toMatchObject({ kind: 'version', close: { id: 'v1', ends_on: '2026-11-10' }, next: { id: 'v2', series_id: 'S', amount: 5, starts_on: TODAY, ends_on: null } })
  })
  it('a rename is in place; a change on the day it was made is in place too', () => {
    expect(planEdit(old, { name: ' Lift ', metric: old.metric, target_id: old.target_id, direction: old.direction, amount: 3, period: 'week' }, TODAY, 'x')).toEqual({ kind: 'inplace', patch: { name: 'Lift' } })
    const fresh = { ...old, starts_on: TODAY }
    expect(planEdit(fresh, { name: '', metric: old.metric, target_id: old.target_id, direction: old.direction, amount: 9, period: 'week' }, TODAY, 'x').kind).toBe('inplace-all')
  })
  it('last week is judged on the old target, this week on the new one', () => {
    const v1 = { ...old, ends_on: '2026-11-10' }
    const v2 = goal({ series_id: 'S', id: 'v2', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 5, period: 'week', starts_on: TODAY })
    const all = [v1, v2]
    // last week (Nov 2–8): 3 gym logs; this week so far: 3 logs
    const logs = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11'].map((d) => log('act-gym', d))
    const i = inputs({ logs })
    expect(versionOn(all, 'S', '2026-11-08')?.amount).toBe(3)
    expect(versionOn(all, 'S', TODAY)?.amount).toBe(5)
    const last = periodResult(all, 'S', 'week', '2026-11-05', i, TODAY)!
    expect(last.version.amount).toBe(3)
    expect(last.result.status).toBe('hit') // 3 of 3 on the old target (would be a miss against 5)
    const now = periodResult(all, 'S', 'week', TODAY, i, TODAY, { countPartial: true })!
    expect(now.version.amount).toBe(5)
    expect(now.result.status).toBe('on-track') // 3 of 5
  })
  it('pause and resume are versions as well', () => {
    expect(planPause(old, true, TODAY, 'p')).toMatchObject({ kind: 'version', next: { paused: true, starts_on: TODAY, series_id: 'S' } })
    expect(planPause(old, false, TODAY, 'p')).toEqual({ kind: 'inplace', patch: {} })
  })
  it('activeGoals leaves out paused and superseded versions', () => {
    const v1 = { ...old, ends_on: '2026-11-10' }
    const v2 = { ...old, id: 'v2', starts_on: TODAY, paused: true }
    expect(activeGoals([v1, v2])).toEqual([])
    expect(activeGoals([v1, { ...v2, paused: false }]).map((g) => g.id)).toEqual(['v2'])
  })
})

describe('daily goals: days off, hit rate, streak', () => {
  const g = goal({ series_id: 'D', amount: 2, starts_on: '2026-11-01' })
  // Nov 1..10 are the finished days. Taps: miss on 3rd and 7th; the 5th is a day off with a high count.
  const events = [tap('2026-11-03', 3), tap('2026-11-05', 9), tap('2026-11-07', 4), tap('2026-11-10', 1)]
  const i = inputs({ events, daysOff: new Set(['2026-11-05']) })

  it('a day off is not judged, whatever happened on it', () => {
    expect(periodResult([g], 'D', 'day', '2026-11-05', i, TODAY)).toBeNull()
    expect(periodResult([g], 'D', 'day', '2026-11-04', i, TODAY)!.result.status).toBe('hit')
  })
  it('hit rate counts judged days only; the streak is the run of hits up to the latest judged day', () => {
    const s = goalStats([g], 'D', i, TODAY, 10)
    expect(s.total).toBe(9) // Nov 1–10 minus the day off
    expect(s.hits).toBe(7)
    expect(s.hitRate).toBeCloseTo(7 / 9)
    expect(s.streak).toBe(3) // Nov 8, 9, 10 (Nov 7 was over)
    expect(s.best).toBe(3)
    expect(s.current?.result.status).toBe('on-track') // today: 0 of 2
  })
  it('the day off neither breaks nor extends a streak', () => {
    const j = inputs({ events: [tap('2026-11-03', 3)], daysOff: new Set(['2026-11-05']) })
    const s = goalStats([g], 'D', j, TODAY, 10)
    expect(s.streak).toBe(6) // Nov 4, 6–10: the off day (5th) is skipped, and the 3rd was over
  })
  it('days before the goal existed are not judged', () => {
    const late = goal({ series_id: 'L', amount: 2, starts_on: '2026-11-09' })
    expect(goalStats([late], 'L', inputs(), TODAY, 30).total).toBe(2) // Nov 9, 10
  })
})

describe('weekly and monthly goals', () => {
  it('a week with a day off is not pro-rated', () => {
    const g = goal({ series_id: 'W', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 3, period: 'week', starts_on: '2026-10-01' })
    const i = inputs({ logs: [log('act-gym', '2026-11-02'), log('act-gym', '2026-11-03')], daysOff: new Set(['2026-11-04', '2026-11-05']) })
    expect(periodResult([g], 'W', 'week', '2026-11-04', i, TODAY)!.result.status).toBe('miss')
  })
  it('the first partial week is not judged but the current one is shown', () => {
    const g = goal({ series_id: 'W', metric: 'tasks_done', target_id: null, direction: 'at_least', amount: 1, period: 'week', starts_on: '2026-11-04' })
    const s = goalStats([g], 'W', inputs(), TODAY)
    expect(s.total).toBe(0)
    expect(s.hitRate).toBeNull()
    expect(s.current).not.toBeNull()
  })
  it('a paused stretch is skipped, not counted as misses', () => {
    const a = goal({ series_id: 'P', metric: 'tasks_done', target_id: null, direction: 'at_least', amount: 1, period: 'week', starts_on: '2026-09-28', ends_on: '2026-10-11' })
    const b = { ...a, id: 'pp', starts_on: '2026-10-12', ends_on: '2026-11-01', paused: true }
    const c = { ...a, id: 'pc', starts_on: '2026-11-02', ends_on: null, paused: false }
    const tasks = [done(null, '2026-10-06T15:00:00Z'), done(null, '2026-11-03T15:00:00Z'), done(null, '2026-11-10T15:00:00Z')]
    const s = goalStats([a, b, c], 'P', inputs({ tasks }), TODAY, 8)
    expect(s.history.map((r) => r.result.status)).toEqual(['hit', 'hit', 'miss']) // Nov 2 week, Oct 5 week, Sep 28 week — the paused weeks between are absent
  })
  it('changing the period starts fresh', () => {
    const a = goal({ series_id: 'C', period: 'day', ends_on: '2026-11-04', starts_on: '2026-10-01' })
    const b = { ...a, id: 'cb', period: 'week' as const, starts_on: '2026-11-05', ends_on: null }
    expect(periodResult([a, b], 'C', 'week', '2026-10-20', inputs(), TODAY)).toBeNull()
  })
})

describe('wording and validation', () => {
  const lists = { areas: AREAS, counters: [{ id: 'c-cig', name: 'Cigarette', short_label: 'Cig' }], activities: [{ id: 'act-gym', name: 'Gym' }] }
  it('titles', () => {
    expect(goalTitle(goal(), lists)).toBe('Cigarette ≤ 5 / day')
    expect(goalTitle(goal({ metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 3, period: 'week' }), lists)).toBe('Gym ≥ 3× / week')
    expect(goalTitle(goal({ metric: 'tag_minutes', target_id: 'a-study', direction: 'at_least', amount: 900, period: 'week' }), lists)).toBe('Study ≥ 15 h / week')
    expect(goalTitle(goal({ metric: 'tasks_done', target_id: null, direction: 'at_least', amount: 3 }), lists)).toBe('Tasks done ≥ 3 / day')
    expect(goalTitle(goal({ name: 'Smokes' }), lists)).toBe('Smokes ≤ 5 / day')
  })
  it('amounts and values', () => {
    expect(amountText('tag_minutes', 90)).toBe('1.5 h')
    expect(valueText('tag_minutes', 270, 900)).toBe('4h 30m / 15 h')
    expect(valueText('counter_count', 3, 5)).toBe('3 / 5')
  })
  it('validation', () => {
    const ok = { name: '', metric: 'counter_count' as const, target_id: 'c-cig', direction: 'at_most' as const, amount: 5, period: 'day' as const }
    expect(validateGoal(ok, [])).toBeNull()
    expect(validateGoal({ ...ok, amount: 0 }, [])).toMatch(/whole number/)
    expect(validateGoal({ ...ok, amount: 1.5 }, [])).toMatch(/whole number/)
    expect(validateGoal({ ...ok, target_id: null }, [])).toMatch(/Pick what/)
    expect(validateGoal({ ...ok, metric: 'tasks_done' }, [])).toMatch(/no target/)
    expect(validateGoal(ok, [goal()])).toMatch(/already have/)
    expect(validateGoal(ok, [goal({ series_id: 'me' })], 'me')).toBeNull()
  })
})

describe('currentProgress (the overview row)', () => {
  it('daily first, then weekly, then monthly; paused and not-yet-started goals are left out', () => {
    const w = goal({ period: 'week', sort: 0 })
    const d = goal({ period: 'day', sort: 5 })
    const m = goal({ period: 'month', sort: 0 })
    const p = goal({ period: 'day', paused: true })
    const later = goal({ starts_on: '2026-12-01' })
    expect(currentProgress([w, m, d, p, later], inputs(), TODAY).map((x) => x.goal.period)).toEqual(['day', 'week', 'month'])
  })
  it('marks a daily goal on a day off', () => {
    const [x] = currentProgress([goal()], inputs({ daysOff: new Set([TODAY]) }), TODAY)
    expect(x.dayOff).toBe(true)
  })
})
