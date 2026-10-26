import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SyncQueue, type Op, type QItem } from '../lib/syncQueue'
import { cacheGet, cacheSet, kvDelete, kvGet, kvSet, queueStore, resetOfflineDb } from './offlineStore'

const op = (id: string): Op => ({ kind: 'counter.tap', row: { id, counter_id: 'c', at: '2026-11-10T15:00:00Z', day: '2026-11-10', qty: 1, note: null, reason: null } })
const item = (seq: number): QItem => ({ seq, op: op(`e${seq}`), queuedAt: '2026-11-10T15:00:00.000Z', tries: 0, status: 'pending' })

beforeEach(async () => {
  await new Promise<void>((r) => { const d = indexedDB.deleteDatabase('taskflow-offline'); d.onsuccess = () => r(); d.onerror = () => r(); d.onblocked = () => r() })
  resetOfflineDb()
})

describe('IndexedDB store', () => {
  it('keeps queued writes across a restart, in order', async () => {
    await queueStore.put(item(2)); await queueStore.put(item(1))
    resetOfflineDb() // "close the app, open it again"
    expect((await queueStore.all()).map((i) => i.seq).sort()).toEqual([1, 2])
    await queueStore.remove(1)
    expect((await queueStore.all()).map((i) => i.seq)).toEqual([2])
  })
  it('a real SyncQueue on it: taps made "offline" are still there after a restart and go out in order', async () => {
    const a = new SyncQueue(queueStore, async () => ({ status: 'network' }))
    a.enqueue(op('a')); a.enqueue(op('b')); a.enqueue(op('c'))
    await a.flush()
    resetOfflineDb()
    const sent: string[] = []
    const b = new SyncQueue(queueStore, async (i) => { sent.push((i.op as Extract<Op, { kind: 'counter.tap' }>).row.id); return { status: 'ok' } })
    await b.load()
    await b.drain(); await b.flush()
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(await queueStore.all()).toEqual([])
  })
  it('stores small values and the cached copy of loaded data', async () => {
    await kvSet('own:taskflow_tasks:T1', '2026-11-10T12:00:00Z')
    expect(await kvGet('own:taskflow_tasks:T1')).toBe('2026-11-10T12:00:00Z')
    await kvDelete('own:taskflow_tasks:T1')
    expect(await kvGet('own:taskflow_tasks:T1')).toBeUndefined()
    await cacheSet('tasks', [{ id: 'T1', title: 'Pass G2' }])
    resetOfflineDb()
    expect(await cacheGet('tasks')).toEqual([{ id: 'T1', title: 'Pass G2' }])
  })
})
