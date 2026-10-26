import { useToday } from '../app/useToday'
import { useDays } from '../data/days'
import { useTasks } from '../data/tasks'
import { top3Progress } from '../lib/dayPlan'
import { TaskList, TaskRow } from './TaskRow'

/** Today's Top 3, pinned at the top of Today (inside the overview). Shows nothing until a plan picked some. */
export function Top3() {
  const today = useToday()
  const { get } = useDays()
  const { tasks } = useTasks()
  const { open, done, total } = top3Progress(get(today), tasks)
  if (total === 0) return null
  return (
    <section aria-label="Top 3" className="space-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top 3 <span className="font-normal">· {done.length} of {total} done</span></h2>
      {open.length > 0 ? <TaskList>{open.map((t) => <TaskRow key={t.id} task={t} today={today} />)}</TaskList>
        : <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">All three done.</p>}
    </section>
  )
}
