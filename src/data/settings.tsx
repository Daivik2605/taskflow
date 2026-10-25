import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { db, friendlyDbError } from './db'

export interface SettingsApi {
  /** 0 = Sunday … 6 = Saturday; 1 (Monday) until the row loads. */
  weekStartsOn: number
  setWeekStartsOn: (day: number) => Promise<void>
}

export const SettingsContext = createContext<SettingsApi>({ weekStartsOn: 1, setWeekStartsOn: async () => {} })
export const useSettings = () => useContext(SettingsContext)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [weekStartsOn, setWeek] = useState(1)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await db().from('taskflow_settings').select('week_starts_on').maybeSingle()
      if (cancelled) return
      if (error) reportError(friendlyDbError(error))
      else if (data) setWeek((data as { week_starts_on: number }).week_starts_on)
    }
    void load()
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [reportError])

  const setWeekStartsOn = useCallback(async (day: number) => {
    if (writesDisabled) { toast.show("You're offline or Supabase is unreachable — changes are turned off."); return }
    const prev = weekStartsOn
    setWeek(day)
    const { error } = await db().from('taskflow_settings').update({ week_starts_on: day }).not('id', 'is', null)
    if (error) { setWeek(prev); toast.show(`Saving the week start failed: ${friendlyDbError(error)}`) }
  }, [writesDisabled, weekStartsOn, toast])

  const value = useMemo(() => ({ weekStartsOn, setWeekStartsOn }), [weekStartsOn, setWeekStartsOn])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
