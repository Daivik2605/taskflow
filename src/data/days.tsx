import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { emptyDay, validScale, type DayRow } from '../lib/dayPlan'
import type { Day } from '../lib/time'
import { db, fetchAll, friendlyDbError } from './db'

export type DayPatch = Partial<Omit<DayRow, 'day'>>

export interface DaysApi {
  days: DayRow[]
  loading: boolean
  /** The row for a day, or null when nothing was saved for it. */
  get: (day: Day) => DayRow | null
  /** Creates or updates one day's row. Online only (plan, mood and notes aren't queued offline); resolves false when it didn't save. */
  save: (day: Day, patch: DayPatch) => Promise<boolean>
}

const empty: DaysApi = { days: [], loading: false, get: () => null, save: async () => false }
export const DaysContext = createContext<DaysApi>(empty)
export const useDays = () => useContext(DaysContext)

const COLUMNS = 'day,top3,plan_note,plan_energy,planned_at,plan_dismissed_at,mood,energy,review_note,reviewed_at'

export function DaysProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [days, setDaysState] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<DayRow[]>([])
  const setDays = useCallback((fn: (p: DayRow[]) => DayRow[]) => { ref.current = fn(ref.current); setDaysState(ref.current) }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const { data, error } = await fetchAll<DayRow>('taskflow_days', COLUMNS, 'day')
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
      setDays(() => data)
      setLoading(false)
    }
    void load()
    let subscribedBefore = false
    const channel = client
      .channel('taskflow-days')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_days' }, () => { void load() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (subscribedBefore) void load()
          subscribedBefore = true
        }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void client.removeChannel(channel) }
  }, [setDays, reportError])

  const get = useCallback<DaysApi['get']>((day) => days.find((d) => d.day === day) ?? null, [days])

  const save = useCallback<DaysApi['save']>(async (day, patch) => {
    if (writesOff.current) { toast.show("You're offline or Supabase is unreachable — the plan, mood and notes can't be saved until you're back."); return false }
    if (![patch.mood ?? null, patch.energy ?? null, patch.plan_energy ?? null].every(validScale)) { toast.show('Mood and energy are 1 to 5.'); return false }
    if (patch.top3 && patch.top3.length > 3) { toast.show('The Top 3 holds three tasks.'); return false }
    const before = ref.current
    const prev = before.find((d) => d.day === day) ?? emptyDay(day)
    setDays((l) => (l.some((d) => d.day === day) ? l.map((d) => (d.day === day ? { ...d, ...patch } : d)) : [...l, { ...prev, ...patch }]))
    const { error } = await db().from('taskflow_days').upsert({ day, ...patch }, { onConflict: 'user_id,day' })
    if (error) { setDays(() => before); toast.show(`Saving failed: ${friendlyDbError(error)}`); return false }
    return true
  }, [setDays, toast])

  const api = useMemo<DaysApi>(() => ({ days, loading, get, save }), [days, loading, get, save])
  return <DaysContext.Provider value={api}>{children}</DaysContext.Provider>
}
