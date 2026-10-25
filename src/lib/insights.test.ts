import { describe, expect, it } from 'vitest'
import { daysIn, reachesToday, resolveRange, stepAnchor } from './insights'

describe('resolveRange', () => {
  it('a day', () => { expect(resolveRange('day', '2026-11-10')).toEqual({ kind: 'day', from: '2026-11-10', to: '2026-11-10', label: 'Tue 10 Nov' }) })
  it('a week follows the week start', () => {
    expect(resolveRange('week', '2026-11-10', 1)).toMatchObject({ from: '2026-11-09', to: '2026-11-15', label: 'Mon 9 Nov – Sun 15 Nov' })
    expect(resolveRange('week', '2026-11-10', 0)).toMatchObject({ from: '2026-11-08', to: '2026-11-14' })
  })
  it('a week can cross the DST change and the year end', () => {
    expect(resolveRange('week', '2026-11-01', 1)).toMatchObject({ from: '2026-10-26', to: '2026-11-01' })
    expect(resolveRange('week', '2027-01-01', 1)).toMatchObject({ from: '2026-12-28', to: '2027-01-03' })
  })
  it('a month', () => {
    expect(resolveRange('month', '2026-11-10')).toMatchObject({ from: '2026-11-01', to: '2026-11-30', label: 'Nov 2026' })
    expect(resolveRange('month', '2028-02-29')).toMatchObject({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('a custom span; a reversed pair is swapped', () => {
    expect(resolveRange('custom', '2026-11-10', 1, { from: '2026-11-01', to: '2026-11-07' })).toMatchObject({ from: '2026-11-01', to: '2026-11-07' })
    expect(resolveRange('custom', '2026-11-10', 1, { from: '2026-11-07', to: '2026-11-01' })).toMatchObject({ from: '2026-11-01', to: '2026-11-07' })
    expect(resolveRange('custom', '2026-11-10', 1, { from: '2026-11-03', to: '2026-11-03' }).label).toBe('Tue 3 Nov')
  })
  it('counts days inclusive, so a month on a DST change is still its calendar length', () => {
    expect(daysIn(resolveRange('week', '2026-11-10'))).toBe(7)
    expect(daysIn(resolveRange('month', '2026-11-10'))).toBe(30)
    expect(daysIn(resolveRange('month', '2026-03-10'))).toBe(31)
    expect(daysIn(resolveRange('day', '2026-11-01'))).toBe(1)
  })
})

describe('stepAnchor', () => {
  it('steps by the range size', () => {
    expect(stepAnchor('day', '2026-11-01', 1)).toBe('2026-11-02')
    expect(stepAnchor('day', '2026-11-01', -1)).toBe('2026-10-31')
    expect(stepAnchor('week', '2026-11-10', -1)).toBe('2026-11-03')
    expect(stepAnchor('month', '2026-11-10', 1)).toBe('2026-12-01')
    expect(stepAnchor('month', '2026-01-31', -1)).toBe('2025-12-01')
    expect(stepAnchor('custom', '2026-11-10', 1)).toBe('2026-11-10')
  })
  it('knows when "next" would run past today', () => {
    expect(reachesToday(resolveRange('week', '2026-11-10'), '2026-11-10')).toBe(true)
    expect(reachesToday(resolveRange('week', '2026-11-03'), '2026-11-10')).toBe(false)
    expect(reachesToday(resolveRange('day', '2026-11-09'), '2026-11-10')).toBe(false)
  })
})
