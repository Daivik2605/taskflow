import { useMemo } from 'react'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList, TaskRow } from '../components/TaskRow'
import { card } from '../components/ui'
import { useToday } from '../app/useToday'
import { useTasks } from '../data/tasks'
import { counts, todaySections, type WindowKey } from '../lib/tasks'
import { formatDay } from '../lib/time'

const WINDOWS: { key: WindowKey; label: string }[] = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'all', label: 'All time' }]

function Section({ title, tone, children, count }: { title: string; tone?: 'red'; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div>
      <h2 className={`mb-1 text-sm font-semibold uppercase tracking-wide ${tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{title} <span className="font-normal">· {count}</span></h2>
      <TaskList>{children}</TaskList>
    </div>
  )
}

export function Today() {
  const today = useToday()
  const { tasks, loading } = useTasks()
  const sections = useMemo(() => todaySections(tasks, today), [tasks, today])
  const stats = useMemo(() => WINDOWS.map((w) => ({ ...w, ...counts(tasks, today, w.key) })), [tasks, today])
  const nothingOpen = sections.overdue.length + sections.dueToday.length + sections.noDate.length === 0

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-slate-500">{formatDay(today)}</p>
      </header>

      <QuickAdd defaultDue={today} />

      <div className={`${card} grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800`} role="group" aria-label="Counters">
        {stats.map((s) => (
          <div key={s.key} className="p-3 text-center">
            <div className="text-xs font-medium text-slate-500">{s.label}</div>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between gap-1"><dt className="text-slate-500">Done</dt><dd className="font-semibold text-emerald-600 dark:text-emerald-400" aria-label={`${s.label} done`}>{s.done}</dd></div>
              <div className="flex justify-between gap-1"><dt className="text-slate-500">Missed</dt><dd className="font-semibold text-red-600 dark:text-red-400" aria-label={`${s.label} missed`}>{s.missed}</dd></div>
              <div className="flex justify-between gap-1"><dt className="text-slate-500">Left</dt><dd className="font-semibold" aria-label={`${s.label} left`}>{s.left}</dd></div>
            </dl>
          </div>
        ))}
      </div>

      {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p> : (
        <>
          <Section title="Overdue" tone="red" count={sections.overdue.length}>{sections.overdue.map((t) => <TaskRow key={t.id} task={t} today={today} />)}</Section>
          <Section title="Due today" count={sections.dueToday.length}>{sections.dueToday.map((t) => <TaskRow key={t.id} task={t} today={today} />)}</Section>
          <Section title="No date" count={sections.noDate.length}>{sections.noDate.map((t) => <TaskRow key={t.id} task={t} today={today} />)}</Section>
          {nothingOpen && <p className="text-sm text-slate-500">{tasks.length === 0 ? 'No tasks yet — add your first one above.' : 'Nothing overdue, due today or undated. Clear.'}</p>}
          <Section title="Done today" count={sections.doneToday.length}>{sections.doneToday.map((t) => <TaskRow key={t.id} task={t} today={today} />)}</Section>
        </>
      )}
    </section>
  )
}
