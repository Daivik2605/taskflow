// Insights ranges (SPEC §14): a day, a week, a month or a custom span — all Toronto calendar days, inclusive.

import { addDays, addMonths, diffDays, formatDay, formatMonth, monthBounds, weekBounds, type Day } from './time'

export type RangeKind = 'day' | 'week' | 'month' | 'custom'
export interface Range { kind: RangeKind; from: Day; to: Day; label: string }

export function resolveRange(kind: RangeKind, anchor: Day, weekStart = 1, custom?: { from: Day; to: Day }): Range {
  switch (kind) {
    case 'day': return { kind, from: anchor, to: anchor, label: formatDay(anchor) }
    case 'week': { const w = weekBounds(anchor, weekStart); return { kind, from: w.start, to: w.end, label: `${formatDay(w.start)} – ${formatDay(w.end)}` } }
    case 'month': { const m = monthBounds(anchor); return { kind, from: m.start, to: m.end, label: formatMonth(anchor) } }
    case 'custom': {
      const a = custom?.from ?? anchor
      const b = custom?.to ?? anchor
      const [from, to] = a <= b ? [a, b] : [b, a] // a reversed pair is swapped, never an error
      return { kind, from, to, label: from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}` }
    }
  }
}

/** The anchor day one step back or forward (a month steps to the 1st of the neighbouring month). Custom ranges don't step. */
export function stepAnchor(kind: RangeKind, anchor: Day, dir: 1 | -1): Day {
  switch (kind) {
    case 'day': return addDays(anchor, dir)
    case 'week': return addDays(anchor, 7 * dir)
    case 'month': return addMonths(anchor, dir)
    case 'custom': return anchor
  }
}

/** True when the range already includes today or lies in the future, so "next" would go past the end of the data. */
export const reachesToday = (r: Range, today: Day) => r.to >= today

/** Whole days covered, inclusive. */
export const daysIn = (r: Range) => diffDays(r.from, r.to) + 1
