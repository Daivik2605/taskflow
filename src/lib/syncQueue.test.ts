import { describe, expect, it, vi } from 'vitest'
import { describeOp, isNetworkError, loses, memoryStore, rowKeys, SyncQueue, type Op, type QItem, type RunResult } from './syncQueue'

const tap = (id: string, qty = 1): Op => ({ kind: 'counter.tap', row: { id, counter_id: 'c', at: '2026-11-10T15:00:00Z', day: '2026-11-10', qty, note: null, reason: null } })
const patch = (id: string, status: string): Op => ({ kind: 'task.patch', id, patch: { status } })
const make = (run: (i: QItem) => Promise<RunResult>, store = memoryStore(), maxTries = 3) => ({ q: new SyncQueue(store, run, { maxTries }), store })
const ok = async (): Promise<RunResult> => ({ status: 'ok' })

describe('ordering', () => {
  it('sends writes in the order they were made', async () => {
    const seen: string[] = []
    const { q } = make(async (i) => { seen.push(describeOp(i.op)); return { status: 'ok' } })
    q.enqueue(tap('a')); q.enqueue(patch('t1', 'done')); q.enqueue(tap('b'))
    const s = await q.drain()
    expect(seen).toEqual(['Counter tap', 'Task completed', 'Counter tap'])
    expect(s).toMatchObject({ applied: 3, offline: false })
    expect(q.items()).toEqual([])
  })
  it('stops at the first "no network" and keeps everything, in order, without counting a try', async () => {
    let up = false
    const run = vi.fn(async (_i: QItem): Promise<RunResult> => (up ? { status: 'ok' } : { status: 'network' }))
    const { q } = make(run)
    q.enqueue(tap('a')); q.enqueue(tap('b')); q.enqueue(tap('c'))
    expect((await q.drain()).offline).toBe(true)
    expect(run).toHaveBeenCalledTimes(1) // it did not hammer the rest
    expect(q.items().map((i) => i.tries)).toEqual([0, 0, 0])
    up = true
    run.mockClear()
    await q.drain()
    expect(run.mock.calls.map((c) => (c[0] as QItem).seq)).toEqual([1, 2, 3])
    expect(q.items()).toEqual([])
  })
  it('three taps and a completed task made offline arrive as exactly those four writes, once each', async () => {
    const sent: string[] = []
    let up = false
    const { q } = make(async (i) => { if (!up) return { status: 'network' }; sent.push(describeOp(i.op)); return { status: 'ok' } })
    q.enqueue(tap('t1')); q.enqueue(tap('t2')); q.enqueue(tap('t3')); q.enqueue(patch('task', 'done'))
    await q.drain(); await q.drain()
    expect(sent).toEqual([])
    up = true
    await q.drain(); await q.drain(); await q.drain() // extra passes (a timer, an "online" event) must not resend
    expect(sent).toEqual(['Counter tap', 'Counter tap', 'Counter tap', 'Task completed'])
  })
  it('does not run two drains at once', async () => {
    let inFlight = 0, max = 0
    const { q } = make(async () => { inFlight++; max = Math.max(max, inFlight); await Promise.resolve(); inFlight--; return { status: 'ok' } })
    q.enqueue(tap('a')); q.enqueue(tap('b'))
    await Promise.all([q.drain(), q.drain()])
    expect(max).toBe(1)
  })
})

describe('saving on the device and replay', () => {
  it('writes survive closing the app: a new queue loads them and sends them in order', async () => {
    const store = memoryStore()
    const a = make(async () => ({ status: 'network' }), store).q
    a.enqueue(tap('x')); a.enqueue(tap('y'))
    await a.flush()
    const seen: number[] = []
    const b = new SyncQueue(store, async (i) => { seen.push(i.seq); return { status: 'ok' } })
    await b.load()
    expect(b.pending()).toBe(2)
    const c = b.enqueue(tap('z')) // numbering carries on after the saved ones
    expect(c.seq).toBe(3)
    await b.drain(); await b.flush()
    expect(seen).toEqual([1, 2, 3])
    expect(store.rows.size).toBe(0)
  })
  it('a write that reached the server but was not cleared before the app closed is simply sent again (replay is idempotent)', async () => {
    const store = memoryStore()
    const server = new Set<string>()
    const upsert = async (i: QItem): Promise<RunResult> => { server.add((i.op as Extract<Op, { kind: 'counter.tap' }>).row.id); return { status: 'ok' } } // an upsert on id
    const a = new SyncQueue(store, upsert)
    a.enqueue(tap('once'))
    await a.flush()
    await a.drain() // sent... but pretend the app died before the store.remove landed:
    store.rows.set(1, { seq: 1, op: tap('once'), queuedAt: '2026-11-10T15:00:00.000Z', tries: 0, status: 'pending' })
    const b = new SyncQueue(store, upsert)
    await b.load()
    await b.drain()
    expect([...server]).toEqual(['once']) // still one row
  })
})

describe('failures', () => {
  it('a refused write is tried again on later passes, then moves to the failed list after the limit', async () => {
    const { q } = make(async () => ({ status: 'error', message: 'violates foreign key' }), memoryStore(), 3)
    q.enqueue(tap('bad'))
    await q.drain(); expect(q.items()[0]).toMatchObject({ status: 'pending', tries: 1 })
    await q.drain()
    const s = await q.drain()
    expect(s.failed).toBe(1)
    expect(q.failed()[0]).toMatchObject({ status: 'failed', tries: 3, error: 'violates foreign key' })
    expect(q.pending()).toBe(0)
  })
  it('a failed write holds back later writes to the SAME row, but unrelated ones still go', async () => {
    const sent: string[] = []
    const { q } = make(async (i) => {
      if (i.op.kind === 'task.put') return { status: 'error', message: 'nope' }
      sent.push(rowKeys(i.op)[0]); return { status: 'ok' }
    }, memoryStore(), 1)
    q.enqueue({ kind: 'task.put', row: { id: 'T', title: 'x' } })
    q.enqueue(patch('T', 'done')) // depends on the create
    q.enqueue(tap('free'))
    await q.drain()
    expect(sent).toEqual(['counter_event:free'])
    expect(q.items().map((i) => i.status)).toEqual(['failed', 'pending'])
  })
  it('retry puts it back in line; discard removes it and the writes that depended on it', async () => {
    let fail = true
    const { q, store } = make(async (i) => (fail && i.op.kind === 'task.put' ? { status: 'error', message: 'nope' } : { status: 'ok' }), memoryStore(), 1)
    q.enqueue({ kind: 'task.put', row: { id: 'T', title: 'x' } }); q.enqueue(patch('T', 'done')); q.enqueue(tap('other'))
    await q.drain()
    expect(q.failed()).toHaveLength(1)
    q.retry(1); fail = false
    await q.drain(); await q.flush()
    expect(q.items()).toEqual([])
    // discard
    fail = true
    q.enqueue({ kind: 'task.put', row: { id: 'U', title: 'y' } }); q.enqueue(patch('U', 'done')); q.enqueue(tap('keep'))
    await q.drain()
    const gone = q.discard(q.failed()[0].seq)
    expect(gone.map((g) => g.op.kind)).toEqual(['task.put', 'task.patch'])
    await q.flush()
    expect(q.items()).toEqual([]) // 'keep' was unrelated and had already gone through
    expect(store.rows.size).toBe(0)
  })
  it('subscribers hear about every change', async () => {
    const { q } = make(ok)
    const cb = vi.fn()
    q.subscribe(cb)
    q.enqueue(tap('a'))
    await q.drain()
    expect(cb).toHaveBeenCalled()
  })
})

describe('conflicts: last write wins on updated_at', () => {
  const t = (iso: string) => iso
  it('a create always applies', () => { expect(loses(t('2026-11-10T10:00:00Z'), null, null)).toBe(false) })
  it('loses when the server row changed after this edit was made', () => {
    expect(loses(t('2026-11-10T10:00:00Z'), t('2026-11-10T10:05:00Z'), null)).toBe(true)
  })
  it('wins when this edit is newer than the server row', () => {
    expect(loses(t('2026-11-10T10:05:00Z'), t('2026-11-10T10:00:00Z'), null)).toBe(false)
  })
  it('our own earlier queued write (which bumped updated_at) does not count as someone else', () => {
    // two edits made offline at 10:00 and 10:01; the first reached the server at 11:00 (server time)
    expect(loses(t('2026-11-10T10:01:00Z'), t('2026-11-10T11:00:00Z'), t('2026-11-10T11:00:00Z'))).toBe(false)
    // but if someone else wrote after our write, we lose
    expect(loses(t('2026-11-10T10:01:00Z'), t('2026-11-10T11:30:00Z'), t('2026-11-10T11:00:00Z'))).toBe(true)
  })
})

describe('helpers', () => {
  it('rowKeys group the writes that belong to one row', () => {
    expect(rowKeys(tap('a'))).toEqual(['counter_event:a'])
    expect(rowKeys({ kind: 'counter.remove', id: 'a' })).toEqual(['counter_event:a'])
    expect(rowKeys({ kind: 'session.remove', id: 's' })).toEqual(rowKeys({ kind: 'activity.log', id: 's', preset: 'p', minutes: 1, ended_at: 'x' }))
  })
  it('tells "no network" from "refused"', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'x', status: 503 })).toBe(true)
    expect(isNetworkError({ code: '23503', message: 'violates foreign key' })).toBe(false)
    expect(isNetworkError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
  it('describes every kind in plain words', () => {
    expect(describeOp(patch('t', 'done'))).toBe('Task completed')
    expect(describeOp({ kind: 'activity.log', id: 'a', preset: 'p', minutes: 35, ended_at: 'x' })).toBe('Activity logged (35 min)')
    expect(describeOp(tap('a', 2))).toBe('Counter tap ×2')
  })
})
