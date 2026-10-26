import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { applyChange, applyStatus, buildNewTask, nextSort, type NewTaskInput, type Task, type TaskStatus } from '../lib/tasks'
import { RESYNC_EVENT, useOutbox } from './outbox'
import { useOfflineCache } from './useOfflineCache'
import { db, fetchAll, friendlyDbError } from './db'

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'area_id' | 'project_id' | 'start_on' | 'due_on' | 'hard_deadline' | 'estimate_minutes' | 'priority' | 'owner' | 'waiting_on' | 'tags' | 'sort'>> & { status?: TaskStatus }

export interface TasksApi {
  tasks: Task[]
  loading: boolean
  add: (input: NewTaskInput) => Promise<Task | null>
  update: (id: string, patch: TaskPatch) => Promise<boolean>
  setDone: (id: string, done: boolean) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  reorder: (changes: { id: string; sort: number }[]) => Promise<boolean>
}

export const TasksContext = createContext<TasksApi | null>(null)

export function useTasks(): TasksApi {
  const c = useContext(TasksContext)
  if (!c) throw new Error('useTasks outside TasksProvider')
  return c
}

const COLUMNS = 'id,title,description,area_id,project_id,parent_id,start_on,due_on,hard_deadline,estimate_minutes,priority,status,owner,waiting_on,tags,completed_at,sort,from_note_id,created_at,updated_at'

export function TasksProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const [tasks, setTasksState] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<Task[]>([])
  const setTasks = useCallback((fn: (prev: Task[]) => Task[]) => {
    ref.current = fn(ref.current)
    setTasksState(ref.current)
  }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled
  const outbox = useOutbox()
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox
  const loadedRef = useRef(false)

  useOfflineCache('tasks', tasks, !loading, (saved) => { ref.current = saved; setTasksState(saved); setLoading(false) }, () => loadedRef.current)

  // Load, then keep in sync with other windows/devices.
  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const { data, error } = await fetchAll<Task>('taskflow_tasks', COLUMNS, 'sort')
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
      if (outboxRef.current.hasPending()) return // writes are waiting to be sent; a reload follows the sync
      loadedRef.current = true
      ref.current = data
      setTasksState(ref.current)
      setLoading(false)
    }
    void load()

    let subscribedBefore = false
    const channel = client
      .channel('taskflow-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_tasks' }, (p) => {
        if (p.eventType === 'DELETE') setTasks((l) => applyChange(l, { type: 'DELETE', id: (p.old as { id?: string }).id }))
        else setTasks((l) => applyChange(l, { type: p.eventType, row: p.new as Task }))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedBefore) void load() // reconnected: catch up on anything missed
          subscribedBefore = true
        }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    const onResync = () => void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(RESYNC_EVENT, onResync)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(RESYNC_EVENT, onResync)
      void client.removeChannel(channel)
    }
  }, [setTasks, reportError])

  // Task writes go through the offline queue: the screen changes at once and the write is sent when the network allows.
  const add = useCallback<TasksApi['add']>(async (input) => {
    const row = buildNewTask(input, nextSort(ref.current), new Date(), crypto.randomUUID())
    if (!row) return null
    setTasks((l) => [...l, row])
    const { id, title, description, area_id, project_id, parent_id, start_on, due_on, hard_deadline, estimate_minutes, priority, status, owner, waiting_on, tags, completed_at, sort } = row
    outboxRef.current.enqueue({ kind: 'task.put', row: { id, title, description, area_id, project_id, parent_id, start_on, due_on, hard_deadline, estimate_minutes, priority, status, owner, waiting_on, tags, completed_at, sort } })
    return row
  }, [setTasks])

  const update = useCallback<TasksApi['update']>(async (id, patch) => {
    const prev = ref.current.find((t) => t.id === id)
    if (!prev) return false
    const body: Record<string, unknown> = { ...patch }
    if (patch.status !== undefined) Object.assign(body, applyStatus(prev, patch.status, new Date()))
    setTasks((l) => l.map((t) => (t.id === id ? { ...t, ...(body as Partial<Task>) } : t)))
    outboxRef.current.enqueue({ kind: 'task.patch', id, patch: body })
    return true
  }, [setTasks])

  const setDone = useCallback<TasksApi['setDone']>((id, done) => update(id, { status: done ? 'done' : 'todo' }), [update])

  const remove = useCallback<TasksApi['remove']>(async (id) => {
    if (!ref.current.some((t) => t.id === id || t.parent_id === id)) return false
    setTasks((l) => l.filter((t) => t.id !== id && t.parent_id !== id))
    outboxRef.current.enqueue({ kind: 'task.remove', id })
    return true
  }, [setTasks])

  const reorder = useCallback<TasksApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    setTasks((l) => l.map((t) => (next.has(t.id) ? { ...t, sort: next.get(t.id)! } : t)))
    for (const c of changes) outboxRef.current.enqueue({ kind: 'task.patch', id: c.id, patch: { sort: c.sort } })
    return true
  }, [setTasks])

  const api = useMemo<TasksApi>(() => ({ tasks, loading, add, update, setDone, remove, reorder }), [tasks, loading, add, update, setDone, remove, reorder])

  return <TasksContext.Provider value={api}>{children}</TasksContext.Provider>
}
