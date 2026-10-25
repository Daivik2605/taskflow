import { useMemo, type ReactNode } from 'react'
import { CounterButtons } from '../components/CounterButtons'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList, TaskRow } from '../components/TaskRow'
import { card } from '../components/ui'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { useToday } from '../app/useToday'
import { counts, todaySections, type Task, type WindowKey } from '../lib/tasks'
import { formatDay } from '../lib/time'

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'all', label: 'All' },
]
const ROWS = [
  { key: 'done', label: 'Done', tone: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'missed', label: 'Missed', tone: 'text-red-600 dark:text-red-400' },
  { key: 'deadlinesMissed', label: 'Deadlines missed', tone: 'text-red-600 dark:text-red-400' },
  { key: 'left', label: 'Left', tone: '' },
] as const

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
  const { weekStartsOn } = useSettings()
  const { tasks, loading } = useTasks()
  const sections = useMemo(() => todaySections(tasks, today), [tasks, today])
  const stats = useMemo(() => WINDOWS.map((w) => ({ ...w, ...counts(tasks, today, w.key, weekStartsOn) })), [tasks, today, weekStartsOn])
  const row = (t: Task, triage = false) => <TaskRow key={t.id} task={t} today={today} triage={triage} />
  const nothingOpen = sections.missed.length + sections.deadlines.length + sections.today.length + sections.inWindow.length + sections.noDate.length === 0

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-slate-500">{formatDay(today)}</p>
      </header>

      <CounterButtons />

      <QuickAdd defaultDue={today} />

      <table className={`${card} w-full table-fixed text-center text-sm`} aria-label="Task counters">
        <thead>
          <tr className="text-xs font-medium text-slate-500">
            <th scope="col" className="w-[34%] p-2 text-left font-medium"><span className="sr-only">Counter</span></th>
            {WINDOWS.map((w) => <th key={w.key} scope="col" className="p-2 font-medium">{w.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {ROWS.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="p-2 text-left text-xs font-medium text-slate-500">{r.label}</th>
              {stats.map((s) => <td key={s.key} className={`p-2 font-semibold ${r.tone}`} aria-label={`${s.label} ${r.label.toLowerCase()}`}>{s[r.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

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
    </section>
  )
}
