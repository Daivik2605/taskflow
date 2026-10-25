import { describe, expect, it } from 'vitest'
import {
  activeActivities, applyLogChange, buildLog, doneToday, logMinutes, minutesByDay, minutesByTag, nextActivitySort, validateActivity, validateLog,
  weekCount, weekLabel, weekLogs, type Activity, type ActivityLog,
} from './activities'

const act = (over: Partial<Activity> = {}): Activity => ({ id: 'gym', name: 'Gym', area_id: 'tag-gym', default_minutes: 60, weekly_target: null, sort: 0, archived: false, ...over })
const log = (id: string, ended: string, minutes = 60, preset = 'gym', area = 'tag-gym'): ActivityLog => buildLog({ id: preset, area_id: area }, minutes, ended, id)

describe('buildLog', () => {
  it('ends at the given moment and starts `minutes` earlier, on the activity\'s tag', () => {
    const l = buildLog(act(), 60, '2026-11-10T15:00:00Z', 'x')
    expect(l).toEqual({ id: 'x', area_id: 'tag-gym', preset_id: 'gym', started_at: '2026-11-10T14:00:00.000Z', ended_at: '2026-11-10T15:00:00.000Z' })
    expect(logMinutes(l)).toBe(60)
  })
  it('keeps the client id, so a retry is the same row', () => {
    expect(buildLog(act(), 30, '2026-11-10T15:00:00Z', 'same').id).toBe(buildLog(act(), 30, '2026-11-10T15:00:00Z', 'same').id)
  })
})

describe('week counts', () => {
  const TODAY = '2026-11-10' // Tuesday
  const logs = [
    log('a', '2026-11-10T15:00:00Z'), // Tue 10 (today)
    log('b', '2026-11-09T23:00:00Z'), // Mon 9 18:00 Toronto
    log('c', '2026-11-08T23:00:00Z'), // Sun 8 — last week with a Monday start
    log('d', '2026-11-10T16:00:00Z', 20, 'kriya', 'tag-kriya'),
  ]
  it('counts this week for one activity (Monday start)', () => { expect(weekCount(logs, 'gym', TODAY, 1)).toBe(2) })
  it('a Sunday start pulls Sunday in', () => { expect(weekCount(logs, 'gym', TODAY, 0)).toBe(3) })
  it('is newest first and only the asked activity', () => { expect(weekLogs(logs, 'gym', TODAY).map((l) => l.id)).toEqual(['a', 'b']) })
  it('knows what was done today', () => {
    expect(doneToday(logs, 'gym', TODAY)).toBe(true)
    expect(doneToday(logs, 'gym', '2026-11-11')).toBe(false)
    expect(doneToday(logs, 'none', TODAY)).toBe(false)
  })
  it('a log belongs to the Toronto day it ended on, not the UTC day', () => {
    // 03:30 UTC on the 11th is 22:30 on the 10th in Toronto (EST)
    expect(weekCount([log('e', '2026-11-11T03:30:00Z')], 'gym', '2026-11-10')).toBe(1)
    expect(doneToday([log('e', '2026-11-11T03:30:00Z')], 'gym', '2026-11-10')).toBe(true)
  })
  it('works across the DST change (Sun 1 Nov 2026) and the year end', () => {
    expect(weekCount([log('f', '2026-11-01T05:30:00Z')], 'gym', '2026-11-01', 1)).toBe(1) // 01:30 EDT, the repeated hour
    expect(weekCount([log('g', '2026-11-01T06:30:00Z')], 'gym', '2026-11-01', 1)).toBe(1) // 01:30 EST
    expect(weekCount([log('h', '2027-01-03T15:00:00Z')], 'gym', '2026-12-30', 1)).toBe(1) // same Monday-start week as 28 Dec
    expect(weekCount([log('i', '2027-01-04T15:00:00Z')], 'gym', '2026-12-30', 1)).toBe(0)
  })
  it('labels', () => {
    expect(weekLabel(2, null)).toBe('2 this week')
    expect(weekLabel(2, 3)).toBe('2/3 this week')
    expect(weekLabel(0, 3)).toBe('0/3 this week')
  })
})

describe('undo', () => {
  it('removing the log by its id puts the counts back', () => {
    const l = log('u', '2026-11-10T15:00:00Z')
    const after = applyLogChange([l], { type: 'DELETE', id: 'u' })
    expect(weekCount(after, 'gym', '2026-11-10')).toBe(0)
    expect(doneToday(after, 'gym', '2026-11-10')).toBe(false)
  })
})

describe('minutes', () => {
  it('splits a log across midnight into both days', () => {
    const l = log('m', '2026-11-11T05:30:00Z', 90) // 23:00 → 00:30 Toronto (EST, 05:30Z = 00:30)
    expect([...minutesByDay([l])]).toEqual([['2026-11-10', 60], ['2026-11-11', 30]])
  })
  it('totals by tag inside a range', () => {
    const logs = [log('1', '2026-11-10T15:00:00Z', 60), log('2', '2026-11-09T15:00:00Z', 30), log('3', '2026-11-10T16:00:00Z', 20, 'kriya', 'tag-kriya'), log('4', '2026-11-01T15:00:00Z', 60)]
    expect(Object.fromEntries(minutesByTag(logs, '2026-11-09', '2026-11-15'))).toEqual({ 'tag-gym': 90, 'tag-kriya': 20 })
  })
})

describe('validation', () => {
  const list = [act(), act({ id: 'k', name: 'Kriya', default_minutes: 35 })]
  it('needs a name, a unique name, sane minutes and a sane target', () => {
    const ok = { name: 'Run', default_minutes: 30, weekly_target: null }
    expect(validateActivity(ok, list)).toBeNull()
    expect(validateActivity({ ...ok, name: '  ' }, list)).toMatch(/name/)
    expect(validateActivity({ ...ok, name: 'gym' }, list)).toMatch(/already exists/)
    expect(validateActivity({ ...ok, name: 'Gym' }, list, 'gym')).toBeNull() // editing itself
    expect(validateActivity({ ...ok, default_minutes: 0 }, list)).toMatch(/minutes/)
    expect(validateActivity({ ...ok, default_minutes: 1441 }, list)).toMatch(/minutes/)
    expect(validateActivity({ ...ok, weekly_target: 0 }, list)).toMatch(/target/)
    expect(validateActivity({ ...ok, weekly_target: 3 }, list)).toBeNull()
  })
  it('refuses the future and bad minutes for a log', () => {
    const now = new Date('2026-11-10T15:00:00Z')
    expect(validateLog(60, new Date('2026-11-10T14:00:00Z'), now)).toBeNull()
    expect(validateLog(60, new Date('2026-11-10T15:00:30Z'), now)).toBeNull() // clock skew is tolerated
    expect(validateLog(60, new Date('2026-11-10T16:00:00Z'), now)).toMatch(/future/)
    expect(validateLog(0, now, now)).toMatch(/Minutes/)
    expect(validateLog(1.5, now, now)).toMatch(/Minutes/)
  })
})

describe('lists and realtime', () => {
  it('hides archived activities and orders by sort', () => {
    const l = [act({ id: 'a', name: 'B', sort: 1 }), act({ id: 'b', name: 'A', sort: 0 }), act({ id: 'c', name: 'C', archived: true })]
    expect(activeActivities(l).map((a) => a.name)).toEqual(['A', 'B'])
    expect(nextActivitySort(l)).toBe(2)
  })
  it('only stopped preset sessions are logs', () => {
    const row = { id: 'r', area_id: 't', preset_id: 'gym', started_at: '2026-11-10T14:00:00Z', ended_at: '2026-11-10T15:00:00Z', source: 'preset', state: 'stopped' }
    expect(applyLogChange([], { type: 'INSERT', row })).toHaveLength(1)
    expect(applyLogChange([], { type: 'INSERT', row: { ...row, source: 'timer' } })).toHaveLength(0)
    expect(applyLogChange([], { type: 'INSERT', row: { ...row, state: 'running' } })).toHaveLength(0)
    expect(applyLogChange(applyLogChange([], { type: 'INSERT', row }), { type: 'UPDATE', row })).toHaveLength(1) // an echo doesn't duplicate
  })
})
