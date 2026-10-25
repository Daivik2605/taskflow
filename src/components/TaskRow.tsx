import { useAreas } from '../data/areas'
import { useProjects } from '../data/projects'
import { useTasks } from '../data/tasks'
import { useConnection } from '../app/connection'
import { Icon } from '../app/Icon'
import { dueLabel, isDoneLate, isMissed, isOpen, subtaskProgress, type Task } from '../lib/tasks'
import type { Day } from '../lib/time'
import { useTaskSheet } from './TaskSheet'

interface Props {
  task: Task
  today: Day
  reorder?: { canUp: boolean; canDown: boolean; onMove: (dir: 'up' | 'down') => void }
}

export function TaskRow({ task, today, reorder }: Props) {
  const { areas } = useAreas()
  const projects = useProjects()
  const { tasks, setDone } = useTasks()
  const { writesDisabled } = useConnection()
  const { openTask } = useTaskSheet()

  const area = areas.find((a) => a.id === task.area_id)
  const project = projects.find((p) => p.id === task.project_id)
  const parent = task.parent_id ? tasks.find((t) => t.id === task.parent_id) : null
  const progress = subtaskProgress(tasks, task.id)
  const closed = !isOpen(task)
  const missed = isMissed(task, today)
  const due = dueLabel(task, today)

  return (
    <li className="flex items-start gap-1 px-2 py-1">
      <button
        role="checkbox"
        aria-checked={task.status === 'done'}
        aria-label={`${task.status === 'done' ? 'Mark not done' : 'Mark done'}: ${task.title}`}
        disabled={writesDisabled || task.status === 'dropped'}
        onClick={() => void setDone(task.id, task.status !== 'done')}
        className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${task.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-400 dark:border-slate-500'}`}>
          {task.status === 'done' && <Icon name="check" className="h-4 w-4" />}
        </span>
      </button>

      <button onClick={() => openTask(task.id)} className="min-h-11 min-w-0 flex-1 py-2 text-left">
        {parent && <span className="block truncate text-xs text-slate-500">↳ {parent.title}</span>}
        <span className={`block text-base ${closed ? 'text-slate-500 line-through' : ''}`}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {due && <span className={missed ? 'font-semibold text-red-600 dark:text-red-400' : task.due_on === today && !closed ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}>{due}</span>}
          {isDoneLate(task) && <span className="font-semibold text-amber-600 dark:text-amber-400">done late</span>}
          {area && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: area.color }} />{area.name}</span>}
          {project && <span>{project.name}</span>}
          {task.owner !== 'me' && <span>@{task.owner}</span>}
          {task.waiting_on && <span>waiting on {task.waiting_on}</span>}
          {task.priority === 1 && <span className="font-semibold">High</span>}
          {progress.total > 0 && <span>{progress.done}/{progress.total} sub-tasks</span>}
          {task.tags.filter((t) => !t.startsWith('agent:')).map((t) => <span key={t}>#{t}</span>)}
        </span>
      </button>

      {reorder && (
        <div className="flex shrink-0 flex-col">
          <button aria-label={`Move up: ${task.title}`} disabled={!reorder.canUp || writesDisabled} onClick={() => reorder.onMove('up')} className="flex h-6 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-4 w-4" /></button>
          <button aria-label={`Move down: ${task.title}`} disabled={!reorder.canDown || writesDisabled} onClick={() => reorder.onMove('down')} className="flex h-6 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-4 w-4" /></button>
        </div>
      )}
    </li>
  )
}

export function TaskList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">{children}</ul>
}
