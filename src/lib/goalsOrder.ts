import type { Goal } from './goals'

/** New sort values after moving a goal up or down in the live list; empty when it can't move. */
export function reorderGoals(live: Goal[], seriesId: string, dir: 'up' | 'down'): { series_id: string; sort: number }[] {
  const i = live.findIndex((g) => g.series_id === seriesId)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= live.length) return []
  const order = live.map((g) => g.series_id)
  ;[order[i], order[j]] = [order[j], order[i]]
  return order.map((series_id, sort) => ({ series_id, sort }))
}
