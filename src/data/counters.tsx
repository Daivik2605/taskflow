import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { applyEventChange, buildEvent, byCounterSort, cleanReasons, nextCounterSort, validateCounterName, validateReasons, type Counter, type CounterEvent } from '../lib/counters'
import { db, fetchAll, friendlyDbError } from './db'

export interface CountersApi {
  counters: Counter[] // every counter, archived included
  events: CounterEvent[]
  loading: boolean
  /** One tap = one event at `at` (default now). Pass `id` to know the event before the save finishes (so Undo can be offered instantly). */
  tap: (counterId: string, opts?: { at?: Date; qty?: number; note?: string | null; reason?: string | null; id?: string }) => Promise<CounterEvent | null>
  removeEvent: (id: string) => Promise<boolean>
  /** The optional reason chip after a tap; null clears it. */
  setReason: (id: string, reason: string | null) => Promise<boolean>
  editEvent: (id: string, patch: { at?: Date; qty?: number; note?: string | null; reason?: string | null }) => Promise<boolean>
  addCounter: (input: { name: string; short_label: string | null; color: string }) => Promise<string | null>
  updateCounter: (id: string, patch: Partial<Pick<Counter, 'name' | 'short_label' | 'color' | 'archived' | 'reasons'>>) => Promise<string | null>
  reorderCounters: (changes: { id: string; sort: number }[]) => Promise<boolean>
}

const empty: CountersApi = {
  counters: [], events: [], loading: false,
  tap: async () => null, removeEvent: async () => false, setReason: async () => false, editEvent: async () => false,
  addCounter: async () => null, updateCounter: async () => null, reorderCounters: async () => false,
}
export const CountersContext = createContext<CountersApi>(empty)
export const useCounters = () => useContext(CountersContext)

const COUNTER_COLUMNS = 'id,name,short_label,color,sort,archived,reasons'
const EVENT_COLUMNS = 'id,counter_id,at,day,qty,note,reason'

export function CountersProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [counters, setCountersState] = useState<Counter[]>([])
  const [events, setEventsState] = useState<CounterEvent[]>([])
  const [loading, setLoading] = useState(true)
  const cRef = useRef<Counter[]>([])
  const eRef = useRef<CounterEvent[]>([])
  const setCounters = useCallback((fn: (p: Counter[]) => Counter[]) => { cRef.current = fn(cRef.current).sort(byCounterSort); setCountersState(cRef.current) }, [])
  const setEvents = useCallback((fn: (p: CounterEvent[]) => CounterEvent[]) => { eRef.current = fn(eRef.current); setEventsState(eRef.current) }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const [c, e] = await Promise.all([
        client.from('taskflow_counters').select(COUNTER_COLUMNS),
        fetchAll<CounterEvent>('taskflow_counter_events', EVENT_COLUMNS, 'at'),
      ])
      if (cancelled) return
      if (c.error) { reportError(friendlyDbError(c.error)); return }
      if (e.error) { reportError(friendlyDbError(e.error)); return }
      setCounters(() => (c.data ?? []) as Counter[])
      setEvents(() => e.data)
      setLoading(false)
    }
    void load()

    let subscribedBefore = false
    const channel = client
      .channel('taskflow-counters')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_counter_events' }, (p) => {
        if (p.eventType === 'DELETE') setEvents((l) => applyEventChange(l, { type: 'DELETE', id: (p.old as { id?: string }).id }))
        else setEvents((l) => applyEventChange(l, { type: p.eventType, row: p.new as CounterEvent }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_counters' }, () => {
        void client.from('taskflow_counters').select(COUNTER_COLUMNS).then(({ data }) => { if (data && !cancelled) setCounters(() => data as Counter[]) })
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
  }, [setCounters, setEvents, reportError])

  const offline = useCallback(() => toast.show("You're offline or Supabase is unreachable — changes are turned off."), [toast])

  const tap = useCallback<CountersApi['tap']>(async (counterId, opts = {}) => {
    if (writesOff.current) { offline(); return null }
    const { at = new Date(), qty = 1, note = null, reason = null, id = crypto.randomUUID() } = opts
    const ev = buildEvent(counterId, at, id, qty, note, reason)
    setEvents((l) => [...l, ev])
    const { error } = await db().from('taskflow_counter_events').insert({ id: ev.id, counter_id: ev.counter_id, at: ev.at, day: ev.day, qty: ev.qty, note: ev.note, reason: ev.reason })
    if (error) {
      setEvents((l) => l.filter((x) => x.id !== ev.id))
      toast.show(`Couldn't record that: ${friendlyDbError(error)}`, () => void tap(counterId, { at, qty, note, reason }))
      return null
    }
    return ev
  }, [offline, setEvents, toast])

  const removeEvent = useCallback<CountersApi['removeEvent']>(async (id) => {
    if (writesOff.current) { offline(); return false }
    const prev = eRef.current.find((e) => e.id === id)
    if (!prev) return false
    setEvents((l) => l.filter((e) => e.id !== id))
    const { error } = await db().from('taskflow_counter_events').delete().eq('id', id)
    if (error) { setEvents((l) => [...l, prev]); toast.show(`Couldn't remove it: ${friendlyDbError(error)}`); return false }
    return true
  }, [offline, setEvents, toast])

  const editEvent = useCallback<CountersApi['editEvent']>(async (id, patch) => {
    if (writesOff.current) { offline(); return false }
    const prev = eRef.current.find((e) => e.id === id)
    if (!prev) return false
    const reason = patch.reason !== undefined ? patch.reason : prev.reason
    const note = patch.note !== undefined ? patch.note : prev.note
    const next = patch.at ? buildEvent(prev.counter_id, patch.at, id, patch.qty ?? prev.qty, note, reason) : { ...prev, qty: patch.qty ?? prev.qty, note, reason }
    setEvents((l) => l.map((e) => (e.id === id ? next : e)))
    const { error } = await db().from('taskflow_counter_events').update({ at: next.at, qty: next.qty, note: next.note, reason: next.reason }).eq('id', id)
    if (error) { setEvents((l) => l.map((e) => (e.id === id ? prev : e))); toast.show(`Couldn't save the change: ${friendlyDbError(error)}`); return false }
    return true
  }, [offline, setEvents, toast])

  const setReason = useCallback<CountersApi['setReason']>(async (id, reason) => {
    if (writesOff.current) { offline(); return false }
    const prev = eRef.current.find((e) => e.id === id)
    if (!prev) return false
    setEvents((l) => l.map((e) => (e.id === id ? { ...e, reason } : e)))
    const { error } = await db().from('taskflow_counter_events').update({ reason }).eq('id', id)
    if (error) { setEvents((l) => l.map((e) => (e.id === id ? prev : e))); toast.show(`Couldn't save the reason: ${friendlyDbError(error)}`); return false }
    return true
  }, [offline, setEvents, toast])

  const addCounter = useCallback<CountersApi['addCounter']>(async ({ name, short_label, color }) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const problem = validateCounterName(name, cRef.current)
    if (problem) return problem
    const { data, error } = await db().from('taskflow_counters').insert({ name: name.trim(), short_label: short_label?.trim() || null, color, sort: nextCounterSort(cRef.current) }).select(COUNTER_COLUMNS).single()
    if (error) return error.code === '23505' ? 'A counter with that name already exists.' : friendlyDbError(error)
    setCounters((l) => [...l, data as Counter])
    return null
  }, [offline, setCounters])

  const updateCounter = useCallback<CountersApi['updateCounter']>(async (id, patch) => {
    if (writesOff.current) { offline(); return 'Changes are turned off while offline.' }
    const prev = cRef.current.find((c) => c.id === id)
    if (!prev) return 'That counter no longer exists.'
    let body = { ...patch }
    if (body.name !== undefined) {
      const problem = validateCounterName(body.name, cRef.current, id)
      if (problem) return problem
      body = { ...body, name: body.name.trim() }
    }
    if (body.short_label !== undefined) body = { ...body, short_label: body.short_label?.trim() || null }
    if (body.reasons !== undefined) {
      const problem = validateReasons(body.reasons ?? [])
      if (problem) return problem
      body = { ...body, reasons: cleanReasons(body.reasons ?? []) }
    }
    setCounters((l) => l.map((c) => (c.id === id ? { ...c, ...body } : c)))
    const { error } = await db().from('taskflow_counters').update(body).eq('id', id)
    if (error) { setCounters((l) => l.map((c) => (c.id === id ? prev : c))); return error.code === '23505' ? 'A counter with that name already exists.' : friendlyDbError(error) }
    return null
  }, [offline, setCounters])

  const reorderCounters = useCallback<CountersApi['reorderCounters']>(async (changes) => {
    if (changes.length === 0) return true
    if (writesOff.current) { offline(); return false }
    const before = cRef.current
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    setCounters((l) => l.map((c) => (next.has(c.id) ? { ...c, sort: next.get(c.id)! } : c)))
    const results = await Promise.all(changes.map((c) => db().from('taskflow_counters').update({ sort: c.sort }).eq('id', c.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) { setCounters(() => before); toast.show(`Reordering failed: ${friendlyDbError(failed.error)}`); return false }
    return true
  }, [offline, setCounters, toast])

  const api = useMemo<CountersApi>(() => ({ counters, events, loading, tap, removeEvent, setReason, editEvent, addCounter, updateCounter, reorderCounters }),
    [counters, events, loading, tap, removeEvent, setReason, editEvent, addCounter, updateCounter, reorderCounters])
  return <CountersContext.Provider value={api}>{children}</CountersContext.Provider>
}
