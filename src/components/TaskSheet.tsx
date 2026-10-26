import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useToday } from '../app/useToday'
import { useProjects } from '../data/projects'
import { useSettings } from '../data/settings'
import { useTasks, type TaskPatch } from '../data/tasks'
import { childrenOf, parseTags, PRIORITY_LABEL, STATUS_LABEL, validateWhen, whenOf, whenPatch, type Task, type TaskStatus, type WhenValue } from '../lib/tasks'
import { formatDuration, parseDuration } from '../lib/time'
import { TagPicker } from './TagPicker'
import { WhenControl } from './WhenControl'
import { btn, btnDanger, btnPrimary, input, label, select } from './ui'

interface SheetApi { openTask: (id: string) => void }
const Ctx = createContext<SheetApi | null>(null)
export function useTaskSheet(): SheetApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTaskSheet outside TaskSheetProvider')
  return c
}

/** One native <dialog> for the whole app: bottom sheet on phone, centred on desktop. Escape and backdrop-tap close it. */
export function TaskSheetProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const { tasks } = useTasks()
  const task = taskId ? tasks.find((t) => t.id === taskId) ?? null : null

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (taskId && !d.open) d.showModal()
    if (!taskId && d.open) d.close()
  }, [taskId])
  // The task vanished (deleted here or on another device) while open.
  useEffect(() => { if (taskId && !task) setTaskId(null) }, [taskId, task])

  const api = useMemo<SheetApi>(() => ({ openTask: setTaskId }), [])
  const close = useCallback(() => setTaskId(null), [])

  return (
    <Ctx.Provider value={api}>
      {children}
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => { if (e.target === ref.current) close() }}
        aria-label="Task"
        className="m-0 mt-auto max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-slate-900 backdrop:bg-black/40 dark:bg-slate-900 dark:text-slate-100 lg:m-auto lg:max-w-xl lg:rounded-2xl"
      >
        {task && <TaskForm key={task.id} task={task} onClose={close} onOpen={setTaskId} />}
      </dialog>
    </Ctx.Provider>
  )
}

function TaskForm({ task, onClose, onOpen }: { task: Task; onClose: () => void; onOpen: (id: string) => void }) {
  const { tasks, update, remove, add, setDone } = useTasks()
  const projects = useProjects()
  const today = useToday()
  const { weekStartsOn } = useSettings()

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [when, setWhen] = useState<WhenValue>(() => whenOf(task))
  const [estimate, setEstimate] = useState(task.estimate_minutes ? formatDuration(task.estimate_minutes) : '')
  const [areaId, setAreaId] = useState<string | null>(task.area_id)
  const [projectId, setProjectId] = useState(task.project_id ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [owner, setOwner] = useState(task.owner)
  const [waitingOn, setWaitingOn] = useState(task.waiting_on ?? '')
  const [labels, setLabels] = useState(task.tags.join(', '))
  const [subTitle, setSubTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kids = childrenOf(tasks, task.id)
  const parent = task.parent_id ? tasks.find((t) => t.id === task.parent_id) : null
  const owners = useMemo(() => [...new Set(['me', 'Anikait', 'external', ...tasks.map((t) => t.owner)])], [tasks])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const whenProblem = validateWhen(when)
    if (whenProblem) { setError(whenProblem); return }
    const estimateMinutes = estimate.trim() ? parseDuration(estimate) : null
    if (estimate.trim() && estimateMinutes === null) { setError('Enter the estimate like 1h 30m, 45m or 90.'); return }

    const next = {
      title: title.trim(), description: description.trim() || null, ...whenPatch(when), estimate_minutes: estimateMinutes, area_id: areaId,
      project_id: projectId || null, priority, status, owner: owner.trim() || 'me', waiting_on: waitingOn.trim() || null, tags: parseTags(labels),
    }
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(next)) {
      const before = (task as unknown as Record<string, unknown>)[k]
      if (JSON.stringify(before) !== JSON.stringify(v)) patch[k] = v
    }
    setError(null)
    setSaving(true)
    const ok = Object.keys(patch).length === 0 ? true : await update(task.id, patch as TaskPatch)
    setSaving(false)
    if (ok) onClose()
  }

  const addSub = async (e: FormEvent) => {
    e.preventDefault()
    if (!subTitle.trim()) return
    const row = await add({ title: subTitle, parent_id: task.id, area_id: task.area_id, project_id: task.project_id })
    if (row) setSubTitle('')
  }

  return (
    <form onSubmit={save} className="space-y-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {parent && <button type="button" onClick={() => onOpen(parent.id)} className="mb-1 block text-sm text-indigo-600 dark:text-indigo-400">↳ Sub-task of {parent.title}</button>}
          <h2 className="text-lg font-semibold">Task</h2>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl" aria-label="Close">✕</button>
      </div>

      <label className={label}>Title
        <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className={label}>Description
        <textarea className={`${input} mt-1 py-2`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <WhenControl value={when} onChange={setWhen} today={today} weekStart={weekStartsOn} />

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Estimate <span className="font-normal text-slate-500">(optional)</span>
          <input className={`${input} mt-1`} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 1h 30m" inputMode="text" />
        </label>
        <label className={label}>Status
          <select className={`${select} mt-1`} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={label}><span className="mb-1 block">Tag</span><TagPicker value={areaId} onChange={setAreaId} allowNone tasksOnly /></div>
        <label className={label}>Project
          <select className={`${select} mt-1`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className={label}>Priority</legend>
        <div role="radiogroup" className="mt-1 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
              className={`min-h-11 rounded-lg border text-sm font-medium ${priority === p ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Owner
          <input className={`${input} mt-1`} list="task-owners" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <datalist id="task-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className={label}>Waiting on
          <input className={`${input} mt-1`} value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} placeholder="e.g. Anikait" />
        </label>
      </div>
      <label className={label}>Labels <span className="font-normal text-slate-500">(comma-separated, e.g. agent, urgent)</span>
        <input className={`${input} mt-1`} value={labels} onChange={(e) => setLabels(e.target.value)} />
      </label>

      {!task.parent_id && (
        <div>
          <h3 className={label}>Sub-tasks</h3>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {kids.map((k) => (
              <li key={k.id} className="flex items-center gap-1">
                <button type="button" role="checkbox" aria-checked={k.status === 'done'} aria-label={`${k.status === 'done' ? 'Mark not done' : 'Mark done'}: ${k.title}`}
                  onClick={() => void setDone(k.id, k.status !== 'done')} className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40">
                  <span className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs ${k.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-400'}`}>{k.status === 'done' ? '✓' : ''}</span>
                </button>
                <button type="button" onClick={() => onOpen(k.id)} className={`min-h-11 flex-1 text-left ${k.status === 'done' ? 'text-slate-500 line-through' : ''}`}>{k.title}</button>
                <button type="button" aria-label={`Delete sub-task: ${k.title}`} onClick={() => void remove(k.id)} className="min-h-11 min-w-11 text-slate-500 disabled:opacity-40">✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className={input} value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add a sub-task…" aria-label="New sub-task"
              onKeyDown={(e) => { if (e.key === 'Enter') void addSub(e) }} />
            <button type="button" className={btn} disabled={!subTitle.trim()} onClick={(e) => void addSub(e)}>Add</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button className={`${btnPrimary} flex-1`} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className={btn} onClick={onClose}>Cancel</button>
        {!confirmDelete
          ? <button type="button" className={btnDanger} onClick={() => setConfirmDelete(true)}>Delete</button>
          : (
            <span className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-2 text-sm dark:bg-red-950/40">
              <span className="flex-1">{kids.length > 0 ? 'Delete this task and its sub-tasks?' : 'Delete this task?'}</span>
              <button type="button" className={btnDanger} onClick={() => void remove(task.id).then((ok) => { if (ok) onClose() })}>Yes, delete</button>
              <button type="button" className={btn} onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          )}
      </div>
    </form>
  )
}
