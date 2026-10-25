import { useMemo, type ReactNode } from 'react'
import { ActivityButtons } from '../components/ActivityButtons'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList, TaskRow } from '../components/TaskRow'
import { OverviewStrip } from '../components/OverviewStrip'
import { useTasks } from '../data/tasks'
import { useToday } from '../app/useToday'
import { todaySections, type Task } from '../lib/tasks'
import { formatDay } from '../lib/time'

function Section({ title, tone, hint, tasks, children }: { title: string; tone?: 'red'; hint?: string; tasks: Task[]; children: (t: Task) => ReactNode }) {
  if (tasks.length === 0) return null
  return (
    <div>
      <h2 className={`mb-1 text-sm font-semibold uppercase tracking-wide ${tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
        {title} <span className="font-normal">· {tasks.length}</span>{hint && <> <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">{hint}</span></>}
      </h2>
      <TaskList>{tasks.map(children)}</TaskList>
    </div>
  )
}

export function Today() {
  const today = useToday()
  const { tasks, loading } = useTasks()
  const sections = useMemo(() => todaySections(tasks, today), [tasks, today])
  const row = (t: Task, triage = false) => <TaskRow key={t.id} task={t} today={today} triage={triage} />
  const nothingOpen = sections.missed.length + sections.deadlines.length + sections.today.length + sections.inWindow.length + sections.noDate.length === 0

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-slate-500">{formatDay(today)}</p>
      </header>

      <OverviewStrip />

      <div className="mx-auto max-w-2xl space-y-5">
        <ActivityButtons />

        <QuickAdd defaultDue={today} />

        {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p> : (
          <>
            <Section title="Missed" tone="red" hint="reschedule or drop" tasks={sections.missed}>{(t) => row(t, true)}</Section>
            <Section title="Deadlines in the next 14 days" tasks={sections.deadlines}>{(t) => row(t)}</Section>
            <Section title="Today" tasks={sections.today}>{(t) => row(t)}</Section>
            <Section title="In a window" tasks={sections.inWindow}>{(t) => row(t)}</Section>
            <Section title="No date" tasks={sections.noDate}>{(t) => row(t)}</Section>
            {nothingOpen && <p className="text-sm text-slate-500">{tasks.length === 0 ? 'No tasks yet — add your first one above.' : 'Nothing missed, due, in a window or undated. Clear.'}</p>}
            <Section title="Done today" tasks={sections.doneToday}>{(t) => row(t)}</Section>
          </>
        )}
      </div>
    </section>
  )
}
