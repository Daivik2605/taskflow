import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useNow } from '../app/useNow'
import { useToast } from '../app/toast'
import { useActivities } from './activities'
import { useAreas } from './areas'
import { friendlyDbError } from './db'
import { db } from './db'
import * as ops from './timerOps'
import { RESYNC_EVENT, useOutbox } from './outbox'
import { useOfflineCache } from './useOfflineCache'
import {
  activeSession, applyTimerChange, taskMinutes as taskMinutesOf, byStart, newSession, pastSession, pause as pauseS, resume as resumeS, sessionIntervals, stop as stopS, validateEndedAt, validateSpan,
  type Interval, type Session, type TimerChange,
} from '../lib/timer'
import { elapsedMs } from '../lib/timer'
import { formatDuration } from '../lib/time'
import { tagPath } from '../lib/tags'

export interface StartInput { areaId: string; taskId?: string | null; comment?: string | null }
export interface PastInput { areaId: string; taskId?: string | null; comment?: string | null; start: Date; end: Date }

export interface TimerApi {
  sessions: Session[] // timer and manual sessions (activity-button logs are in useActivities)
  loading: boolean
  active: Session | null
  /** All-time minutes logged per task id (timer sessions; an open one counts up to now). */
  taskMinutes: Map<string, number>
  /** Starts a timer. With one already running or paused, asks first (stop it and start this, or cancel). Resolves true once started. */
  requestStart: (input: StartInput) => Promise<boolean>
  pause: () => Promise<boolean>
  resume: () => Promise<boolean>
  /** `endedAt` = "it ended at…". `comment` replaces the comment when given. */
  stop: (opts?: { endedAt?: Date; comment?: string | null }) => Promise<boolean>
  setComment: (id: string, comment: string | null) => Promise<boolean>
  addPast: (input: PastInput) => Promise<boolean>
  edit: (id: string, patch: { areaId: string; taskId: string | null; comment: string | null; start?: Date; end?: Date }) => Promise<string | null>
  remove: (id: string) => Promise<boolean>
}

const nope = async () => false
const empty: TimerApi = {
  sessions: [], loading: false, active: null, taskMinutes: new Map(), requestStart: nope, pause: nope, resume: nope, stop: nope, setComment: nope, addPast: nope, edit: async () => null, remove: nope,
}
export const TimerContext = createContext<TimerApi>(empty)
export const useTimer = () => useContext(TimerContext)

/** Every stretch of time on a tag: activity-button logs plus timer segments (an open one runs to now). Goals, Insights and the Time card read this. */
export function useTimeIntervals(): Interval[] {
  const { logs } = useActivities()
  const { sessions } = useTimer()
  const now = useNow(30_000)
  return useMemo(() => [...logs, ...sessionIntervals(sessions, now)], [logs, sessions, now])
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { reportError } = useConnection()
  const toast = useToast()
  const { areas } = useAreas()
  const [sessions, setState] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<StartInput | null>(null)
  const ref = useRef<Session[]>([])
  const set = useCallback((fn: (p: Session[]) => Session[]) => { ref.current = fn(ref.current).sort(byStart); setState(ref.current) }, [])
  const outbox = useOutbox()
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox
  const loadedRef = useRef(false)

  useOfflineCache('timer', sessions, !loading, (saved) => { set(() => saved); setLoading(false) }, () => loadedRef.current)

  useEffect(() => {
    const client = db()
    let cancelled = false
    const load = async () => {
      const { data, error } = await ops.loadSessions()
      if (cancelled) return
      if (error) { reportError(friendlyDbError(error)); return }
      if (outboxRef.current.hasPending()) return // writes are waiting to be sent; a reload follows the sync
      loadedRef.current = true
      set(() => data)
      setLoading(false)
    }
    void load()
    const apply = (c: TimerChange) => { const next = applyTimerChange(ref.current, c); if (next === null) void load(); else set(() => next) }
    let subscribedBefore = false
    const channel = client
      .channel('taskflow-timer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_sessions' }, (p) => {
        apply(p.eventType === 'DELETE' ? { table: 'session', type: 'DELETE', id: (p.old as { id?: string }).id } : { table: 'session', type: p.eventType, row: p.new as never })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskflow_session_segments' }, (p) => {
        apply(p.eventType === 'DELETE' ? { table: 'segment', type: 'DELETE', id: (p.old as { id?: string }).id } : { table: 'segment', type: p.eventType, row: p.new as never })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { if (subscribedBefore) void load(); subscribedBefore = true }
      })
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    const onResync = () => void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(RESYNC_EVENT, onResync)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener(RESYNC_EVENT, onResync); void client.removeChannel(channel) }
  }, [set, reportError])

  const active = activeSession(sessions)
  const clockNow = useNow(30_000)
  const taskMinutes = useMemo(() => taskMinutesOf(sessionIntervals(sessions, clockNow)), [sessions, clockNow])

  // Every timer action updates the screen at once and goes through the offline queue as one idempotent write of the whole session.
  const send = useCallback((s: Session, opts: { replaceSegments?: boolean } = {}) => outboxRef.current.enqueue(ops.putOp(s, opts)), [])

  const start = useCallback(async (input: StartInput): Promise<boolean> => {
    const s = newSession(crypto.randomUUID(), crypto.randomUUID(), input, new Date())
    set((l) => [...l, s])
    send(s)
    return true
  }, [send, set])

  const stopWith = useCallback(async (opts: { endedAt?: Date; comment?: string | null } = {}): Promise<boolean> => {
    const before = activeSession(ref.current)
    if (!before) return false
    const now = new Date()
    if (opts.endedAt) { const p = validateEndedAt(before, opts.endedAt, now); if (p) { toast.show(p); return false } }
    const next = stopS(before, now, opts)
    set((l) => l.map((s) => (s.id === before.id ? next : s)))
    send(next)
    return true
  }, [send, set, toast])

  const requestStart = useCallback<TimerApi['requestStart']>(async (input) => {
    if (activeSession(ref.current)) { setPending(input); return false }
    return start(input)
  }, [start])

  const confirmPending = async () => {
    const input = pending
    setPending(null)
    if (!input) return
    if (await stopWith()) await start(input)
  }

  const pause = useCallback<TimerApi['pause']>(async () => {
    const before = activeSession(ref.current)
    if (!before || before.state !== 'running') return false
    const next = pauseS(before, new Date())
    set((l) => l.map((s) => (s.id === before.id ? next : s)))
    send(next)
    return true
  }, [send, set])

  const resume = useCallback<TimerApi['resume']>(async () => {
    const before = activeSession(ref.current)
    if (!before || before.state !== 'paused') return false
    const next = resumeS(before, crypto.randomUUID(), new Date())
    set((l) => l.map((s) => (s.id === before.id ? next : s)))
    send(next)
    return true
  }, [send, set])

  const setComment = useCallback<TimerApi['setComment']>(async (id, comment) => {
    const before = ref.current.find((s) => s.id === id)
    if (!before) return false
    const next = { ...before, comment: comment?.trim() || null }
    set((l) => l.map((s) => (s.id === id ? next : s)))
    send(next)
    return true
  }, [send, set])

  const addPast = useCallback<TimerApi['addPast']>(async (input) => {
    const p = validateSpan(input.start, input.end, new Date())
    if (p) { toast.show(p); return false }
    const s = pastSession(crypto.randomUUID(), crypto.randomUUID(), input)
    set((l) => [...l, s])
    send(s)
    return true
  }, [send, set, toast])

  const edit = useCallback<TimerApi['edit']>(async (id, patch) => {
    const before = ref.current.find((s) => s.id === id)
    if (!before || before.state !== 'stopped') return 'Only a finished session can be edited.'
    let next: Session = { ...before, area_id: patch.areaId, task_id: patch.taskId, comment: patch.comment?.trim() || null }
    let times = false
    if (patch.start && patch.end) {
      const p = validateSpan(patch.start, patch.end, new Date())
      if (p) return p
      const span = pastSession(id, crypto.randomUUID(), { areaId: patch.areaId, start: patch.start, end: patch.end })
      if (span.started_at !== before.started_at || span.ended_at !== before.ended_at) { next = { ...next, started_at: span.started_at, ended_at: span.ended_at, segments: span.segments }; times = true }
    }
    set((l) => l.map((s) => (s.id === id ? next : s)))
    send(next, { replaceSegments: times })
    return null
  }, [send, set])

  const remove = useCallback<TimerApi['remove']>(async (id) => {
    if (!ref.current.some((s) => s.id === id)) return false
    set((l) => l.filter((s) => s.id !== id))
    outboxRef.current.enqueue(ops.removeOp(id))
    return true
  }, [set])

  const api = useMemo<TimerApi>(() => ({ sessions, loading, active, taskMinutes, requestStart, pause, resume, stop: stopWith, setComment, addPast, edit, remove }),
    [sessions, loading, active, taskMinutes, requestStart, pause, resume, stopWith, setComment, addPast, edit, remove])

  return (
    <TimerContext.Provider value={api}>
      {children}
      {pending && active && (
        <div role="alertdialog" aria-label="Another timer is running" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 lg:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <p className="font-medium">A timer is already {active.state === 'paused' ? 'paused' : 'running'}.</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{tagPath(areas, active.area_id)} · {formatDuration(elapsedMs(active, new Date()) / 60_000)}. Stop it now and start the new one?</p>
            <div className="flex gap-2">
              <button className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-4 font-medium text-white" onClick={() => void confirmPending()}>Stop it and start</button>
              <button className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 font-medium dark:border-slate-700" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </TimerContext.Provider>
  )
}
