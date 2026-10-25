import { describe, expect, it } from 'vitest'
import { done, task } from './fixtures'
import {
  applyChange, applyStatus, buildNewTask, childrenOf, completedDay, completedOn, counts, filterTasks, groupForView, inView, isActive, isDeadlineMissed, isDoneLate,
  isMissed, isTaskMissed, isUpcoming, nextSort, parseTags, rangeStats, reorderWithin, subtaskProgress, taskChips, todaySections, validateWhen, whenOf, whenPatch,
  windowFor, windowPreset, type Task,
} from './tasks'
import { todayToronto } from './time'

const TODAY = '2026-11-10' // Tuesday

describe('missed: tasks and deadlines are separate', () => {
  it('a normal task due yesterday is a missed task; due today or later is not; undated is not', () => {
    expect(isTaskMissed(task({ due_on: '2026-11-09' }), TODAY)).toBe(true)
    expect(isTaskMissed(task({ due_on: TODAY }), TODAY)).toBe(false)
    expect(isTaskMissed(task({ due_on: '2026-11-11' }), TODAY)).toBe(false)
    expect(isTaskMissed(task(), TODAY)).toBe(false)
  })
  it('a hard deadline that passed is a missed deadline, not a missed task', () => {
    const d = task({ due_on: '2026-11-09', hard_deadline: true })
    expect(isDeadlineMissed(d, TODAY)).toBe(true)
    expect(isTaskMissed(d, TODAY)).toBe(false)
    expect(isMissed(d, TODAY)).toBe(true)
    expect(isDeadlineMissed(task({ due_on: TODAY, hard_deadline: true }), TODAY)).toBe(false)
  })
  it('a window is missed when it ends', () => {
    const w = task({ start_on: '2026-10-27', due_on: '2026-11-09' })
    expect(isTaskMissed(w, '2026-11-09')).toBe(false)
    expect(isTaskMissed(w, TODAY)).toBe(true)
  })
  it('done and dropped tasks are never missed now', () => {
    expect(isMissed(done('2026-11-01', '2026-11-01T15:00:00Z'), TODAY)).toBe(false)
    expect(isMissed(task({ due_on: '2026-11-01', status: 'dropped' }), TODAY)).toBe(false)
  })
  it('flips exactly at Toronto midnight, not UTC midnight', () => {
    const t = task({ due_on: '2026-11-09' })
    expect(isMissed(t, todayToronto('2026-11-10T04:59:59Z'))).toBe(false)
    expect(isMissed(t, todayToronto('2026-11-10T05:00:00Z'))).toBe(true)
  })
  it('flips at midnight on the fall-back and spring-forward days', () => {
    const fall = task({ due_on: '2026-11-01' })
    expect(isMissed(fall, todayToronto('2026-11-02T04:59:59Z'))).toBe(false)
    expect(isMissed(fall, todayToronto('2026-11-02T05:00:00Z'))).toBe(true)
    const spring = task({ due_on: '2027-03-14', hard_deadline: true })
    expect(isDeadlineMissed(spring, todayToronto('2027-03-15T03:59:59Z'))).toBe(false)
    expect(isDeadlineMissed(spring, todayToronto('2027-03-15T04:00:00Z'))).toBe(true)
  })
})

describe('upcoming vs active', () => {
  it('a task before its start day is upcoming and not active', () => {
    const t = task({ start_on: '2026-11-11', due_on: '2026-11-20' })
    expect(isUpcoming(t, TODAY)).toBe(true)
    expect(isActive(t, TODAY)).toBe(false)
    expect(isUpcoming(t, '2026-11-11')).toBe(false)
    expect(isActive(t, '2026-11-11')).toBe(true)
  })
  it('with no start day a task is always active (including everything created before revision 2)', () => {
    expect(isActive(task({ due_on: '2026-12-25' }), TODAY)).toBe(true)
    expect(isActive(task(), TODAY)).toBe(true)
  })
  it('done and dropped are neither', () => {
    expect(isActive(done(null, '2026-11-01T12:00:00Z', { start_on: '2026-11-20' }), TODAY)).toBe(false)
    expect(isUpcoming(task({ status: 'dropped', start_on: '2026-11-20' }), TODAY)).toBe(false)
  })
})

describe('done late', () => {
  it('is on time through 23:59 Toronto and late from midnight', () => {
    expect(isDoneLate(done('2026-11-09', '2026-11-10T04:59:59Z'))).toBe(false)
    expect(isDoneLate(done('2026-11-09', '2026-11-10T05:00:00Z'))).toBe(true)
  })
  it('handles the DST change days', () => {
    expect(isDoneLate(done('2026-11-01', '2026-11-02T04:59:00Z'))).toBe(false)
    expect(isDoneLate(done('2026-11-01', '2026-11-02T05:00:00Z'))).toBe(true)
    expect(isDoneLate(done('2026-11-01', '2026-11-01T06:30:00Z'))).toBe(false)
    expect(isDoneLate(done('2027-03-14', '2027-03-15T03:59:00Z'))).toBe(false)
    expect(isDoneLate(done('2027-03-14', '2027-03-15T04:00:00Z'))).toBe(true)
  })
  it('needs a due date and a completion', () => {
    expect(isDoneLate(done(null, '2026-11-10T12:00:00Z'))).toBe(false)
    expect(isDoneLate(task({ due_on: '2026-11-01' }))).toBe(false)
  })
  it('completedDay uses the Toronto day', () => {
    expect(completedDay(done(null, '2026-11-10T04:59:00Z'))).toBe('2026-11-09')
    expect(completedDay(done(null, '2026-11-10T05:00:00Z'))).toBe('2026-11-10')
    expect(completedDay(task())).toBeNull()
  })
})

describe('applyStatus', () => {
  const now = new Date('2026-11-10T15:00:00Z')
  it('stamps completion when moving to done and clears it when leaving', () => {
    expect(applyStatus({ status: 'todo', completed_at: null }, 'done', now)).toEqual({ status: 'done', completed_at: now.toISOString() })
    expect(applyStatus({ status: 'done', completed_at: '2026-11-09T12:00:00Z' }, 'todo', now)).toEqual({ status: 'todo', completed_at: null })
    expect(applyStatus({ status: 'done', completed_at: '2026-11-09T12:00:00Z' }, 'dropped', now).completed_at).toBeNull()
  })
  it('keeps the original completion time when re-saving a done task', () => {
    expect(applyStatus({ status: 'done', completed_at: '2026-11-09T12:00:00Z' }, 'done', now).completed_at).toBe('2026-11-09T12:00:00Z')
  })
})

describe('the When control', () => {
  it('reads each kind of date from a task', () => {
    expect(whenOf(task())).toEqual({ kind: 'none' })
    expect(whenOf(task({ start_on: '2026-11-12', due_on: '2026-11-12' }))).toEqual({ kind: 'day', day: '2026-11-12' })
    expect(whenOf(task({ start_on: '2026-11-10', due_on: '2026-11-24' }))).toEqual({ kind: 'window', start: '2026-11-10', end: '2026-11-24' })
    expect(whenOf(task({ due_on: '2026-11-09', hard_deadline: true }))).toEqual({ kind: 'deadline', due: '2026-11-09', startFrom: null })
    expect(whenOf(task({ start_on: '2026-11-02', due_on: '2026-11-09', hard_deadline: true }))).toEqual({ kind: 'deadline', due: '2026-11-09', startFrom: '2026-11-02' })
  })
  it('treats a task made before revision 2 (due date, no start) as an open-ended window', () => {
    expect(whenOf(task({ due_on: '2026-11-14' }))).toEqual({ kind: 'window', start: null, end: '2026-11-14' })
  })
  it('turns each kind back into the columns, clearing the ones that no longer apply', () => {
    expect(whenPatch({ kind: 'none' })).toEqual({ start_on: null, due_on: null, hard_deadline: false })
    expect(whenPatch({ kind: 'day', day: '2026-11-12' })).toEqual({ start_on: '2026-11-12', due_on: '2026-11-12', hard_deadline: false })
    expect(whenPatch({ kind: 'window', start: '2026-11-10', end: '2026-11-24' })).toEqual({ start_on: '2026-11-10', due_on: '2026-11-24', hard_deadline: false })
    expect(whenPatch({ kind: 'deadline', due: '2026-11-09', startFrom: null })).toEqual({ start_on: null, due_on: '2026-11-09', hard_deadline: true })
  })
  it('switching a dated task to a deadline drops its start day, so the countdown shows straight away', () => {
    const pass = task({ title: 'Pass G2', start_on: '2026-11-09', due_on: '2026-11-09' })
    const patch = whenPatch({ kind: 'deadline', due: '2026-11-09', startFrom: null })
    expect(isUpcoming({ ...pass, ...patch }, '2026-10-24')).toBe(false)
    expect(taskChips({ ...pass, ...patch }, '2026-10-24').map((c) => c.text)).toEqual(['⚑ Deadline in 16 days'])
  })
  it('validates', () => {
    expect(validateWhen({ kind: 'none' })).toBeNull()
    expect(validateWhen({ kind: 'day', day: '2026-11-12' })).toBeNull()
    expect(validateWhen({ kind: 'day', day: '' })).toMatch(/day/)
    expect(validateWhen({ kind: 'window', start: '2026-11-10', end: '2026-11-24' })).toBeNull()
    expect(validateWhen({ kind: 'window', start: null, end: '2026-11-24' })).toBeNull()
    expect(validateWhen({ kind: 'window', start: '2026-11-25', end: '2026-11-24' })).toMatch(/end on or after/)
    expect(validateWhen({ kind: 'window', start: '2026-11-10', end: '2026-02-30' })).toMatch(/ends/)
    expect(validateWhen({ kind: 'deadline', due: '2026-11-09', startFrom: null })).toBeNull()
    expect(validateWhen({ kind: 'deadline', due: '2026-11-09', startFrom: '2026-11-10' })).toMatch(/on or before/)
    expect(validateWhen({ kind: 'deadline', due: '', startFrom: null })).toMatch(/deadline day/)
  })
})

describe('window presets', () => {
  it('This week ends on the last day of the week, which depends on the week-start setting', () => {
    expect(windowPreset('this_week', TODAY, 1)).toEqual({ start: TODAY, end: '2026-11-15' }) // Monday start → Sunday
    expect(windowPreset('this_week', TODAY, 0)).toEqual({ start: TODAY, end: '2026-11-14' }) // Sunday start → Saturday
    expect(windowPreset('this_week', '2026-11-15', 1)).toEqual({ start: '2026-11-15', end: '2026-11-15' }) // last day of the week
  })
  it('Next 7 days and Next 2 weeks start today and include today', () => {
    expect(windowPreset('next_7', TODAY, 1)).toEqual({ start: TODAY, end: '2026-11-16' })
    expect(windowPreset('next_14', TODAY, 1)).toEqual({ start: TODAY, end: '2026-11-23' })
    expect(windowPreset('next_14', '2026-12-25', 1)).toEqual({ start: '2026-12-25', end: '2027-01-07' })
  })
  it('This month ends on the last day of the month', () => {
    expect(windowPreset('this_month', TODAY, 1)).toEqual({ start: TODAY, end: '2026-11-30' })
    expect(windowPreset('this_month', '2028-02-10', 1)).toEqual({ start: '2028-02-10', end: '2028-02-29' })
  })
  it('a Next-2-weeks task shows days left, then becomes missed when its window ends', () => {
    const { start, end } = windowPreset('next_14', TODAY, 1)
    const t = task({ start_on: start, due_on: end })
    expect(taskChips(t, TODAY).map((c) => c.text)).toEqual(['Window · 14 days left'])
    expect(taskChips(t, '2026-11-22').map((c) => c.text)).toEqual(['Window · 2 days left'])
    expect(taskChips(t, end).map((c) => c.text)).toEqual(['Window · last day'])
    expect(isMissed(t, end)).toBe(false)
    expect(isTaskMissed(t, '2026-11-24')).toBe(true)
    expect(taskChips(t, '2026-11-24').map((c) => c.text)).toEqual(['Missed'])
  })
})

describe('row chips', () => {
  const texts = (t: Task, today = TODAY) => taskChips(t, today).map((c) => c.text)
  const tone = (t: Task, today = TODAY) => taskChips(t, today)[0]?.tone
  it('deadline countdown: neutral, amber within 7 days, red within 2 days or past', () => {
    expect(texts(task({ due_on: '2026-11-26', hard_deadline: true }))).toEqual(['⚑ Deadline in 16 days'])
    expect(tone(task({ due_on: '2026-11-26', hard_deadline: true }))).toBe('neutral')
    expect(tone(task({ due_on: '2026-11-17', hard_deadline: true }))).toBe('amber') // 7 days
    expect(tone(task({ due_on: '2026-11-18', hard_deadline: true }))).toBe('neutral') // 8 days
    expect(texts(task({ due_on: '2026-11-12', hard_deadline: true }))).toEqual(['⚑ Deadline in 2 days'])
    expect(tone(task({ due_on: '2026-11-12', hard_deadline: true }))).toBe('red')
    expect(texts(task({ due_on: '2026-11-11', hard_deadline: true }))).toEqual(['⚑ Deadline tomorrow'])
    expect(texts(task({ due_on: TODAY, hard_deadline: true }))).toEqual(['⚑ Deadline today'])
    expect(tone(task({ due_on: TODAY, hard_deadline: true }))).toBe('red')
    expect(texts(task({ due_on: '2026-11-09', hard_deadline: true }))).toEqual(['⚑ Deadline missed'])
  })
  it('days left counts today, and says "last day" on the last one', () => {
    expect(texts(task({ start_on: '2026-11-08', due_on: '2026-11-13' }))).toEqual(['Window · 4 days left'])
    expect(texts(task({ start_on: '2026-11-08', due_on: '2026-11-11' }))).toEqual(['Window · 2 days left'])
    expect(texts(task({ start_on: '2026-11-08', due_on: TODAY }))).toEqual(['Window · last day'])
    expect(tone(task({ start_on: '2026-11-08', due_on: TODAY }))).toBe('amber')
  })
  it('a task with a due date and no start (made before revision 2) is active now and shows "N days left"', () => {
    expect(texts(task({ due_on: '2026-11-14' }))).toEqual(['5 days left'])
    expect(texts(task({ due_on: '2026-11-11' }))).toEqual(['2 days left'])
    expect(texts(task({ due_on: TODAY }))).toEqual(['Today'])
    expect(texts(task({ due_on: '2026-11-09' }))).toEqual(['Missed'])
  })
  it('one-day tasks, upcoming tasks and estimates', () => {
    expect(texts(task({ start_on: TODAY, due_on: TODAY }))).toEqual(['Today'])
    expect(texts(task({ start_on: '2026-11-11', due_on: '2026-11-11' }))).toEqual(['Starts tomorrow'])
    expect(texts(task({ start_on: '2026-11-20', due_on: '2026-11-20' }))).toEqual(['Starts Fri 20 Nov'])
    expect(texts(task({ start_on: '2026-11-15', due_on: '2026-11-20' }))).toEqual(['Starts Sun 15 Nov'])
    expect(texts(task({ start_on: TODAY, due_on: TODAY, estimate_minutes: 120 }))).toEqual(['Today', 'est 2h 00m'])
    expect(texts(task({ estimate_minutes: 45 }))).toEqual(['est 45m'])
    expect(texts(task())).toEqual([])
  })
  it('done tasks show Late (or Deadline late) only when late; dropped says so', () => {
    expect(texts(done('2026-11-09', '2026-11-10T15:00:00Z'))).toEqual(['Late'])
    expect(texts(done('2026-11-09', '2026-11-10T15:00:00Z', { hard_deadline: true }))).toEqual(['⚑ Deadline late'])
    expect(texts(done('2026-11-10', '2026-11-10T15:00:00Z'))).toEqual([])
    expect(texts(task({ status: 'dropped', due_on: '2026-11-01' }))).toEqual(['Dropped'])
  })
})

describe('counters', () => {
  const tasks: Task[] = [
    task({ title: 'A', due_on: '2026-11-09' }), // missed task, this week
    task({ title: 'B', due_on: TODAY }), // left today
    task({ title: 'C', start_on: '2026-11-08', due_on: '2026-11-12' }), // window, left this week
    task({ title: 'D' }), // no date: left (all time only)
    done('2026-11-09', '2026-11-09T17:00:00Z', { title: 'E' }), // on time, yesterday
    done('2026-11-08', '2026-11-10T15:00:00Z', { title: 'F' }), // done late today (due last week)
    task({ title: 'G', status: 'dropped', due_on: '2026-11-09' }),
    task({ title: 'H', due_on: '2026-11-09', parent_id: 'x' }), // sub-task: ignored
    task({ title: 'I', due_on: '2026-11-05', hard_deadline: true }), // missed deadline (this month, not this week)
    task({ title: 'J', due_on: '2026-11-12', hard_deadline: true }), // deadline ahead
    task({ title: 'K', start_on: '2026-11-20', due_on: '2026-11-25' }), // upcoming: not "left" yet
    done('2026-11-02', '2026-11-03T15:00:00Z', { title: 'L', hard_deadline: true }), // deadline finished late
    task({ title: 'M', due_on: '2026-10-20' }), // missed in October
  ]
  it('today', () => { expect(counts(tasks, TODAY, 'today')).toEqual({ done: 1, missed: 0, deadlinesMissed: 0, left: 1 }) })
  it('this week (Monday start)', () => { expect(counts(tasks, TODAY, 'week')).toEqual({ done: 2, missed: 1, deadlinesMissed: 0, left: 3 }) })
  it('this week with a Sunday start moves the window', () => {
    expect(counts(tasks, TODAY, 'week', 0)).toEqual({ done: 2, missed: 2, deadlinesMissed: 0, left: 3 }) // Nov 8–14 now includes F's due day
  })
  it('this month', () => { expect(counts(tasks, TODAY, 'month')).toEqual({ done: 3, missed: 2, deadlinesMissed: 2, left: 3 }) })
  it('all time', () => { expect(counts(tasks, TODAY, 'all')).toEqual({ done: 3, missed: 3, deadlinesMissed: 2, left: 4 }) })
  it('tasks missed and deadlines missed are counted separately', () => {
    const t = [task({ due_on: '2026-11-01' }), task({ due_on: '2026-11-01', hard_deadline: true })]
    expect(counts(t, TODAY, 'all')).toMatchObject({ missed: 1, deadlinesMissed: 1 })
  })
  it('done-late still counts as missed in history, and as done', () => {
    expect(counts([done('2026-11-09', '2026-11-10T05:00:00Z')], TODAY, 'all')).toEqual({ done: 1, missed: 1, deadlinesMissed: 0, left: 0 })
    expect(counts([done('2026-11-09', '2026-11-10T05:00:00Z', { hard_deadline: true })], TODAY, 'all')).toEqual({ done: 1, missed: 0, deadlinesMissed: 1, left: 0 })
  })
  it('moves a completion across the week boundary at Toronto midnight, not UTC', () => {
    expect(counts([done(null, '2026-11-16T04:59:00Z')], '2026-11-15', 'week').done).toBe(1) // Sun 23:59
    const u = [done(null, '2026-11-16T05:00:00Z')] // Mon 00:00
    expect(counts(u, '2026-11-16', 'week').done).toBe(1)
    expect(counts(u, '2026-11-15', 'week').done).toBe(0)
  })
  it('moves a completion across the month boundary at Toronto midnight', () => {
    expect(counts([done(null, '2026-12-01T04:59:00Z')], '2026-11-30', 'month').done).toBe(1)
    expect(counts([done(null, '2026-12-01T05:00:00Z')], '2026-11-30', 'month').done).toBe(0)
  })
  it('counts the fall-back day as one day and the spring-forward day as one day', () => {
    const fall = [done(null, '2026-11-01T05:30:00Z'), done(null, '2026-11-01T06:30:00Z'), done(null, '2026-11-02T04:59:00Z')]
    expect(counts(fall, '2026-11-01', 'today').done).toBe(3)
    expect(counts(fall, '2026-11-02', 'today').done).toBe(0)
    const spring = [done(null, '2027-03-14T05:00:00Z'), done(null, '2027-03-15T03:59:00Z')]
    expect(counts(spring, '2027-03-14', 'today').done).toBe(2)
  })
  it('windows', () => {
    expect(windowFor('today', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(windowFor('week', TODAY)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(windowFor('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(windowFor('all', TODAY)).toEqual({ from: null, to: null })
  })
})

describe('range stats and the day log', () => {
  const all = [
    done('2026-11-02', '2026-11-02T15:00:00Z', { title: 'on time' }),
    done('2026-11-02', '2026-11-04T15:00:00Z', { title: 'late' }),
    task({ title: 'missed', due_on: '2026-11-03' }),
    task({ title: 'missed deadline', due_on: '2026-11-05', hard_deadline: true }),
    done('2026-11-06', '2026-11-08T15:00:00Z', { title: 'late deadline', hard_deadline: true }),
    task({ title: 'future', due_on: '2026-11-30' }),
    task({ title: 'outside', due_on: '2026-10-01' }),
    task({ title: 'sub', due_on: '2026-11-03', parent_id: 'p' }),
    task({ title: 'dropped', due_on: '2026-11-03', status: 'dropped' }),
  ]
  const r = rangeStats(all, '2026-11-01', '2026-11-09', TODAY)
  it('lists what was done', () => { expect(r.done.map((t) => t.title)).toEqual(['on time', 'late', 'late deadline']) })
  it('lists missed tasks and missed deadlines separately (late ones included, sub-tasks and dropped excluded)', () => {
    expect(r.missed.map((t) => t.title)).toEqual(['late', 'on time'].filter((x) => x === 'late').concat(['missed']).sort((a, b) => (a === 'late' ? -1 : 1)).slice(0, 2))
    expect(r.deadlinesMissed.map((t) => t.title)).toEqual(['missed deadline', 'late deadline'])
  })
  it('ignores tasks due outside the range', () => { expect([...r.missed, ...r.deadlinesMissed].some((t) => t.title === 'outside' || t.title === 'future')).toBe(false) })
  it('the day log lists what was finished that day, sub-tasks included, in order', () => {
    const items = [done(null, '2026-11-10T18:00:00Z', { title: 'second' }), done(null, '2026-11-10T14:00:00Z', { title: 'first' }), done(null, '2026-11-10T15:00:00Z', { title: 'sub', parent_id: 'p' }), done(null, '2026-11-11T15:00:00Z')]
    expect(completedOn(items, '2026-11-10').map((t) => t.title)).toEqual(['first', 'sub', 'second'])
    expect(completedOn(items, '2026-11-09')).toEqual([])
  })
})

describe('views', () => {
  const t1 = task({ title: 't1 missed', due_on: '2026-11-09' })
  const t2 = task({ title: 't2 today', due_on: TODAY })
  const t3 = task({ title: 't3 window', start_on: '2026-11-08', due_on: '2026-11-14' })
  const t4 = task({ title: 't4 deadline soon', due_on: '2026-11-20', hard_deadline: true })
  const t5 = task({ title: 't5 deadline far', due_on: '2026-12-20', hard_deadline: true })
  const t6 = task({ title: 't6 deadline missed', due_on: '2026-11-05', hard_deadline: true })
  const t7 = task({ title: 't7 upcoming', start_on: '2026-11-12', due_on: '2026-11-12' })
  const t8 = task({ title: 't8 no date' })
  const t9 = done(TODAY, '2026-11-10T15:00:00Z', { title: 't9 done' })
  const t10 = task({ title: 't10 dropped', status: 'dropped' })
  const all = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10]
  const names = (v: Parameters<typeof groupForView>[1]) => groupForView(all, v, TODAY).map((g) => [g.label, g.tasks.map((t) => t.title.split(' ')[0])])

  it('membership', () => {
    const inV = (v: Parameters<typeof inView>[1]) => all.filter((t) => inView(t, v, TODAY)).map((t) => t.title.split(' ')[0])
    expect(inV('today')).toEqual(['t1', 't2', 't3', 't4', 't6'])
    expect(inV('upcoming')).toEqual(['t7'])
    expect(inV('deadlines')).toEqual(['t4', 't5', 't6'])
    expect(inV('anytime')).toEqual(['t8'])
    expect(inV('done')).toEqual(['t9', 't10'])
  })
  it('Today groups: missed (oldest first), deadlines, today, in a window', () => {
    expect(names('today')).toEqual([['Missed', ['t6', 't1']], ['Deadlines coming up', ['t4']], ['Today', ['t2']], ['In a window', ['t3']]])
  })
  it('Upcoming groups by start day', () => { expect(names('upcoming')).toEqual([['Thu 12 Nov', ['t7']]]) })
  it('Deadlines: missed, within 7 days, later', () => { expect(names('deadlines')).toEqual([['Missed', ['t6']], ['Later', ['t4', 't5']]]) })
  it('Anytime and Done', () => {
    expect(names('anytime')).toEqual([['No date', ['t8']]])
    expect(names('done')).toEqual([['Today', ['t9']], ['Dropped', ['t10']]])
  })
  it('Done groups by completion day, newest first', () => {
    const old = done(null, '2026-11-09T15:00:00Z', { title: 'older' })
    const g = groupForView([old, t9], 'done', TODAY)
    expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday'])
  })
  it('an upcoming task is hidden from Today until its start day', () => {
    expect(inView(t7, 'today', TODAY)).toBe(false)
    expect(inView(t7, 'today', '2026-11-12')).toBe(true)
  })
})

describe('Today sections', () => {
  const s = todaySections([
    task({ title: 'missed', due_on: '2026-11-09' }), task({ title: 'missed deadline', due_on: '2026-11-08', hard_deadline: true }),
    task({ title: 'dl in 10', due_on: '2026-11-20', hard_deadline: true }), task({ title: 'dl in 40', due_on: '2026-12-20', hard_deadline: true }),
    task({ title: 'today', due_on: TODAY }), task({ title: 'window', start_on: TODAY, due_on: '2026-11-24' }),
    task({ title: 'later one', due_on: '2026-12-01' }), task({ title: 'upcoming', start_on: '2026-11-12', due_on: '2026-11-12' }),
    task({ title: 'nodate' }), task({ title: 'sub', due_on: '2026-11-09', parent_id: 'p' }),
    done(TODAY, '2026-11-10T14:00:00Z', { title: 'finished' }), done(null, '2026-11-09T15:00:00Z', { title: 'yesterday' }),
  ], TODAY)
  const t = (l: Task[]) => l.map((x) => x.title)
  it('missed tasks and missed deadlines both go to reschedule-or-drop', () => { expect(t(s.missed)).toEqual(['missed deadline', 'missed']) })
  it('deadlines only within the next 14 days', () => { expect(t(s.deadlines)).toEqual(['dl in 10']) })
  it('today, in a window (everything dated ahead that has started), no date, done today', () => {
    expect(t(s.today)).toEqual(['today'])
    expect(t(s.inWindow)).toEqual(['window', 'later one'])
    expect(t(s.noDate)).toEqual(['nodate'])
    expect(t(s.doneToday)).toEqual(['finished'])
  })
})

describe('filters', () => {
  const all = [
    task({ title: 'a', area_id: 'dsa', owner: 'Anikait', tags: ['agent'] }), task({ title: 'b', area_id: 'study', project_id: 'P' }),
    task({ title: 'c', area_id: 'tim' }), task({ title: 'd' }),
  ]
  const titles = (f: Parameters<typeof filterTasks>[1]) => filterTasks(all, f).map((t) => t.title)
  it('no filter keeps everything', () => { expect(titles({})).toEqual(['a', 'b', 'c', 'd']) })
  it('a parent tag includes its sub-tags; a sub-tag is just itself', () => {
    expect(titles({ areaIds: new Set(['study', 'dsa']) })).toEqual(['a', 'b'])
    expect(titles({ areaIds: new Set(['dsa']) })).toEqual(['a'])
  })
  it('filters project, owner and label', () => {
    expect(titles({ project: 'P' })).toEqual(['b'])
    expect(titles({ owner: 'Anikait' })).toEqual(['a'])
    expect(titles({ label: 'agent' })).toEqual(['a'])
    expect(titles({ owner: 'me', areaIds: new Set(['dsa']) })).toEqual([])
  })
})

describe('reordering and sub-tasks', () => {
  const g = (sorts: number[]) => sorts.map((s, i) => task({ id: `r${i}`, sort: s }))
  it('swaps two neighbours using existing slots', () => {
    const group = g([10, 20, 30])
    expect(reorderWithin(group, 'r1', 'up')).toEqual([{ id: 'r1', sort: 10 }, { id: 'r0', sort: 20 }])
    expect(reorderWithin(group, 'r1', 'down')).toEqual([{ id: 'r2', sort: 20 }, { id: 'r1', sort: 30 }])
  })
  it('does nothing at the ends or for an unknown id', () => {
    const group = g([10, 20])
    expect(reorderWithin(group, 'r0', 'up')).toEqual([])
    expect(reorderWithin(group, 'r1', 'down')).toEqual([])
    expect(reorderWithin(group, 'nope', 'up')).toEqual([])
  })
  it('renumbers when sort values collide', () => {
    const group = g([0, 0, 0])
    const result = new Map(group.map((t) => [t.id, t.sort]))
    reorderWithin(group, 'r2', 'up').forEach((c) => result.set(c.id, c.sort))
    expect([...result].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(['r0', 'r2', 'r1'])
  })
  it('puts new tasks at the bottom', () => {
    expect(nextSort([])).toBe(10)
    expect(nextSort(g([10, 40, 20]))).toBe(50)
  })
  it('counts sub-task progress, ignoring dropped', () => {
    const kids = [task({ parent_id: 'p', status: 'done' }), task({ parent_id: 'p' }), task({ parent_id: 'p', status: 'dropped' }), task({ parent_id: 'q' })]
    expect(subtaskProgress(kids, 'p')).toEqual({ done: 1, total: 2 })
    expect(childrenOf(kids, 'p')).toHaveLength(3)
  })
})

describe('input', () => {
  const now = new Date('2026-10-24T20:00:00Z')
  it('quick add with a date means "on that day" (start = due)', () => {
    const t = buildNewTask({ title: '  Pass G2 ', due_on: '2026-11-09', area_id: 'personal' }, 10, now, 'id1')!
    expect(t).toMatchObject({ id: 'id1', title: 'Pass G2', start_on: '2026-11-09', due_on: '2026-11-09', hard_deadline: false, area_id: 'personal', status: 'todo', sort: 10 })
    expect(isMissed(t, '2026-11-10')).toBe(true)
  })
  it('rejects empty titles and impossible dates; an empty date means no date', () => {
    expect(buildNewTask({ title: '   ' }, 10, now, 'x')).toBeNull()
    expect(buildNewTask({ title: 'a', due_on: '2026-02-30' }, 10, now, 'x')).toBeNull()
    expect(buildNewTask({ title: 'a', due_on: '' }, 10, now, 'x')).toMatchObject({ due_on: null, start_on: null })
  })
  it('parses labels', () => {
    expect(parseTags('agent, agent:building,\n  ,urgent')).toEqual(['agent', 'agent:building', 'urgent'])
    expect(parseTags('')).toEqual([])
  })
})

describe('applyChange (realtime merge)', () => {
  const a = task({ id: 'a', title: 'A', updated_at: '2026-10-24T10:00:00Z' })
  const b = task({ id: 'b', title: 'B' })
  it('inserts, updates and deletes', () => {
    expect(applyChange([a], { type: 'INSERT', row: b })).toEqual([a, b])
    expect(applyChange([a, b], { type: 'UPDATE', row: { ...a, title: 'A2', updated_at: '2026-10-24T11:00:00Z' } })[0].title).toBe('A2')
    expect(applyChange([a, b], { type: 'DELETE', id: 'a' })).toEqual([b])
  })
  it('deleting a parent removes its sub-tasks', () => {
    expect(applyChange([a, task({ id: 'k', parent_id: 'a' }), b], { type: 'DELETE', id: 'a' })).toEqual([b])
  })
  it('does not duplicate our own echo, and ignores an older event', () => {
    expect(applyChange([a], { type: 'INSERT', row: a })).toHaveLength(1)
    const newer = { ...a, title: 'new', updated_at: '2026-10-24T12:00:00Z' }
    expect(applyChange([newer], { type: 'UPDATE', row: { ...a, title: 'old', updated_at: '2026-10-24T09:00:00Z' } })[0].title).toBe('new')
  })
  it('an update for an unknown task adds it (missed insert)', () => { expect(applyChange([a], { type: 'UPDATE', row: b })).toHaveLength(2) })
})
