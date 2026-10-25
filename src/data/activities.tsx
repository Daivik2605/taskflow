import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import {
  applyLogChange, buildLog, byActivitySort, nextActivitySort, validateActivity, validateLog,
  type Activity, type ActivityLog,
} from '../lib/activities'
import { db, errorMessage, friendlyDbError } from './db'

export interface NewActivity { name: string; area_id: string; default_minutes: number; weekly_target: number | null }
export type ActivityPatch = Partial<Pick<Activity, 'name' | 'area_id' | 'default_minutes' | 'weekly_target' | 'archived'>>

export interface ActivitiesApi {
  activities: Activity[] // every activity, archived included
  logs: ActivityLog[] // stopped activity sessions
  loading: boolean
  /** One tap = one stopped session of `minutes` (default: the activity's) ending at `endedAt` (default: now). Pass `id` to know the row before the save finishes (so Undo can be offered at once) and so a retry can't duplicate. */
  log: (activityId: string, opts?: { minutes?: number; endedAt?: Date; id?: string }) => Promise<ActivityLog | null>
  removeLog: (id: string) => Promise<boolean>
  /** Each resolves to a message to show next to the form, or null on success. */
  add: (input: NewActivity) => Promise<string | null>
  update: (id: string, patch: ActivityPatch) => Promise<string | null>
  reorder: (changes: { id: string; sort: number }[]) => Promise<boolean>
}

const empty: ActivitiesApi = {
  activities: [], logs: [], loading: false,
  log: async () => null, removeLog: async () => false, add: async () => null, update: async () => null, reorder: async () => false,
}
export const ActivitiesContext = createContext<ActivitiesApi>(empty)
export const useActivities = () => useContext(ActivitiesContext)

const ACTIVITY_COLUMNS = 'id,name,area_id,default_minutes,weekly_target,sort,archived'
const LOG_COLUMNS = 'id,area_id,preset_id,started_at,ended_at'
const PAGE = 1000
const nameTaken = (e: { code?: string; message: string }) => (e.code === '23505' ? 'An activity with that name already exists.' : friendlyDbError(e))

async function fetchLogs(): Promise<{ data: ActivityLog[]; error: { code?: string; message: string } | null }> {
  const rows: ActivityLog[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from('taskflow_sessions').select(LOG_COLUMNS).eq('source', 'preset').eq('state', 'stopped').not('ended_at', 'is', null)
      .order('ended_at').order('id').range(from, from + PAGE - 1)
    if (error) return { data: [], error }
    rows.push(...((data ?? []) as ActivityLog[]))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}

export function ActivitiesProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [activities, setActivitiesState] = useState<Activity[]>([])
  const [logs, setLogsState] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const aRef = useRef<Activity[]>([])
  const lRef = useRef<ActivityLog[]>([])
  const setActivities = useCallback((fn: (p: Activity[]) => Activity[]) => { aRef.current = fn(aRef.current).sort(byActivitySort); setActivitiesState(aRef.current) }, [])
  const setLogs = useCallback((fn: (p: ActivityLog[]) => ActivityLog[]) => { lRef.current = fn(lRef.current); setLogsState(lRef.current) }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const [a, l] = await Promise.all([client.from('taskflow_presets').select(ACTIVITY_COLUMNS), fetchLogs()])
      if (cancelled) return
      if (a.error) { reportError(friendlyDbError(a.error)); return }
      if (l.error) { reportError(friendlyDbError(l.error)); return }
      setActivities(() => (a.data ?? []) as Activity[])
      setLogs(() => l.data)
      setLoading(false)
    }
    void load()

    let subscribedBefore = false
    const channel = client
      .channel('taskflow-activities')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_sessions' }, (p) => {
        if (p.eventType === 'DELETE') setLogs((l) => applyLogChange(l, { type: 'DELETE', id: (p.old as { id?: string }).id }))
        else setLogs((l) => applyLogChange(l, { type: p.eventType, row: p.new as never }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_presets' }, () => {
        void client.from('taskflow_presets').select(ACTIVITY_COLUMNS).then(({ data }) => { if (data && !cancelled) setActivities(() => data as Activity[]) })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedBefore) void load()
          subscribedBefore = true
        }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void client.removeChannel(channel) }
  }, [setActivities, setLogs, reportError])

  const offline = useCallback(() => toast.show("You're offline or Supabase is unreachable — changes are turned off."), [toast])

  const log = useCallback<ActivitiesApi['log']>(async (activityId, opts = {}) => {
    if (writesOff.current) { offline(); return null }
    const activity = aRef.current.find((a) => a.id === activityId)
    if (!activity) return null
    const { minutes = activity.default_minutes, endedAt = new Date(), id = crypto.randomUUID() } = opts
    const problem = validateLog(minutes, endedAt, new Date())
    if (problem) { toast.show(problem); return null }
    const row = buildLog(activity, minutes, endedAt, id)
    setLogs((l) => (l.some((x) => x.id === id) ? l : [...l, row]))
    // The id is ours, so sending this twice (a retry, later the offline queue) is harmless: the function returns the existing row.
    const { error } = await db().rpc('taskflow_log_activity', { p_id: id, p_preset: activityId, p_minutes: minutes, p_ended_at: row.ended_at })
    if (error) {
      setLogs((l) => l.filter((x) => x.id !== id))
      toast.show(`Couldn't log ${activity.name}: ${friendlyDbError(error)}`, () => void log(activityId, { minutes, endedAt, id }))
      return null
    }
    return row
  }, [offline, setLogs, toast])

  const removeLog = useCallback<ActivitiesApi['removeLog']>(async (id) => {
    if (writesOff.current) { offline(); return false }
    const prev = lRef.current.find((l) => l.id === id)
    if (!prev) return false
    setLogs((l) => l.filter((x) => x.id !== id))
    const { error } = await db().from('taskflow_sessions').delete().eq('id', id)
    if (error) { setLogs((l) => [...l, prev]); toast.show(`Couldn't remove it: ${friendlyDbError(error)}`); return false }
    return true
  }, [offline, setLogs, toast])

  const add = useCallback<ActivitiesApi['add']>(async (input) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const problem = validateActivity(input, aRef.current)
    if (problem) return problem
    const { data, error } = await db().from('taskflow_presets')
      .insert({ name: input.name.trim(), area_id: input.area_id, default_minutes: input.default_minutes, weekly_target: input.weekly_target, sort: nextActivitySort(aRef.current) })
      .select(ACTIVITY_COLUMNS).single()
    if (error) return nameTaken(error)
    setActivities((l) => [...l, data as Activity])
    return null
  }, [offline, setActivities])

  const update = useCallback<ActivitiesApi['update']>(async (id, patch) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const prev = aRef.current.find((a) => a.id === id)
    if (!prev) return 'That activity no longer exists.'
    let body = { ...patch }
    const merged = { ...prev, ...body }
    const problem = validateActivity(merged, aRef.current, id)
    if (problem) return problem
    if (body.name !== undefined) body = { ...body, name: body.name.trim() }
    setActivities((l) => l.map((a) => (a.id === id ? { ...a, ...body } : a)))
    const { error } = await db().from('taskflow_presets').update(body).eq('id', id)
    if (error) { setActivities((l) => l.map((a) => (a.id === id ? prev : a))); return nameTaken(error) }
    return null
  }, [offline, setActivities])

  const reorder = useCallback<ActivitiesApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    if (writesOff.current) { offline(); return false }
    const before = aRef.current
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    setActivities((l) => l.map((a) => (next.has(a.id) ? { ...a, sort: next.get(a.id)! } : a)))
    const results = await Promise.all(changes.map((c) => db().from('taskflow_presets').update({ sort: c.sort }).eq('id', c.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) { setActivities(() => before); toast.show(`Reordering failed: ${errorMessage(failed.error)}`); return false }
    return true
  }, [offline, setActivities, toast])

  const api = useMemo<ActivitiesApi>(() => ({ activities, logs, loading, log, removeLog, add, update, reorder }), [activities, logs, loading, log, removeLog, add, update, reorder])
  return <ActivitiesContext.Provider value={api}>{children}</ActivitiesContext.Provider>
}
