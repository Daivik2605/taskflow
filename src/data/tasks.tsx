import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { applyChange, applyStatus, buildNewTask, nextSort, type NewTaskInput, type Task, type TaskStatus } from '../lib/tasks'
import { db, errorMessage, fetchAll, friendlyDbError } from './db'

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
  const toast = useToast()
  const [tasks, setTasksState] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<Task[]>([])
  const setTasks = useCallback((fn: (prev: Task[]) => Task[]) => {
    ref.current = fn(ref.current)
    setTasksState(ref.current)
  }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  // Load, then keep in sync with other windows/devices.
  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const { data, error } = await fetchAll<Task>('taskflow_tasks', COLUMNS, 'sort')
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
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
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void client.removeChannel(channel)
    }
  }, [setTasks, reportError])

  /** Runs an optimistic write: apply locally, send, and on failure roll back and offer Retry. */
  const write = useCallback(async (label: string, optimistic: () => () => void, send: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> => {
    if (writesOff.current) { toast.show("You're offline or Supabase is unreachable — changes are turned off."); return false }
    const rollback = optimistic()
    const { error } = await send()
    if (!error) return true
    rollback()
    toast.show(`${label} failed: ${friendlyDbError(error)}`, () => void write(label, optimistic, send))
    return false
  }, [toast])

  const add = useCallback<TasksApi['add']>(async (input) => {
    const row = buildNewTask(input, nextSort(ref.current), new Date(), crypto.randomUUID())
    if (!row) return null
    const { id, title, description, area_id, project_id, parent_id, start_on, due_on, hard_deadline, estimate_minutes, priority, status, owner, waiting_on, tags, completed_at, sort } = row
    const ok = await write('Adding the task',
      () => { setTasks((l) => [...l, row]); return () => setTasks((l) => l.filter((t) => t.id !== id)) },
      () => db().from('taskflow_tasks').insert({ id, title, description, area_id, project_id, parent_id, start_on, due_on, hard_deadline, estimate_minutes, priority, status, owner, waiting_on, tags, completed_at, sort }))
    return ok ? row : null
  }, [write, setTasks])

  const update = useCallback<TasksApi['update']>(async (id, patch) => {
    const prev = ref.current.find((t) => t.id === id)
    if (!prev) return false
    const body: Record<string, unknown> = { ...patch }
    if (patch.status !== undefined) Object.assign(body, applyStatus(prev, patch.status, new Date()))
    return write('Saving the task',
      () => { setTasks((l) => l.map((t) => (t.id === id ? { ...t, ...(body as Partial<Task>) } : t))); return () => setTasks((l) => l.map((t) => (t.id === id ? prev : t))) },
      () => db().from('taskflow_tasks').update(body).eq('id', id))
  }, [write, setTasks])

  const setDone = useCallback<TasksApi['setDone']>((id, done) => update(id, { status: done ? 'done' : 'todo' }), [update])

  const remove = useCallback<TasksApi['remove']>(async (id) => {
    const removed = ref.current.filter((t) => t.id === id || t.parent_id === id)
    if (removed.length === 0) return false
    return write('Deleting the task',
      () => { setTasks((l) => l.filter((t) => t.id !== id && t.parent_id !== id)); return () => setTasks((l) => [...l, ...removed]) },
      () => db().from('taskflow_tasks').delete().eq('id', id))
  }, [write, setTasks])

  const reorder = useCallback<TasksApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    const prevSorts = new Map(ref.current.map((t) => [t.id, t.sort]))
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    return write('Reordering',
      () => { setTasks((l) => l.map((t) => (next.has(t.id) ? { ...t, sort: next.get(t.id)! } : t))); return () => setTasks((l) => l.map((t) => (next.has(t.id) ? { ...t, sort: prevSorts.get(t.id)! } : t))) },
      async () => {
        const results = await Promise.all(changes.map((c) => db().from('taskflow_tasks').update({ sort: c.sort }).eq('id', c.id)))
        const failed = results.find((r) => r.error)
        return { error: failed?.error ? { message: errorMessage(failed.error) } : null }
      })
  }, [write, setTasks])

  const api = useMemo<TasksApi>(() => ({ tasks, loading, add, update, setDone, remove, reorder }), [tasks, loading, add, update, setDone, remove, reorder])

  return <TasksContext.Provider value={api}>{children}</TasksContext.Provider>
}
