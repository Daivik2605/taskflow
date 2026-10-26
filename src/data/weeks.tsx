import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import type { WeekRow } from '../lib/weekReview'
import type { Day } from '../lib/time'
import { db, fetchAll, friendlyDbError } from './db'

export interface WeeksApi {
  weeks: WeekRow[]
  loading: boolean
  get: (weekStart: Day) => WeekRow | null
  /** Creates or updates one week's review row. Online only; resolves false when it didn't save. */
  save: (weekStart: Day, patch: Partial<Omit<WeekRow, 'week_start'>>) => Promise<boolean>
}

const empty: WeeksApi = { weeks: [], loading: false, get: () => null, save: async () => false }
export const WeeksContext = createContext<WeeksApi>(empty)
export const useWeeks = () => useContext(WeeksContext)

const COLUMNS = 'week_start,note,reviewed_at'

export function WeeksProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [weeks, setWeeksState] = useState<WeekRow[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<WeekRow[]>([])
  const setWeeks = useCallback((fn: (p: WeekRow[]) => WeekRow[]) => { ref.current = fn(ref.current); setWeeksState(ref.current) }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const { data, error } = await fetchAll<WeekRow>('taskflow_weeks', COLUMNS, 'week_start')
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
      setWeeks(() => data)
      setLoading(false)
    }
    void load()
    let subscribedBefore = false
    const channel = client
      .channel('taskflow-weeks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_weeks' }, () => { void load() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedBefore) void load()
          subscribedBefore = true
        }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void client.removeChannel(channel) }
  }, [setWeeks, reportError])

  const get = useCallback<WeeksApi['get']>((weekStart) => weeks.find((w) => w.week_start === weekStart) ?? null, [weeks])

  const save = useCallback<WeeksApi['save']>(async (weekStart, patch) => {
    if (writesOff.current) { toast.show("You're offline or Supabase is unreachable — the review can't be saved until you're back."); return false }
    const before = ref.current
    const prev = before.find((w) => w.week_start === weekStart) ?? { week_start: weekStart, note: null, reviewed_at: null }
    setWeeks((l) => (l.some((w) => w.week_start === weekStart) ? l.map((w) => (w.week_start === weekStart ? { ...w, ...patch } : w)) : [...l, { ...prev, ...patch }]))
    const { error } = await db().from('taskflow_weeks').upsert({ week_start: weekStart, ...patch }, { onConflict: 'user_id,week_start' })
    if (error) { setWeeks(() => before); toast.show(`Saving failed: ${friendlyDbError(error)}`); return false }
    return true
  }, [setWeeks, toast])

  const api = useMemo<WeeksApi>(() => ({ weeks, loading, get, save }), [weeks, loading, get, save])
  return <WeeksContext.Provider value={api}>{children}</WeeksContext.Provider>
}
