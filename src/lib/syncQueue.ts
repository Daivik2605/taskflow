// Offline write queue (SPEC §20). Pure logic: the storage and the network are injected, so ordering, replay and conflicts are unit-tested.
// Every queued write is idempotent (an upsert or delete keyed on a client-made id), so replaying one that already reached the server is harmless.

/** What a queued write does. Later phases add kinds (captures, shifts, nap/reset) by adding a case here and a handler in data/syncExec.ts. */
export type Op =
  | { kind: 'counter.tap'; row: { id: string; counter_id: string; at: string; day: string; qty: number; note: string | null; reason: string | null } }
  | { kind: 'counter.update'; id: string; patch: { at?: string; day?: string; qty?: number; note?: string | null; reason?: string | null } }
  | { kind: 'counter.remove'; id: string }
  | { kind: 'activity.log'; id: string; preset: string; minutes: number; ended_at: string }
  | { kind: 'session.put'; session: SessionRow; segments: SegmentRow[]; replaceSegments?: boolean }
  | { kind: 'session.remove'; id: string }
  | { kind: 'task.put'; row: Record<string, unknown> & { id: string } }
  | { kind: 'task.patch'; id: string; patch: Record<string, unknown> }
  | { kind: 'task.remove'; id: string }

export interface SessionRow { id: string; area_id: string; task_id: string | null; source: string; preset_id: string | null; comment: string | null; started_at: string; ended_at: string | null; state: string }
export interface SegmentRow { id: string; session_id: string; started_at: string; ended_at: string | null }

export interface QItem {
  seq: number // order of arrival; replay is always in this order
  op: Op
  queuedAt: string // when the user did it (the clock last-write-wins compares against)
  tries: number
  status: 'pending' | 'failed'
  error?: string
}

export type RunResult =
  | { status: 'ok' }
  | { status: 'skipped'; reason: string } // a newer edit elsewhere won (last write wins)
  | { status: 'network' } // can't reach the server: stop, keep order, don't count a try
  | { status: 'error'; message: string }

export interface QueueStore {
  all(): Promise<QItem[]>
  put(item: QItem): Promise<void>
  remove(seq: number): Promise<void>
}

export const MAX_TRIES = 3

/** The rows an op touches. A failed op blocks later ops on the same row (they depend on it), never unrelated ones. */
export function rowKeys(op: Op): string[] {
  switch (op.kind) {
    case 'counter.tap': return [`counter_event:${op.row.id}`]
    case 'counter.update': case 'counter.remove': return [`counter_event:${op.id}`]
    case 'activity.log': return [`session:${op.id}`]
    case 'session.put': return [`session:${op.session.id}`]
    case 'session.remove': return [`session:${op.id}`]
    case 'task.put': return [`task:${op.row.id}`]
    case 'task.patch': case 'task.remove': return [`task:${op.id}`]
  }
}

/** Short plain-words line for the retry/discard list. */
export function describeOp(op: Op): string {
  switch (op.kind) {
    case 'counter.tap': return `Counter tap${op.row.qty > 1 ? ` ×${op.row.qty}` : ''}`
    case 'counter.update': return 'Counter tap edit'
    case 'counter.remove': return 'Counter tap removed'
    case 'activity.log': return `Activity logged (${op.minutes} min)`
    case 'session.put': return op.session.state === 'stopped' ? 'Timer session saved' : op.session.state === 'paused' ? 'Timer paused' : 'Timer running'
    case 'session.remove': return 'Session deleted'
    case 'task.put': return `Task added: ${String(op.row.title ?? '')}`
    case 'task.patch': return op.patch.status === 'done' ? 'Task completed' : op.patch.status === 'todo' ? 'Task re-opened' : 'Task changed'
    case 'task.remove': return 'Task deleted'
  }
}

/**
 * Last write wins on `updated_at`. The server row is newer than the moment this change was made, and was not written by us
 * (our own earlier queued writes also bump `updated_at`), so someone else edited it after: their edit wins and this one is dropped.
 */
export function loses(opQueuedAt: string, serverUpdatedAt: string | null, ownUpdatedAt: string | null): boolean {
  if (!serverUpdatedAt) return false // no such row yet: a create always applies
  if (ownUpdatedAt && new Date(serverUpdatedAt).getTime() <= new Date(ownUpdatedAt).getTime()) return false
  return new Date(serverUpdatedAt).getTime() > new Date(opQueuedAt).getTime()
}

/** True for failures that mean "can't reach the server right now" rather than "the server refused this write". */
export function isNetworkError(e: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!e) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (e.status !== undefined && (e.status >= 500 || e.status === 401 || e.status === 408 || e.status === 429)) return true
  return !e.code && /failed to fetch|network|load failed|timeout|offline|fetch/i.test(e.message ?? '')
}

export interface DrainSummary { applied: number; skipped: number; failed: number; offline: boolean }

export class SyncQueue {
  private list: QItem[] = []
  private nextSeq = 1
  private draining = false
  private chain: Promise<unknown> = Promise.resolve()
  private listeners = new Set<() => void>()

  constructor(private store: QueueStore, private run: (item: QItem) => Promise<RunResult>, private opts: { maxTries?: number } = {}) {}

  /** Reads what a previous session left behind (writes made before the app was closed). */
  async load(): Promise<void> {
    const saved = (await this.store.all()).sort((a, b) => a.seq - b.seq)
    const known = new Set(this.list.map((i) => i.seq))
    this.list = [...saved.filter((i) => !known.has(i.seq)), ...this.list].sort((a, b) => a.seq - b.seq)
    this.nextSeq = this.list.reduce((m, i) => Math.max(m, i.seq), 0) + 1
    this.emit()
  }

  items(): QItem[] { return this.list }
  pending(): number { return this.list.filter((i) => i.status === 'pending').length }
  failed(): QItem[] { return this.list.filter((i) => i.status === 'failed') }
  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  private emit() { this.list = [...this.list]; this.listeners.forEach((l) => l()) }
  private persist(fn: () => Promise<void>) { this.chain = this.chain.then(fn).catch(() => undefined) }

  /** Adds a write at the end. Synchronous for the caller (the optimistic UI never waits); saving to the device follows in order. */
  enqueue(op: Op, at: Date = new Date()): QItem {
    const item: QItem = { seq: this.nextSeq++, op, queuedAt: at.toISOString(), tries: 0, status: 'pending' }
    this.list.push(item)
    this.persist(() => this.store.put(item))
    this.emit()
    return item
  }

  /** Waits until everything handed to the device store has been written (used by tests and before closing). */
  async flush(): Promise<void> { await this.chain }

  /** Sends pending writes in order. Stops at the first "can't reach the server". A refused write is retried on later passes, and after MAX_TRIES it moves to the failed list. */
  async drain(): Promise<DrainSummary> {
    const sum: DrainSummary = { applied: 0, skipped: 0, failed: 0, offline: false }
    if (this.draining) return sum
    this.draining = true
    const max = this.opts.maxTries ?? MAX_TRIES
    try {
      const blocked = new Set(this.failed().flatMap((i) => rowKeys(i.op)))
      for (const item of [...this.list].sort((a, b) => a.seq - b.seq)) {
        if (item.status !== 'pending') continue
        const keys = rowKeys(item.op)
        if (keys.some((k) => blocked.has(k))) continue
        const r = await this.run(item)
        if (r.status === 'network') { sum.offline = true; break }
        if (r.status === 'ok' || r.status === 'skipped') {
          this.list = this.list.filter((i) => i.seq !== item.seq)
          this.persist(() => this.store.remove(item.seq))
          if (r.status === 'ok') sum.applied++; else sum.skipped++
        } else {
          item.tries++
          item.error = r.message
          if (item.tries >= max) { item.status = 'failed'; sum.failed++ }
          keys.forEach((k) => blocked.add(k))
          this.persist(() => this.store.put({ ...item }))
        }
        this.emit()
      }
    } finally {
      this.draining = false
      this.emit()
    }
    return sum
  }

  /** Puts a failed write back in line (at its old place) for another go. */
  retry(seq: number): void {
    const item = this.list.find((i) => i.seq === seq)
    if (!item || item.status !== 'failed') return
    item.status = 'pending'; item.tries = 0; item.error = undefined
    this.persist(() => this.store.put({ ...item }))
    this.emit()
  }
  retryAll(): void { this.failed().forEach((i) => this.retry(i.seq)) }

  /** Throws a write away, together with later writes that only make sense after it (same row). */
  discard(seq: number): QItem[] {
    const item = this.list.find((i) => i.seq === seq)
    if (!item) return []
    const keys = new Set(rowKeys(item.op))
    const gone = this.list.filter((i) => i.seq === seq || (i.seq > seq && rowKeys(i.op).some((k) => keys.has(k))))
    this.list = this.list.filter((i) => !gone.includes(i))
    gone.forEach((g) => this.persist(() => this.store.remove(g.seq)))
    this.emit()
    return gone
  }
}

/** In-memory store: the fallback when IndexedDB is unavailable (private mode), and what the unit tests use. */
export function memoryStore(): QueueStore & { rows: Map<number, QItem> } {
  const rows = new Map<number, QItem>()
  return {
    rows,
    all: async () => [...rows.values()].map((r) => structuredClone(r)),
    put: async (i) => { rows.set(i.seq, structuredClone(i)) },
    remove: async (s) => { rows.delete(s) },
  }
}
