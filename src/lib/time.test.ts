import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, dayOf, diffDays, formatDay, formatDuration, formatMonth, formatTime, instantToTorontoLocal, isDay, monthBounds, parseDuration,
  splitByDay, todayToronto, torontoLocalToInstant, torontoMidnight, weekBounds, weekdayIndex, weekdayOf,
} from './time'

describe('dayOf / todayToronto', () => {
  it('uses the Toronto date, not the UTC date', () => {
    // 2026-10-25 02:30 UTC = 22:30 EDT on the 24th
    expect(dayOf('2026-10-25T02:30:00Z')).toBe('2026-10-24')
    expect(todayToronto(new Date('2026-10-25T02:30:00Z'))).toBe('2026-10-24')
  })
  it('rolls over exactly at Toronto midnight (EDT, UTC-4)', () => {
    expect(dayOf('2026-10-24T03:59:59Z')).toBe('2026-10-23')
    expect(dayOf('2026-10-24T04:00:00Z')).toBe('2026-10-24')
  })
  it('rolls over exactly at Toronto midnight (EST, UTC-5)', () => {
    expect(dayOf('2026-12-15T04:59:59Z')).toBe('2026-12-14')
    expect(dayOf('2026-12-15T05:00:00Z')).toBe('2026-12-15')
  })
  it('accepts Date, string and number', () => {
    const iso = '2026-07-01T12:00:00Z'
    expect(dayOf(new Date(iso))).toBe('2026-07-01')
    expect(dayOf(Date.parse(iso))).toBe('2026-07-01')
  })
  it('rejects an invalid instant', () => {
    expect(() => dayOf('nope')).toThrow()
  })
})

describe('day arithmetic', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-11-09', -10)).toBe('2026-10-30')
  })
  it('diffs days regardless of DST', () => {
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2)
    expect(diffDays('2027-03-13', '2027-03-15')).toBe(2)
  })
  it('validates day strings', () => {
    expect(isDay('2026-11-09')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-1-9')).toBe(false)
    expect(() => addDays('2026-13-01', 1)).toThrow()
  })
})

describe('torontoMidnight', () => {
  it('is 04:00Z in summer and 05:00Z in winter', () => {
    expect(torontoMidnight('2026-07-01').toISOString()).toBe('2026-07-01T04:00:00.000Z')
    expect(torontoMidnight('2026-12-15').toISOString()).toBe('2026-12-15T05:00:00.000Z')
  })
  it('handles the DST change days', () => {
    // Fall back Sun 2026-11-01: midnight is still EDT, the next midnight is EST
    expect(torontoMidnight('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(torontoMidnight('2026-11-02').toISOString()).toBe('2026-11-02T05:00:00.000Z')
    // Spring forward Sun 2027-03-14
    expect(torontoMidnight('2027-03-14').toISOString()).toBe('2027-03-14T05:00:00.000Z')
    expect(torontoMidnight('2027-03-15').toISOString()).toBe('2027-03-15T04:00:00.000Z')
  })
  it('round-trips with dayOf', () => {
    for (const d of ['2026-01-01', '2026-03-08', '2026-11-01', '2027-03-14', '2027-12-31']) {
      expect(dayOf(torontoMidnight(d))).toBe(d)
      expect(dayOf(new Date(torontoMidnight(d).getTime() - 1))).toBe(addDays(d, -1))
    }
  })
})

describe('splitByDay', () => {
  it('returns one segment inside a day', () => {
    const s = splitByDay('2026-10-24T14:00:00Z', '2026-10-24T15:30:00Z')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ day: '2026-10-24', minutes: 90 })
  })
  it('splits an interval crossing Toronto midnight', () => {
    // 23:30 → 00:45 local (EDT)
    const s = splitByDay('2026-10-25T03:30:00Z', '2026-10-25T04:45:00Z')
    expect(s.map((x) => [x.day, x.minutes])).toEqual([
      ['2026-10-24', 30],
      ['2026-10-25', 45],
    ])
    expect(s[0].end.toISOString()).toBe('2026-10-25T04:00:00.000Z')
    expect(s[1].start.toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })
  it('does not split at UTC midnight', () => {
    const s = splitByDay('2026-10-24T23:00:00Z', '2026-10-25T01:00:00Z') // 19:00–21:00 local
    expect(s).toHaveLength(1)
    expect(s[0].day).toBe('2026-10-24')
  })
  it('splits across several days and the pieces add up', () => {
    const start = '2026-10-23T20:00:00Z'
    const end = '2026-10-26T10:00:00Z'
    const s = splitByDay(start, end)
    expect(s.map((x) => x.day)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
    expect(s[1].minutes).toBe(24 * 60)
    expect(s.reduce((a, x) => a + x.minutes, 0)).toBe((Date.parse(end) - Date.parse(start)) / 60_000)
  })
  it('makes the fall-back day 25 hours long', () => {
    const s = splitByDay(torontoMidnight('2026-11-01'), torontoMidnight('2026-11-02'))
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ day: '2026-11-01', minutes: 25 * 60 })
  })
  it('splits a night across the fall-back change (22:00 → 08:00 is 11 h of real time)', () => {
    const s = splitByDay('2026-11-01T02:00:00Z', '2026-11-01T13:00:00Z') // 22:00 EDT Oct 31 → 08:00 EST Nov 1
    expect(s.map((x) => [x.day, x.minutes])).toEqual([
      ['2026-10-31', 120],
      ['2026-11-01', 540],
    ])
    expect(s[0].minutes + s[1].minutes).toBe(11 * 60)
  })
  it('makes the spring-forward day 23 hours long', () => {
    const s = splitByDay(torontoMidnight('2027-03-14'), torontoMidnight('2027-03-15'))
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ day: '2027-03-14', minutes: 23 * 60 })
  })
  it('splits a night across the spring-forward change (22:00 → 08:00 is 9 h of real time)', () => {
    const s = splitByDay('2027-03-14T03:00:00Z', '2027-03-14T12:00:00Z') // 22:00 EST Mar 13 → 08:00 EDT Mar 14
    expect(s.map((x) => [x.day, x.minutes])).toEqual([
      ['2027-03-13', 120],
      ['2027-03-14', 420],
    ])
  })
  it('returns [] for zero length and throws when reversed', () => {
    expect(splitByDay('2026-10-24T14:00:00Z', '2026-10-24T14:00:00Z')).toEqual([])
    expect(() => splitByDay('2026-10-24T15:00:00Z', '2026-10-24T14:00:00Z')).toThrow()
  })
  it('an interval ending exactly at midnight stays on its day', () => {
    const s = splitByDay('2026-10-25T03:00:00Z', '2026-10-25T04:00:00Z')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ day: '2026-10-24', minutes: 60 })
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(65)).toBe('1h 05m')
    expect(formatDuration(130)).toBe('2h 10m')
    expect(formatDuration(120)).toBe('2h 00m')
    expect(formatDuration(445)).toBe('7h 25m')
  })
  it('formats under an hour', () => {
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(5)).toBe('5m')
    expect(formatDuration(0)).toBe('0m')
  })
  it('rounds and clamps', () => {
    expect(formatDuration(59.6)).toBe('1h 00m')
    expect(formatDuration(0.4)).toBe('0m')
    expect(formatDuration(-5)).toBe('0m')
  })
})

describe('week helpers', () => {
  it('numbers weekdays from Monday', () => {
    expect(weekdayOf('2026-11-09')).toBe(0) // Monday
    expect(weekdayOf('2026-11-15')).toBe(6) // Sunday
    expect(weekdayOf('2026-10-24')).toBe(5) // Saturday
  })
  it('finds Monday–Sunday around a day, across month, year and DST changes', () => {
    expect(weekBounds('2026-10-24')).toEqual({ start: '2026-10-19', end: '2026-10-25' })
    expect(weekBounds('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' }) // fall-back Sunday
    expect(weekBounds('2027-03-14')).toEqual({ start: '2027-03-08', end: '2027-03-14' }) // spring-forward Sunday
    expect(weekBounds('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
})

describe('formatDay', () => {
  it('formats without shifting the date', () => {
    expect(formatDay('2026-11-09')).toBe('Mon 9 Nov')
    expect(formatDay('2027-03-14')).toBe('Sun 14 Mar')
    expect(formatDay('2026-01-01')).toBe('Thu 1 Jan')
  })
})

describe('week start and months', () => {
  it('weekdayIndex counts from Sunday', () => {
    expect(weekdayIndex('2026-11-08')).toBe(0)
    expect(weekdayIndex('2026-11-09')).toBe(1)
    expect(weekdayIndex('2026-11-14')).toBe(6)
  })
  it('weeks can start on any day', () => {
    expect(weekBounds('2026-11-11', 0)).toEqual({ start: '2026-11-08', end: '2026-11-14' }) // Sunday start
    expect(weekBounds('2026-11-08', 0)).toEqual({ start: '2026-11-08', end: '2026-11-14' })
    expect(weekBounds('2026-11-08', 1)).toEqual({ start: '2026-11-02', end: '2026-11-08' }) // Sunday belongs to the Monday week
    expect(weekBounds('2026-11-11', 6)).toEqual({ start: '2026-11-07', end: '2026-11-13' }) // Saturday start
    expect(weekBounds('2027-03-14', 0)).toEqual({ start: '2027-03-14', end: '2027-03-20' }) // starts on the spring-forward day
  })
  it('finds month bounds, including February and leap years', () => {
    expect(monthBounds('2026-11-15')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(monthBounds('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthBounds('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthBounds('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
  it('adds months across year ends', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-01')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(addMonths('2026-11-15', -11)).toBe('2025-12-01')
  })
  it('formats months and clock times (Toronto)', () => {
    expect(formatMonth('2026-11-15')).toBe('Nov 2026')
    expect(formatTime('2026-11-10T21:12:00Z')).toBe('4:12 pm') // EST
    expect(formatTime('2026-07-10T20:05:00Z')).toBe('4:05 pm') // EDT
    expect(formatTime('2026-11-10T05:00:00Z')).toBe('12:00 am')
  })
})

describe('Toronto wall-clock input', () => {
  it('reads and writes datetime-local values in Toronto, not the browser zone', () => {
    expect(torontoLocalToInstant('2026-11-10T16:12').toISOString()).toBe('2026-11-10T21:12:00.000Z') // EST
    expect(torontoLocalToInstant('2026-07-10T16:12').toISOString()).toBe('2026-07-10T20:12:00.000Z') // EDT
    expect(instantToTorontoLocal('2026-11-10T21:12:00Z')).toBe('2026-11-10T16:12')
    expect(instantToTorontoLocal('2026-11-10T04:59:00Z')).toBe('2026-11-09T23:59')
  })
  it('picks the first of a repeated time on the fall-back day', () => {
    expect(torontoLocalToInstant('2026-11-01T01:30').toISOString()).toBe('2026-11-01T05:30:00.000Z') // EDT, not the later EST 06:30Z
    expect(torontoLocalToInstant('2026-11-01T00:30').toISOString()).toBe('2026-11-01T04:30:00.000Z')
    expect(torontoLocalToInstant('2026-11-01T02:30').toISOString()).toBe('2026-11-01T07:30:00.000Z')
  })
  it('moves a skipped time forward past the spring-forward gap', () => {
    expect(torontoLocalToInstant('2027-03-14T02:30').toISOString()).toBe('2027-03-14T07:30:00.000Z') // 03:30 EDT
    expect(instantToTorontoLocal(torontoLocalToInstant('2027-03-14T02:30'))).toBe('2027-03-14T03:30')
    expect(torontoLocalToInstant('2027-03-14T01:59').toISOString()).toBe('2027-03-14T06:59:00.000Z')
    expect(torontoLocalToInstant('2027-03-14T03:00').toISOString()).toBe('2027-03-14T07:00:00.000Z')
  })
  it('round-trips ordinary times all year', () => {
    for (const t of ['2026-01-15T09:00', '2026-03-08T12:00', '2026-06-30T23:59', '2026-11-02T00:00', '2027-03-15T00:00']) {
      expect(instantToTorontoLocal(torontoLocalToInstant(t))).toBe(t)
    }
  })
  it('rejects malformed input', () => {
    expect(() => torontoLocalToInstant('2026-11-10')).toThrow()
    expect(() => torontoLocalToInstant('nope')).toThrow()
  })
})

describe('parseDuration', () => {
  it.each([['90', 90], ['45m', 45], ['45 min', 45], ['1h', 60], ['2 hours', 120], ['1h30', 90], ['1h 30m', 90], ['1.5h', 90], ['1:30', 90], ['0:45', 45], ['  2h  ', 120]])(
    '%s → %d min', (text, mins) => { expect(parseDuration(text)).toBe(mins) })
  it.each([[''], ['abc'], ['0'], ['0h'], ['-5'], ['1h x']])('rejects %j', (text) => { expect(parseDuration(text)).toBeNull() })
})
