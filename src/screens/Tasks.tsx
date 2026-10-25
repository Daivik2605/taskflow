import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList, TaskRow } from '../components/TaskRow'
import { select } from '../components/ui'
import { useToday } from '../app/useToday'
import { useAreas } from '../data/areas'
import { useProjects } from '../data/projects'
import { useTasks } from '../data/tasks'
import { byAreaSort } from '../lib/areas'
import { DEFAULT_FILTER, filterTasks, groupTasks, reorderWithin, type DueFilter, type StatusFilter, type TaskFilter } from '../lib/tasks'
import { useConnection } from '../app/connection'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'dropped', label: 'Dropped' }, { value: 'all', label: 'All' },
]
const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'any', label: 'Any date' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' }, { value: 'later', label: 'Later' }, { value: 'none', label: 'No date' },
]

function readFilter(p: URLSearchParams): TaskFilter {
  const status = p.get('status') as StatusFilter | null
  const due = p.get('due') as DueFilter | null
  return {
    area: p.get('area') || undefined, project: p.get('project') || undefined, owner: p.get('owner') || undefined, tag: p.get('tag') || undefined,
    status: STATUS_OPTIONS.some((o) => o.value === status) ? status! : DEFAULT_FILTER.status,
    due: DUE_OPTIONS.some((o) => o.value === due) ? due! : DEFAULT_FILTER.due,
  }
}

export function Tasks() {
  const today = useToday()
  const { tasks, loading, reorder } = useTasks()
  const { areas } = useAreas()
  const projects = useProjects()
  const { writesDisabled } = useConnection()
  const [params, setParams] = useSearchParams()
  const filter = readFilter(params)

  const setFilter = (key: string, value: string, fallback = '') => {
    const next = new URLSearchParams(params)
    if (!value || value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // Sub-tasks only appear here when they carry their own due date; otherwise they live inside their parent.
  const visible = useMemo(() => filterTasks(tasks.filter((t) => t.parent_id === null || t.due_on !== null), filter, today), [tasks, filter, today])
  const groups = useMemo(() => groupTasks(visible, today), [visible, today])
  const owners = useMemo(() => [...new Set(tasks.map((t) => t.owner))].sort(), [tasks])
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks])
  const filtered = filter.area || filter.project || filter.owner || filter.tag || filter.status !== 'open' || filter.due !== 'any'

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <QuickAdd />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Filters">
        <select className={select} aria-label="Status" value={filter.status} onChange={(e) => setFilter('status', e.target.value, 'open')}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={select} aria-label="Due" value={filter.due} onChange={(e) => setFilter('due', e.target.value, 'any')}>
          {DUE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={select} aria-label="Area" value={filter.area ?? ''} onChange={(e) => setFilter('area', e.target.value)}>
          <option value="">All areas</option>
          {[...areas].sort(byAreaSort).map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (archived)' : ''}</option>)}
        </select>
        <select className={select} aria-label="Project" value={filter.project ?? ''} onChange={(e) => setFilter('project', e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={select} aria-label="Owner" value={filter.owner ?? ''} onChange={(e) => setFilter('owner', e.target.value)}>
          <option value="">Any owner</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className={select} aria-label="Tag" value={filter.tag ?? ''} onChange={(e) => setFilter('tag', e.target.value)}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      </div>
      {filtered && <button className="text-sm text-indigo-600 dark:text-indigo-400" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}

      {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p>
        : groups.length === 0 ? <p className="text-sm text-slate-500">{tasks.length === 0 ? 'No tasks yet — add your first one above.' : 'No tasks match these filters.'}</p>
        : groups.map((g) => (
          <div key={g.key}>
            <h2 className={`mb-1 text-sm font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{g.label} <span className="font-normal">· {g.tasks.length}</span></h2>
            <TaskList>
              {g.tasks.map((t, i) => (
                <TaskRow key={t.id} task={t} today={today}
                  reorder={g.key === 'closed' ? undefined : { canUp: i > 0, canDown: i < g.tasks.length - 1, onMove: (dir) => void reorder(reorderWithin(g.tasks, t.id, dir)) }} />
              ))}
            </TaskList>
          </div>
        ))}
      {writesDisabled && <p className="text-xs text-slate-500">Changes are turned off while offline.</p>}
    </section>
  )
}
