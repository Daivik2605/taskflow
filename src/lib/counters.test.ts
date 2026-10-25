import { describe, expect, it } from 'vitest'
import {
  activeCounters, applyEventChange, bestGapThisWeek, buildEvent, byHourOfDay, cleanReasons, counterStats, longestGap, reasonCounts, validateReasons, lastEvent, nextCounterSort, perDay, perMonth, perWeek, sinceLabel, sumQty, todaysEvents,
  totalsByDay, validateCounterName, type Counter, type CounterEvent,
} from './counters'

let n = 0
const ev = (day: string, qty = 1, over: Partial<CounterEvent> = {}): CounterEvent => {
  n++
  return { id: `e${n}`, counter_id: 'c1', at: `${day}T15:00:00.000Z`, day, qty, note: null, reason: null, ...over }
}
const TODAY = '2026-11-10' // Tuesday

const events = [
  ...Array.from({ length: 3 }, () => ev('2026-11-10')),
  ev('2026-11-09'), ev('2026-11-09'),
  ev('2026-11-08'),
  ...Array.from({ length: 4 }, () => ev('2026-11-02')),
  ...Array.from({ length: 5 }, () => ev('2026-10-31')),
  ev('2026-01-15'),
]

describe('counter stats', () => {
  it('totals: today, this week, this month, all time', () => {
    const s = counterStats(events, TODAY)
    expect(s).toMatchObject({ today: 3, week: 5, month: 10, allTime: 16 })
  })
  it('the week follows the week-start setting', () => {
    expect(counterStats(events, TODAY, 0).week).toBe(6) // Sunday start: Nov 8–14 includes Sunday's tap
    expect(counterStats(events, TODAY, 1).week).toBe(5)
  })
  it('7- and 30-day daily averages include today', () => {
    const s = counterStats(events, TODAY)
    expect(s.avg7).toBeCloseTo(6 / 7) // Nov 4–10: 3 + 2 + 1
    expect(s.avg30).toBeCloseTo(15 / 30) // Oct 12–Nov 10: 3+2+1+4+5
  })
  it('days since last: 0 if tapped today, null if never', () => {
    expect(counterStats(events, TODAY).daysSinceLast).toBe(0)
    expect(counterStats(events, '2026-11-14').daysSinceLast).toBe(4)
    expect(counterStats([], TODAY).daysSinceLast).toBeNull()
    expect(counterStats([ev('2026-11-20')], TODAY).daysSinceLast).toBeNull() // only future-dated taps
  })
  it('zero days this month run from the 1st up to yesterday — today counts once it is over', () => {
    expect(counterStats(events, TODAY).zeroDaysThisMonth).toBe(6) // Nov 1–9 minus the taps on the 2nd, 8th, 9th
    expect(counterStats([], TODAY).zeroDaysThisMonth).toBe(9)
    expect(counterStats([], '2026-11-01').zeroDaysThisMonth).toBe(0) // nothing is "over" yet on the 1st
    expect(counterStats([], '2026-11-02').zeroDaysThisMonth).toBe(1)
    expect(counterStats([ev('2026-11-10')], TODAY).zeroDaysThisMonth).toBe(9) // a tap today doesn't change days already over
  })
  it('sums quantities, not rows', () => {
    expect(counterStats([ev(TODAY, 3), ev(TODAY, 2)], TODAY).today).toBe(5)
    expect(sumQty([ev(TODAY, 3), ev(TODAY, 2)])).toBe(5)
  })
})

describe('buckets', () => {
  it('per day: the last 30 days, zero-filled, oldest first', () => {
    const b = perDay(events, TODAY)
    expect(b).toHaveLength(30)
    expect(b[0].key).toBe('2026-10-12')
    expect(b[29]).toMatchObject({ key: TODAY, total: 3 })
    expect(b.find((x) => x.key === '2026-10-31')?.total).toBe(5)
    expect(b.find((x) => x.key === '2026-11-01')?.total).toBe(0)
    expect(b.reduce((a, x) => a + x.total, 0)).toBe(15)
  })
  it('per week: 12 weeks ending with this one (Monday start)', () => {
    const b = perWeek(events, TODAY)
    expect(b).toHaveLength(12)
    expect(b.slice(-3).map((x) => [x.key, x.total])).toEqual([['2026-10-26', 5], ['2026-11-02', 5], ['2026-11-09', 5]])
  })
  it('per week with a Sunday start', () => {
    const b = perWeek(events, TODAY, 12, 0)
    expect(b.slice(-2).map((x) => [x.key, x.total])).toEqual([['2026-11-01', 4], ['2026-11-08', 6]])
  })
  it('per month: 12 months ending with this one, across the year end', () => {
    const b = perMonth(events, TODAY)
    expect(b).toHaveLength(12)
    expect(b[0].key).toBe('2025-12')
    expect(b.at(-1)).toMatchObject({ key: '2026-11', total: 10, label: 'Nov 2026' })
    expect(b.find((x) => x.key === '2026-10')?.total).toBe(5)
    expect(b.find((x) => x.key === '2026-01')?.total).toBe(1)
    expect(perMonth([], '2026-01-15', 3).map((x) => x.key)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('Toronto days, including the DST changes', () => {
  const at = (iso: string) => buildEvent('c1', new Date(iso), `d-${iso}`)
  it('a tap at 23:59 and at midnight land on different days', () => {
    expect(at('2026-11-10T04:59:00Z').day).toBe('2026-11-09')
    expect(at('2026-11-10T05:00:00Z').day).toBe('2026-11-10')
  })
  it('the fall-back day (25 hours) is one day, both 01:30s included', () => {
    const e = [at('2026-11-01T04:00:00Z'), at('2026-11-01T05:30:00Z'), at('2026-11-01T06:30:00Z'), at('2026-11-02T04:59:00Z'), at('2026-11-02T05:00:00Z')]
    expect(e.map((x) => x.day)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-02'])
    expect(totalsByDay(e).get('2026-11-01')).toBe(4)
    expect(counterStats(e, '2026-11-01').today).toBe(4)
  })
  it('the spring-forward day (23 hours) is one day', () => {
    const e = [at('2027-03-14T05:00:00Z'), at('2027-03-14T07:30:00Z'), at('2027-03-15T03:59:00Z'), at('2027-03-15T04:00:00Z')]
    expect(e.map((x) => x.day)).toEqual(['2027-03-14', '2027-03-14', '2027-03-14', '2027-03-15'])
  })
  it('builds a past tap with its own time, quantity and note', () => {
    const e = buildEvent('c1', new Date('2026-11-09T18:30:00Z'), 'x', 2, 'after lunch')
    expect(e).toEqual({ id: 'x', counter_id: 'c1', at: '2026-11-09T18:30:00.000Z', day: '2026-11-09', qty: 2, note: 'after lunch', reason: null })
  })
})

describe('"last: 2h 10m ago"', () => {
  const now = '2026-11-10T15:00:00Z'
  const ago = (min: number, sec = 0) => new Date(new Date(now).getTime() - min * 60_000 - sec * 1000)
  it('uses real elapsed time', () => {
    expect(sinceLabel(ago(0, 30), now)).toBe('just now')
    expect(sinceLabel(ago(5), now)).toBe('5m ago')
    expect(sinceLabel(ago(130), now)).toBe('2h 10m ago')
    expect(sinceLabel(ago(120), now)).toBe('2h 00m ago')
    expect(sinceLabel(ago(24 * 60 - 1), now)).toBe('23h 59m ago')
    expect(sinceLabel(ago(24 * 60), now)).toBe('1 day ago')
    expect(sinceLabel(ago(50 * 60), now)).toBe('2 days ago')
    expect(sinceLabel(ago(-5), now)).toBe('just now') // a tap "in the future" never shows a negative
  })
  it('finds the latest tap of a counter and today\'s taps newest first', () => {
    const e = [ev('2026-11-10', 1, { at: '2026-11-10T14:00:00Z', counter_id: 'c1' }), ev('2026-11-10', 1, { at: '2026-11-10T17:00:00Z', counter_id: 'c1' }), ev('2026-11-10', 1, { at: '2026-11-10T20:00:00Z', counter_id: 'c2' })]
    expect(lastEvent(e, 'c1')?.at).toBe('2026-11-10T17:00:00Z')
    expect(lastEvent(e, 'nope')).toBeNull()
    expect(todaysEvents(e, 'c1', '2026-11-10').map((x) => x.at)).toEqual(['2026-11-10T17:00:00Z', '2026-11-10T14:00:00Z'])
  })
})

describe('undo and realtime merge', () => {
  it('undoing a tap (deleting that event) takes it out of today\'s count', () => {
    const tap = buildEvent('c1', new Date('2026-11-10T15:00:00Z'), 'tap1')
    const after = applyEventChange([tap], { type: 'DELETE', id: 'tap1' })
    expect(counterStats([tap], TODAY).today).toBe(1)
    expect(counterStats(after, TODAY).today).toBe(0)
  })
  it('inserts, updates and deletes; our own echo does not duplicate', () => {
    const a = ev('2026-11-10')
    expect(applyEventChange([], { type: 'INSERT', row: a })).toEqual([a])
    expect(applyEventChange([a], { type: 'INSERT', row: a })).toHaveLength(1)
    expect(applyEventChange([a], { type: 'UPDATE', row: { ...a, qty: 3 } })[0].qty).toBe(3)
    expect(applyEventChange([a], { type: 'DELETE', id: a.id })).toEqual([])
    expect(applyEventChange([a], { type: 'DELETE' })).toEqual([a])
  })
  it('editing a tap to another time moves it to that day', () => {
    const a = buildEvent('c1', new Date('2026-11-10T15:00:00Z'), 'a')
    const moved = buildEvent('c1', new Date('2026-11-09T15:00:00Z'), 'a')
    const list = applyEventChange([a], { type: 'UPDATE', row: moved })
    expect(counterStats(list, TODAY).today).toBe(0)
    expect(counterStats(list, '2026-11-09').today).toBe(1)
  })
})

describe('counter list rules', () => {
  const cs: Counter[] = [
    { id: '1', name: 'Weed', short_label: 'Weed', color: '#22c55e', sort: 1, archived: false, reasons: null },
    { id: '2', name: 'Cigarette', short_label: 'Cig', color: '#6b7280', sort: 0, archived: false, reasons: null },
    { id: '3', name: 'Old', short_label: null, color: '#000000', sort: 2, archived: true, reasons: null },
  ]
  it('orders active counters and picks the next sort', () => {
    expect(activeCounters(cs).map((c) => c.name)).toEqual(['Cigarette', 'Weed'])
    expect(nextCounterSort(cs)).toBe(3)
    expect(nextCounterSort([])).toBe(0)
  })
  it('names are required and unique ignoring case (archived included)', () => {
    expect(validateCounterName(' ', cs)).toMatch(/name/)
    expect(validateCounterName('weed', cs)).toMatch(/already exists/)
    expect(validateCounterName('old', cs)).toMatch(/already exists/)
    expect(validateCounterName('Weed', cs, '1')).toBeNull()
    expect(validateCounterName('Coffee', cs)).toBeNull()
  })
})

describe('reasons', () => {
  it('cleanReasons trims, drops empties and case-insensitive duplicates', () => {
    expect(cleanReasons([' bored ', '', 'Bored', 'social'])).toEqual(['bored', 'social'])
  })
  it('validateReasons caps count and length', () => {
    expect(validateReasons(['a', 'b'])).toBeNull()
    expect(validateReasons(Array.from({ length: 13 }, (_, i) => `r${i}`))).toMatch(/At most/)
    expect(validateReasons(['x'.repeat(25)])).toMatch(/24/)
  })
  it('reasonCounts: by quantity, most used first, untagged apart', () => {
    const list = [ev('2026-11-10', 1, { reason: 'bored' }), ev('2026-11-10', 2, { reason: 'stress' }), ev('2026-11-09', 1, { reason: 'bored' }), ev('2026-11-09')]
    expect(reasonCounts(list)).toEqual({ reasons: [{ reason: 'stress', count: 2 }, { reason: 'bored', count: 2 }].sort((a, b) => a.reason.localeCompare(b.reason)), none: 1 })
  })
  it('byHourOfDay uses the Toronto hour and can filter by reason', () => {
    const list = [
      ev('2026-11-10', 1, { at: '2026-11-10T15:30:00.000Z', reason: 'bored' }), // 10:30 Toronto (EST)
      ev('2026-11-10', 2, { at: '2026-11-10T15:05:00.000Z' }),
      ev('2026-11-10', 1, { at: '2026-11-11T03:00:00.000Z', reason: 'bored' }), // 22:00 Toronto
    ]
    const all = byHourOfDay(list)
    expect(all[10]).toBe(3)
    expect(all[22]).toBe(1)
    expect(byHourOfDay(list, 'bored')[10]).toBe(1)
  })
})

describe('gaps between taps', () => {
  const at = (iso: string) => ev('2026-11-10', 1, { at: iso })
  const day = [at('2026-11-10T14:00:00.000Z'), at('2026-11-10T15:30:00.000Z'), at('2026-11-10T16:00:00.000Z')] // 09:00, 10:30, 11:00 Toronto
  it('longest gap on a finished day is between two taps that day', () => {
    expect(longestGap(day, '2026-11-10', '2026-11-12T12:00:00.000Z')).toBe(90)
  })
  it('today, the gap still running counts', () => {
    expect(longestGap(day, '2026-11-10', '2026-11-10T20:00:00.000Z')).toBe(240) // 11:00 → 15:00 Toronto
  })
  it('one tap on a finished day, or none, has no gap; one tap today has the running gap', () => {
    expect(longestGap([day[0]], '2026-11-10', '2026-11-12T12:00:00.000Z')).toBeNull()
    expect(longestGap([], '2026-11-10', '2026-11-10T20:00:00.000Z')).toBeNull()
    expect(longestGap([day[0]], '2026-11-10', '2026-11-10T16:00:00.000Z')).toBe(120)
  })
  it('the overnight gap is not counted', () => {
    const two = [at('2026-11-10T03:00:00.000Z'), ev('2026-11-11', 1, { at: '2026-11-11T14:00:00.000Z' })] // 22:00 on the 9th... and 09:00 on the 11th
    expect(longestGap(two, '2026-11-11', '2026-11-12T12:00:00.000Z')).toBeNull()
  })
  it('best gap this week is the best day so far', () => {
    const wk = [...day, ev('2026-11-09', 1, { at: '2026-11-09T14:00:00.000Z' }), ev('2026-11-09', 1, { at: '2026-11-09T20:00:00.000Z' })]
    expect(bestGapThisWeek(wk, '2026-11-10', '2026-11-10T16:00:00.000Z')).toBe(360) // Monday 09:00 → 15:00
    expect(bestGapThisWeek([], '2026-11-10', '2026-11-10T16:00:00.000Z')).toBeNull()
  })
})
