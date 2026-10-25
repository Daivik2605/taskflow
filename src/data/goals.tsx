import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { nextGoalSort, planEdit, planPause, validateGoal, liveGoals, type Goal, type GoalInput } from '../lib/goals'
import type { Day } from '../lib/time'
import { db, fetchAll, friendlyDbError } from './db'

export interface GoalsApi {
  goals: Goal[] // every version of every goal
  daysOff: ReadonlySet<Day> // read-only until the calendar (phase 8) lets you set them
  loading: boolean
  /** Each resolves to a message to show next to the form, or null on success. */
  add: (input: GoalInput) => Promise<string | null>
  /** A change to the target ends the current version yesterday and starts a new one today; a rename edits in place. */
  edit: (goalId: string, input: GoalInput) => Promise<string | null>
  setPaused: (goalId: string, paused: boolean) => Promise<string | null>
  /** Deletes the goal and every version of it, so its history goes too. */
  remove: (seriesId: string) => Promise<boolean>
  reorder: (changes: { series_id: string; sort: number }[]) => Promise<boolean>
}

const empty: GoalsApi = {
  goals: [], daysOff: new Set(), loading: false,
  add: async () => null, edit: async () => null, setPaused: async () => null, remove: async () => false, reorder: async () => false,
}
export const GoalsContext = createContext<GoalsApi>(empty)
export const useGoals = () => useContext(GoalsContext)

const GOAL_COLUMNS = 'id,series_id,name,metric,target_id,direction,amount,period,starts_on,ends_on,paused,sort'

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const today = useToday()
  const [goals, setGoalsState] = useState<Goal[]>([])
  const [daysOff, setDaysOff] = useState<ReadonlySet<Day>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const gRef = useRef<Goal[]>([])
  const setGoals = useCallback((fn: (p: Goal[]) => Goal[]) => { gRef.current = fn(gRef.current); setGoalsState(gRef.current) }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled
  const todayRef = useRef(today)
  todayRef.current = today

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const [g, d] = await Promise.all([
        fetchAll<Goal>('taskflow_goals', GOAL_COLUMNS, 'starts_on'),
        client.from('taskflow_days_off').select('day'),
      ])
      if (cancelled) return
      if (g.error) { reportError(friendlyDbError(g.error)); return }
      setGoals(() => g.data)
      if (!d.error) setDaysOff(new Set(((d.data ?? []) as { day: Day }[]).map((r) => r.day)))
      setLoading(false)
    }
    void load()

    let subscribedBefore = false
    const channel = client
      .channel('taskflow-goals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_goals' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_days_off' }, () => { void load() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedBefore) void load()
          subscribedBefore = true
        }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void client.removeChannel(channel) }
  }, [setGoals, reportError])

  const offline = useCallback(() => toast.show("You're offline or Supabase is unreachable — changes are turned off."), [toast])

  const add = useCallback<GoalsApi['add']>(async (input) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const problem = validateGoal(input, liveGoals(gRef.current))
    if (problem) return problem
    const row = { ...input, name: input.name.trim(), starts_on: todayRef.current, sort: nextGoalSort(gRef.current) }
    const { data, error } = await db().from('taskflow_goals').insert(row).select(GOAL_COLUMNS).single()
    if (error) return friendlyDbError(error)
    setGoals((l) => [...l, data as Goal])
    return null
  }, [offline, setGoals])

  /** Applies a plan from goals.ts: an in-place update, or close-the-old-version-and-insert-the-new. */
  const apply = useCallback(async (current: Goal, plan: ReturnType<typeof planEdit> | ReturnType<typeof planPause>): Promise<string | null> => {
    const before = gRef.current
    if (plan.kind === 'version') {
      setGoals((l) => [...l.map((g) => (g.id === plan.close.id ? { ...g, ends_on: plan.close.ends_on } : g)), plan.next])
      const closed = await db().from('taskflow_goals').update({ ends_on: plan.close.ends_on }).eq('id', plan.close.id)
      if (closed.error) { setGoals(() => before); return friendlyDbError(closed.error) }
      const { id, ...rest } = plan.next
      const ins = await db().from('taskflow_goals').insert({ id, ...rest })
      if (ins.error) {
        // Put the old version back in force so the goal never disappears.
        await db().from('taskflow_goals').update({ ends_on: null }).eq('id', plan.close.id)
        setGoals(() => before)
        return friendlyDbError(ins.error)
      }
      return null
    }
    const patch = plan.patch as Partial<Goal>
    if (Object.keys(patch).length === 0) return null
    setGoals((l) => l.map((g) => (g.id === current.id ? { ...g, ...patch } : g)))
    const { error } = await db().from('taskflow_goals').update(patch).eq('id', current.id)
    if (error) { setGoals(() => before); return friendlyDbError(error) }
    return null
  }, [setGoals])

  const edit = useCallback<GoalsApi['edit']>(async (goalId, input) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const current = gRef.current.find((g) => g.id === goalId)
    if (!current) return 'That goal no longer exists.'
    const problem = validateGoal(input, liveGoals(gRef.current), current.series_id)
    if (problem) return problem
    return apply(current, planEdit(current, input, todayRef.current, crypto.randomUUID()))
  }, [apply, offline])

  const setPaused = useCallback<GoalsApi['setPaused']>(async (goalId, paused) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const current = gRef.current.find((g) => g.id === goalId)
    if (!current) return 'That goal no longer exists.'
    return apply(current, planPause(current, paused, todayRef.current, crypto.randomUUID()))
  }, [apply, offline])

  const remove = useCallback<GoalsApi['remove']>(async (seriesId) => {
    if (writesOff.current) { offline(); return false }
    const before = gRef.current
    setGoals((l) => l.filter((g) => g.series_id !== seriesId))
    const { error } = await db().from('taskflow_goals').delete().eq('series_id', seriesId)
    if (error) { setGoals(() => before); toast.show(`Couldn't delete the goal: ${friendlyDbError(error)}`); return false }
    return true
  }, [offline, setGoals, toast])

  const reorder = useCallback<GoalsApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    if (writesOff.current) { offline(); return false }
    const before = gRef.current
    const next = new Map(changes.map((c) => [c.series_id, c.sort]))
    setGoals((l) => l.map((g) => (next.has(g.series_id) ? { ...g, sort: next.get(g.series_id)! } : g)))
    const results = await Promise.all(changes.map((c) => db().from('taskflow_goals').update({ sort: c.sort }).eq('series_id', c.series_id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) { setGoals(() => before); toast.show(`Reordering failed: ${friendlyDbError(failed.error)}`); return false }
    return true
  }, [offline, setGoals, toast])

  const api = useMemo<GoalsApi>(() => ({ goals, daysOff, loading, add, edit, setPaused, remove, reorder }), [goals, daysOff, loading, add, edit, setPaused, remove, reorder])
  return <GoalsContext.Provider value={api}>{children}</GoalsContext.Provider>
}
