import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { urlToRecord } from '../pwa/publicUrl'
import { db, friendlyDbError } from './db'

export interface SettingsApi {
  /** 0 = Sunday … 6 = Saturday; 1 (Monday) until the row loads. */
  weekStartsOn: number
  setWeekStartsOn: (day: number) => Promise<void>
  /** Leave screens that are still placeholders out of the phone's More list (default on). */
  hideUnfinished: boolean
  setHideUnfinished: (hide: boolean) => Promise<void>
  /** "Still going?" asks after this many hours of one running stretch (1 to 24). */
  stillGoingHours: number
  setStillGoingHours: (hours: number) => Promise<void>
}

export const SettingsContext = createContext<SettingsApi>({ weekStartsOn: 1, setWeekStartsOn: async () => {}, hideUnfinished: true, setHideUnfinished: async () => {}, stillGoingHours: 4, setStillGoingHours: async () => {} })
export const useSettings = () => useContext(SettingsContext)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [weekStartsOn, setWeek] = useState(1)
  const [hideUnfinished, setHide] = useState(true)
  const [stillGoingHours, setStill] = useState(4)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await db().from('taskflow_settings').select('week_starts_on,taskflow_url,hide_unfinished_screens,still_going_hours').maybeSingle()
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
      if (!data) return
      const row = data as { week_starts_on: number; taskflow_url: string | null; hide_unfinished_screens: boolean; still_going_hours: number }
      setWeek(row.week_starts_on)
      setHide(row.hide_unfinished_screens)
      setStill(row.still_going_hours)
      // Remember the deployed address once, from whichever device opens it first (never localhost, a LAN address or a preview URL).
      const url = urlToRecord(window.location.origin, row.taskflow_url)
      if (url) await db().from('taskflow_settings').update({ taskflow_url: url }).not('id', 'is', null)
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

  const setHideUnfinished = useCallback(async (hide: boolean) => {
    if (writesDisabled) { toast.show("You're offline or Supabase is unreachable — changes are turned off."); return }
    const prev = hideUnfinished
    setHide(hide)
    const { error } = await db().from('taskflow_settings').update({ hide_unfinished_screens: hide }).not('id', 'is', null)
    if (error) { setHide(prev); toast.show(`Saving that setting failed: ${friendlyDbError(error)}`) }
  }, [writesDisabled, hideUnfinished, toast])

  const setStillGoingHours = useCallback(async (hours: number) => {
    if (writesDisabled) { toast.show("You're offline or Supabase is unreachable — changes are turned off."); return }
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) { toast.show('Pick a whole number of hours from 1 to 24.'); return }
    const prev = stillGoingHours
    setStill(hours)
    const { error } = await db().from('taskflow_settings').update({ still_going_hours: hours }).not('id', 'is', null)
    if (error) { setStill(prev); toast.show(`Saving that setting failed: ${friendlyDbError(error)}`) }
  }, [writesDisabled, stillGoingHours, toast])

  const value = useMemo(() => ({ weekStartsOn, setWeekStartsOn, hideUnfinished, setHideUnfinished, stillGoingHours, setStillGoingHours }), [weekStartsOn, setWeekStartsOn, hideUnfinished, setHideUnfinished, stillGoingHours, setStillGoingHours])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
