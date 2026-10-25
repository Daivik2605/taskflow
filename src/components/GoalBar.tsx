import type { Direction, Metric, Result, Status } from '../lib/goals'
import { valueText } from '../lib/goals'

const BAR: Record<Status, string> = {
  hit: 'bg-emerald-500', 'on-track': 'bg-indigo-500', 'at-limit': 'bg-amber-500', miss: 'bg-red-500', off: 'bg-slate-300',
}
const TEXT: Record<Status, string> = {
  hit: 'text-emerald-700 dark:text-emerald-400', 'on-track': 'text-slate-500', 'at-limit': 'text-amber-700 dark:text-amber-400', miss: 'text-red-700 dark:text-red-400', off: 'text-slate-500',
}

/** The word shown next to a bar, so the colour is never the only cue. An at-most goal that is "hit" so far is just "within limit". */
export function statusWord(direction: Direction, status: Status, finished = false): string {
  if (status === 'off') return 'Day off'
  if (direction === 'at_least') return status === 'hit' ? 'Hit' : status === 'miss' ? 'Missed' : 'In progress'
  if (status === 'miss') return finished ? 'Missed' : 'Over limit'
  if (status === 'at-limit') return 'At limit'
  return 'Within limit'
}

interface Props { title: string; metric: Metric; direction: Direction; result: Result; finished?: boolean; hint?: string }

/** One goal's progress for one period. A "≤" goal fills toward its limit; going past it fills red. */
export function GoalBar({ title, metric, direction, result, finished = false, hint }: Props) {
  const pct = Math.min(100, Math.round(result.fraction * 100))
  const word = statusWord(direction, result.status, finished)
  const text = valueText(metric, result.value, result.amount)
  return (
    <div role="group" aria-label={`${title}: ${text}, ${word}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{title}</span>
        <span className={`shrink-0 text-xs ${TEXT[result.status]}`}>{text} · {word}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
        <div className={`h-full rounded-full ${BAR[result.status]}`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
