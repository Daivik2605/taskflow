import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../app/toast'
import { SyncQueue, type Op, type QItem } from '../lib/syncQueue'
import { db } from './db'
import { queueStore } from './offlineStore'
import { execute } from './syncExec'

export interface OutboxApi {
  /** Everything still waiting (pending first, then failed), oldest first. */
  items: QItem[]
  pending: number
  failed: QItem[]
  syncing: boolean
  /** Hand a write to the queue. It is saved on the device at once and sent as soon as the network allows; the caller has already updated the screen. */
  enqueue: (op: Op) => void
  /** True while writes are waiting: loads from the server must not overwrite what the screen shows until they are sent. */
  hasPending: () => boolean
  retry: (seq: number) => void
  retryAll: () => void
  discard: (seq: number) => void
}

const idle: OutboxApi = { items: [], pending: 0, failed: [], syncing: false, enqueue: () => {}, hasPending: () => false, retry: () => {}, retryAll: () => {}, discard: () => {} }
export const OutboxContext = createContext<OutboxApi>(idle)
export const useOutbox = () => useContext(OutboxContext)

/** Providers listen for this and reload from the server (after a sync, a conflict, or a discard). */
export const RESYNC_EVENT = 'taskflow-resync'
export const requestResync = () => window.dispatchEvent(new Event(RESYNC_EVENT))

const RETRY_MS = 30_000

export function OutboxProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [, bump] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const q = useRef<SyncQueue | null>(null)
  if (!q.current) q.current = new SyncQueue(queueStore, (item) => execute(db(), item))
  const queue = q.current

  const drain = useCallback(async () => {
    if (queue.pending() === 0) return
    setSyncing(true)
    const s = await queue.drain()
    setSyncing(false)
    if (s.applied + s.skipped + s.failed > 0) requestResync()
    if (s.skipped > 0) toast.show(`${s.skipped} change${s.skipped === 1 ? ' was' : 's were'} older than a newer edit made elsewhere, so the newer one was kept.`)
    if (s.failed > 0) toast.show(`${s.failed} change${s.failed === 1 ? '' : 's'} couldn't be saved. Open the sync list to retry or discard.`)
  }, [queue, toast])

  useEffect(() => {
    const off = queue.subscribe(() => bump((n) => n + 1))
    void queue.load().then(() => drain())
    const onOnline = () => void drain()
    const onVisible = () => { if (document.visibilityState === 'visible') void drain() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => void drain(), RETRY_MS)
    return () => { off(); clearInterval(id); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible) }
  }, [queue, drain])

  const enqueue = useCallback((op: Op) => { queue.enqueue(op); void drain() }, [queue, drain])
  const hasPending = useCallback(() => queue.pending() > 0, [queue])
  const retry = useCallback((seq: number) => { queue.retry(seq); void drain() }, [queue, drain])
  const retryAll = useCallback(() => { queue.retryAll(); void drain() }, [queue, drain])
  const discard = useCallback((seq: number) => { queue.discard(seq); requestResync() }, [queue])

  const items = queue.items()
  const value = useMemo<OutboxApi>(() => ({
    items, pending: items.filter((i) => i.status === 'pending').length, failed: items.filter((i) => i.status === 'failed'), syncing,
    enqueue, hasPending, retry, retryAll, discard,
  }), [items, syncing, enqueue, hasPending, retry, retryAll, discard])

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>
}
