import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList, TaskRow } from '../components/TaskRow'
import { select } from '../components/ui'
import { useAreas } from '../data/areas'
import { useProjects } from '../data/projects'
import { useTasks } from '../data/tasks'
import { buildTree, tagIdsFor, tagLabel } from '../lib/tags'
import { filterTasks, groupForView, inView, quickAddDefaults, reorderWithin, viewShowing, VIEWS, type Task, type TaskFilter, type ViewKey } from '../lib/tasks'

const isView = (v: string | null): v is ViewKey => VIEWS.some((x) => x.key === v)

const EMPTY: Record<ViewKey, string> = {
  today: 'Nothing for today. Add a task above, or look under Upcoming.',
  upcoming: 'Nothing scheduled to start later.',
  deadlines: 'No open deadlines. Set one from a task: When → Deadline.',
  anytime: 'No undated tasks.',
  done: 'Nothing finished yet.',
  dropped: 'Nothing dropped. Dropped tasks stay here so you can restore them.',
}

export function Tasks() {
  const today = useToday()
  const { tasks, loading, reorder } = useTasks()
  const { areas } = useAreas()
  const projects = useProjects()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const view: ViewKey = isView(params.get('view')) ? (params.get('view') as ViewKey) : 'today'
  const tag = params.get('tag') || ''
  const project = params.get('project') || ''
  const owner = params.get('owner') || ''
  const label = params.get('label') || ''

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || (key === 'view' && value === 'today')) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const filter: TaskFilter = { areaIds: tag ? tagIdsFor(areas, tag) : undefined, project: project || undefined, owner: owner || undefined, label: label || undefined }
  // Sub-tasks only appear here when they carry their own date; otherwise they live inside their parent.
  const base = useMemo(() => filterTasks(tasks.filter((t) => t.parent_id === null || t.due_on !== null), filter), // eslint-disable-line react-hooks/exhaustive-deps
    [tasks, tag, project, owner, label, areas])
  const groups = useMemo(() => groupForView(base, view, today), [base, view, today])
  const owners = useMemo(() => [...new Set(tasks.map((t) => t.owner))].sort(), [tasks])
  const labels = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks])
  const tree = useMemo(() => buildTree(areas), [areas])
  const filtered = tag || project || owner || label
  const defaults = quickAddDefaults(view, today)

  // After an add: if the new task isn't in the current view (or is hidden by a filter), say where it went and offer to go there.
  const onAdded = (t: Task) => {
    if (inView(t, view, today) && filterTasks([t], filter).length > 0) return
    const target = viewShowing(t, today)
    if (!target) return
    const name = VIEWS.find((v) => v.key === target)!.label
    toast.show(`Added to ${name}`, () => { const n = new URLSearchParams(); if (target !== 'today') n.set('view', target); setParams(n, { replace: true }) }, { actionLabel: `Show ${name}`, timeoutMs: 8000 })
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <QuickAdd key={view} defaultDue={defaults.day} deadline={defaults.deadline} onAdded={onAdded} />

      <div role="tablist" aria-label="Views" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {VIEWS.map((v) => (
          <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => set('view', v.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${view === v.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filters">
        <select className={select} aria-label="Tag" value={tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">All tags</option>
          {tree.map((n) => (
            <optgroup key={n.tag.id} label={tagLabel(n.tag)}>
              <option value={n.tag.id}>{n.children.length ? `All of ${n.tag.name}` : n.tag.name}</option>
              {n.children.map((c) => <option key={c.id} value={c.id}>{tagLabel(c)}</option>)}
            </optgroup>
          ))}
        </select>
        <select className={select} aria-label="Project" value={project} onChange={(e) => set('project', e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={select} aria-label="Owner" value={owner} onChange={(e) => set('owner', e.target.value)}>
          <option value="">Any owner</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className={select} aria-label="Label" value={label} onChange={(e) => set('label', e.target.value)}>
          <option value="">Any label</option>
          {labels.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      </div>
      {filtered && <button className="text-sm text-indigo-600 dark:text-indigo-400" onClick={() => { const n = new URLSearchParams(); if (view !== 'today') n.set('view', view); setParams(n, { replace: true }) }}>Clear filters</button>}

      {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p>
        : groups.length === 0 ? <p className="text-sm text-slate-500">{filtered ? 'No tasks match these filters.' : tasks.length === 0 ? 'No tasks yet — add your first one above.' : EMPTY[view]}</p>
        : groups.map((g) => (
          <div key={g.key}>
            <h2 className={`mb-1 text-sm font-semibold uppercase tracking-wide ${g.key === 'missed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{g.label} <span className="font-normal">· {g.tasks.length}</span></h2>
            <TaskList>
              {g.tasks.map((t, i) => (
                <TaskRow key={t.id} task={t} today={today} triage={view === 'today' && g.key === 'missed'}
                  reorder={g.reorderable ? { canUp: i > 0, canDown: i < g.tasks.length - 1, onMove: (dir) => void reorder(reorderWithin(g.tasks, t.id, dir)) } : undefined} />
              ))}
            </TaskList>
          </div>
        ))}
    </section>
  )
}
