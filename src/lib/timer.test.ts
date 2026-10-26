import { describe, expect, it } from 'vitest'
import { area, task } from './fixtures'
import {
  activeSession, applyTimerChange, elapsedMs, estimateVsActual, minutesByDayByParent, minutesByDayOf, minutesOfKinds, newSession, openSegment, pastSession, pause, resume, sessionIntervals,
  sessionsOnDay, stillGoing, stop, tagRows, taskMinutes, topTasks, validateEndedAt, validateSpan, clock, type Session,
} from './timer'
import { minutesByTag } from './activities'

const at = (iso: string) => new Date(iso)
const T0 = at('2026-11-10T15:00:00Z') // 10:00 Toronto (EST)
const plus = (min: number) => new Date(T0.getTime() + min * 60_000)
const start = () => newSession('s1', 'g1', { areaId: 'dsa', taskId: 't1', comment: ' hi ' }, T0)

describe('start / pause / resume / stop', () => {
  it('start makes a running session with one open segment', () => {
    const s = start()
    expect(s).toMatchObject({ state: 'running', comment: 'hi', ended_at: null, source: 'timer' })
    expect(openSegment(s)?.id).toBe('g1')
    expect(activeSession([s])).toBe(s)
  })
  it('elapsed is the sum of segments, with the open one running to now', () => {
    let s = start()
    expect(elapsedMs(s, plus(30))).toBe(30 * 60_000)
    s = pause(s, plus(30))
    expect(s.state).toBe('paused')
    expect(openSegment(s)).toBeNull()
    expect(elapsedMs(s, plus(500))).toBe(30 * 60_000) // paused: the clock stands still
    s = resume(s, 'g2', plus(60))
    expect(s.segments).toHaveLength(2)
    expect(elapsedMs(s, plus(75))).toBe(45 * 60_000) // 30 + 15
    s = pause(s, plus(80)); s = resume(s, 'g3', plus(90))
    expect(elapsedMs(s, plus(100))).toBe((30 + 20 + 10) * 60_000)
  })
  it('stop closes the open segment and sets the end; stopping while paused ends at the last pause', () => {
    const running = stop(start(), plus(45))
    expect(running).toMatchObject({ state: 'stopped', ended_at: plus(45).toISOString() })
    const paused = stop(pause(start(), plus(20)), plus(90))
    expect(paused.ended_at).toBe(plus(20).toISOString())
    expect(elapsedMs(paused, plus(999))).toBe(20 * 60_000)
  })
  it('stop can end earlier ("it ended at…") and sets the comment', () => {
    const s = stop(start(), plus(300), { endedAt: plus(50), comment: '  done  ' })
    expect(elapsedMs(s, plus(999))).toBe(50 * 60_000)
    expect(s.comment).toBe('done')
    expect(stop(start(), plus(5), { comment: null }).comment).toBeNull()
    expect(stop(start(), plus(5)).comment).toBe('hi') // untouched when not given
  })
  it('pause/resume/stop on the wrong state change nothing', () => {
    const s = start()
    expect(resume(s, 'x', plus(1))).toBe(s)
    const p = pause(s, plus(1))
    expect(pause(p, plus(2))).toBe(p)
    const done = stop(s, plus(3))
    expect(stop(done, plus(9))).toBe(done)
  })
  it('validates "ended at" and spans', () => {
    const s = start()
    expect(validateEndedAt(s, plus(10), plus(20))).toBeNull()
    expect(validateEndedAt(s, plus(30), plus(20))).toMatch(/future/)
    expect(validateEndedAt(s, plus(-5), plus(20))).toMatch(/before/)
    expect(validateSpan(plus(0), plus(60), plus(120))).toBeNull()
    expect(validateSpan(plus(60), plus(0), plus(120))).toMatch(/after/)
    expect(validateSpan(plus(0), plus(60), plus(10))).toMatch(/future/)
    expect(validateSpan(plus(-25 * 60), plus(0), plus(10))).toMatch(/24 hours/)
  })
})

describe('open segment and across midnight', () => {
  it('an open segment counts up to now in the intervals', () => {
    const iv = sessionIntervals([start()], plus(15))
    expect(iv).toHaveLength(1)
    expect(iv[0]).toMatchObject({ area_id: 'dsa', task_id: 't1', ended_at: plus(15).toISOString() })
  })
  it('a session across midnight splits between the two Toronto days', () => {
    // 23:30 Nov 10 to 00:45 Nov 11 Toronto (EST) = 04:30Z to 05:45Z... use explicit instants
    const s = pastSession('p', 'pg', { areaId: 'dsa', start: at('2026-11-11T04:30:00Z'), end: at('2026-11-11T05:45:00Z') })
    const m = minutesByDayOf(s, T0)
    expect(m.get('2026-11-10')).toBe(30)
    expect(m.get('2026-11-11')).toBe(45)
    expect(sessionsOnDay([s], '2026-11-10', T0)).toHaveLength(1)
    expect(sessionsOnDay([s], '2026-11-12', T0)).toHaveLength(0)
  })
  it('a paused gap is not counted, even across midnight', () => {
    let s = newSession('s', 'a', { areaId: 'dsa' }, at('2026-11-11T04:00:00Z')) // 23:00 Nov 10
    s = pause(s, at('2026-11-11T04:30:00Z'))
    s = resume(s, 'b', at('2026-11-11T05:30:00Z')) // 00:30 Nov 11
    s = stop(s, at('2026-11-11T06:00:00Z'))
    const m = minutesByDayOf(s, T0)
    expect(m.get('2026-11-10')).toBe(30)
    expect(m.get('2026-11-11')).toBe(30)
  })
  it('clock formats h:mm:ss', () => {
    expect(clock(3_725_000)).toBe('1:02:05')
    expect(clock(-5)).toBe('0:00:00')
  })
})

describe('totals', () => {
  const areas = [
    area({ id: 'study', name: 'Study', kind: 'study' }),
    area({ id: 'dsa', name: 'DSA', kind: 'study', parent_id: 'study' }),
    area({ id: 'sql', name: 'SQL', kind: 'study', parent_id: 'study' }),
    area({ id: 'work', name: 'Work', kind: 'work' }),
  ]
  const a = pastSession('a', 'ga', { areaId: 'dsa', taskId: 't1', start: plus(0), end: plus(60) })
  const b = pastSession('b', 'gb', { areaId: 'sql', taskId: 't2', start: plus(60), end: plus(90) })
  const c = pastSession('c', 'gc', { areaId: 'work', start: plus(100), end: plus(160) })
  const iv = sessionIntervals([a, b, c], plus(200))

  it('minutes per tag, then parent rows with sub-tags', () => {
    const rows = tagRows([{ tag: areas[0], children: [areas[1], areas[2]] }, { tag: areas[3], children: [] }], minutesByTag(iv, '2026-11-10', '2026-11-10'))
    expect(rows.map((r) => [r.tag.name, r.total, r.kids.map((k) => [k.tag.name, k.minutes])])).toEqual([['Study', 90, [['DSA', 60], ['SQL', 30]]], ['Work', 60, []]])
  })
  it('per day per parent: a sub-tag counts toward its parent', () => {
    const m = minutesByDayByParent(iv, areas, '2026-11-10', '2026-11-10')
    expect(m.get('2026-11-10')?.get('study')).toBe(90)
    expect(m.get('2026-11-10')?.get('work')).toBe(60)
  })
  it('minutes of a kind (sub-tags take the parent kind)', () => {
    expect(minutesOfKinds(iv, areas, ['study'], '2026-11-10', '2026-11-10')).toBe(90)
    expect(minutesOfKinds(iv, areas, ['work', 'hustle'], '2026-11-10', '2026-11-10')).toBe(60)
    expect(minutesOfKinds(iv, areas, ['study'], '2026-11-11', '2026-11-11')).toBe(0)
  })
  it('top tasks and estimate vs actual', () => {
    expect(topTasks(iv, '2026-11-10', '2026-11-10')).toEqual([{ task_id: 't1', minutes: 60 }, { task_id: 't2', minutes: 30 }])
    expect(topTasks(iv, '2026-11-10', '2026-11-10', 1)).toHaveLength(1)
    const rows = estimateVsActual([task({ id: 't1', estimate_minutes: 30 }), task({ id: 't2', estimate_minutes: 60 }), task({ id: 't3', estimate_minutes: 10 }), task({ id: 't4' })], taskMinutes(iv))
    expect(rows.map((r) => [r.task.id, r.estimate, r.actual, r.over])).toEqual([['t1', 30, 60, true], ['t2', 60, 30, false]])
  })
})

describe('still going and realtime', () => {
  it('prompts only for a running session older than the limit', () => {
    const s = start()
    expect(stillGoing(s, plus(239), 4)).toBe(false)
    expect(stillGoing(s, plus(240), 4)).toBe(true)
    expect(stillGoing(pause(s, plus(10)), plus(999), 4)).toBe(false)
    expect(stillGoing(null, plus(999), 4)).toBe(false)
    // a resumed stretch counts from the resume, not the first start
    expect(stillGoing(resume(pause(s, plus(10)), 'g2', plus(300)), plus(400), 4)).toBe(false)
  })
  const base = (): Session[] => [start()]
  it('merges session and segment events; start on one device shows on the other', () => {
    const remote = pause(start(), plus(5))
    const { segments: _s, ...row } = remote
    void _s
    let list: Session[] | null = applyTimerChange([], { table: 'session', type: 'INSERT', row: { ...row, state: 'running', ended_at: null } })
    expect(list).toHaveLength(1)
    list = applyTimerChange(list!, { table: 'segment', type: 'INSERT', row: { id: 'g1', session_id: 's1', started_at: T0.toISOString(), ended_at: null } })
    expect(openSegment(list![0])?.id).toBe('g1')
    list = applyTimerChange(list!, { table: 'segment', type: 'UPDATE', row: { id: 'g1', session_id: 's1', started_at: T0.toISOString(), ended_at: plus(5).toISOString() } })
    list = applyTimerChange(list!, { table: 'session', type: 'UPDATE', row })
    expect(list![0]).toMatchObject({ state: 'paused' })
    expect(elapsedMs(list![0], plus(99))).toBe(5 * 60_000)
    expect(list![0].segments).toHaveLength(1)
  })
  it('ignores activity-button sessions, deletes, and asks for a reload for an unknown owner', () => {
    const { segments: _s, ...row } = start()
    void _s
    expect(applyTimerChange([], { table: 'session', type: 'INSERT', row: { ...row, source: 'preset' } })).toEqual([])
    expect(applyTimerChange(base(), { table: 'session', type: 'DELETE', id: 's1' })).toEqual([])
    expect(applyTimerChange(base(), { table: 'segment', type: 'DELETE', id: 'g1' })![0].segments).toEqual([])
    expect(applyTimerChange([], { table: 'segment', type: 'INSERT', row: { id: 'z', session_id: 'nope', started_at: T0.toISOString(), ended_at: null } })).toBeNull()
  })
})
