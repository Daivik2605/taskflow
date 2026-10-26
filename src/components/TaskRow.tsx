import { useNavigate } from 'react-router-dom'
import { useToast } from '../app/toast'
import { Icon } from '../app/Icon'
import { useAreas } from '../data/areas'
import { useProjects } from '../data/projects'
import { useTasks } from '../data/tasks'
import { useTimer } from '../data/timer'
import { isOpen, subtaskProgress, taskChips, type Chip, type Task } from '../lib/tasks'
import { formatDuration, type Day } from '../lib/time'
import { TagLabel } from './TagLabel'
import { useTaskSheet } from './TaskSheet'
import { btn } from './ui'

const TONE: Record<Chip['tone'], string> = {
  neutral: '', info: 'font-semibold text-indigo-600 dark:text-indigo-400', amber: 'font-semibold text-amber-600 dark:text-amber-400',
  red: 'font-semibold text-red-600 dark:text-red-400', green: 'font-semibold text-emerald-600 dark:text-emerald-400',
}

interface Props {
  task: Task
  today: Day
  reorder?: { canUp: boolean; canDown: boolean; onMove: (dir: 'up' | 'down') => void }
  /** Missed tasks on Today: offer "Do today", "Reschedule" and "Drop" right on the row. */
  triage?: boolean
}

export function TaskRow({ task, today, reorder, triage }: Props) {
  const { areas } = useAreas()
  const projects = useProjects()
  const { tasks, setDone, update } = useTasks()
  const { openTask } = useTaskSheet()
  const { active, taskMinutes, requestStart } = useTimer()
  const toast = useToast()
  const navigate = useNavigate()

  const tag = areas.find((a) => a.id === task.area_id)
  const project = projects.find((p) => p.id === task.project_id)
  const parent = task.parent_id ? tasks.find((t) => t.id === task.parent_id) : null
  const progress = subtaskProgress(tasks, task.id)
  const closed = !isOpen(task)
  const chips = taskChips(task, today)
  const logged = taskMinutes.get(task.id) ?? 0
  const running = active?.task_id === task.id

  // The play button starts a timer on this task and its tag; a task with no tag opens the Timer to pick one.
  const play = async () => {
    if (!task.area_id) { navigate(`/timer?task=${task.id}`); return }
    if (await requestStart({ areaId: task.area_id, taskId: task.id })) toast.show(`Timer started: ${task.title}`)
  }

  return (
    <li className="px-2 py-1">
      <div className="flex items-start gap-1">
        <button
          role="checkbox"
          aria-checked={task.status === 'done'}
          aria-label={`${task.status === 'done' ? 'Mark not done' : 'Mark done'}: ${task.title}`}
          disabled={task.status === 'dropped'}
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
            {chips.map((c) => <span key={c.text} className={TONE[c.tone]}>{c.text}</span>)}
            {logged > 0 && <span className={task.estimate_minutes && logged > task.estimate_minutes ? TONE.amber : ''}>{formatDuration(logged)} logged{task.estimate_minutes ? ` of ${formatDuration(task.estimate_minutes)}` : ''}</span>}
            {tag && <TagLabel tag={tag} />}
            {project && <span>{project.name}</span>}
            {task.owner !== 'me' && <span>@{task.owner}</span>}
            {task.waiting_on && <span>waiting on {task.waiting_on}</span>}
            {task.priority === 1 && <span className="font-semibold">High</span>}
            {progress.total > 0 && <span>{progress.done}/{progress.total} sub-tasks</span>}
            {task.tags.filter((t) => !t.startsWith('agent:')).map((t) => <span key={t}>#{t}</span>)}
          </span>
        </button>

        {!closed && (
          <button type="button" onClick={() => void play()} disabled={running}
            aria-label={running ? `Timer running on: ${task.title}` : `Start timer: ${task.title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-indigo-600 disabled:opacity-40 dark:text-indigo-400"><Icon name="play" className="h-5 w-5" /></button>
        )}

        {reorder && (
          <div className="flex shrink-0 flex-col">
            <button aria-label={`Move up: ${task.title}`} disabled={!reorder.canUp} onClick={() => reorder.onMove('up')} className="flex h-6 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-4 w-4" /></button>
            <button aria-label={`Move down: ${task.title}`} disabled={!reorder.canDown} onClick={() => reorder.onMove('down')} className="flex h-6 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {triage && (
        <div className="flex flex-wrap gap-2 pb-1 pl-12">
          {!task.hard_deadline && <button className={`${btn} min-h-9 px-3`} onClick={() => void update(task.id, { due_on: today })}>Do today</button>}
          <button className={`${btn} min-h-9 px-3`} onClick={() => openTask(task.id)}>Reschedule</button>
          <button className={`${btn} min-h-9 px-3`} onClick={() => void update(task.id, { status: 'dropped' })}>Drop</button>
        </div>
      )}
    </li>
  )
}

export function TaskList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">{children}</ul>
}
