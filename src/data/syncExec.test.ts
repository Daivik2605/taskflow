import { beforeEach, describe, expect, it } from 'vitest'
import { fakeServer } from '../test-fakeServer'
import { SyncQueue, memoryStore, type Op } from '../lib/syncQueue'
import { resetOfflineDb } from './offlineStore'
import { execute } from './syncExec'

const ev = (id: string, over: Record<string, unknown> = {}) => ({ id, counter_id: 'c-cig', at: '2026-11-10T15:00:00.000Z', day: '2026-11-10', qty: 1, note: null, reason: null, ...over })
const task = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Pass G2', status: 'todo', completed_at: null, ...over })
const make = (server: ReturnType<typeof fakeServer>) => new SyncQueue(memoryStore(), (item) => execute(server.client, item))

beforeEach(() => { resetOfflineDb() })

describe('replay is idempotent', () => {
  it('sending the same counter tap twice leaves one row', async () => {
    const server = fakeServer()
    const q = make(server)
    const op: Op = { kind: 'counter.tap', row: ev('e1') }
    q.enqueue(op); await q.drain()
    q.enqueue(op); await q.drain() // a replay of something already delivered
    expect(server.table('taskflow_counter_events')).toHaveLength(1)
  })
  it('a replayed tap does not overwrite a reason added since', async () => {
    const server = fakeServer()
    const q = make(server)
    q.enqueue({ kind: 'counter.tap', row: ev('e1') }); await q.drain()
    q.enqueue({ kind: 'counter.update', id: 'e1', patch: { reason: 'bored' } }); await q.drain()
    q.enqueue({ kind: 'counter.tap', row: ev('e1') }); await q.drain()
    expect(server.table('taskflow_counter_events')[0]).toMatchObject({ id: 'e1', reason: 'bored' })
  })
  it('an activity log goes through the same function twice and still lands once', async () => {
    const server = fakeServer()
    const q = make(server)
    const op: Op = { kind: 'activity.log', id: 'a1', preset: 'p', minutes: 35, ended_at: '2026-11-10T15:00:00.000Z' }
    q.enqueue(op); q.enqueue(op); await q.drain()
    expect(server.table('taskflow_sessions')).toHaveLength(1)
  })
  it('a timer session put twice (start, then the same state again) is one session with its segments', async () => {
    const server = fakeServer()
    const q = make(server)
    const put: Op = { kind: 'session.put', session: { id: 's1', area_id: 'a', task_id: null, source: 'timer', preset_id: null, comment: null, started_at: '2026-11-10T14:00:00Z', ended_at: null, state: 'running' }, segments: [{ id: 'g1', session_id: 's1', started_at: '2026-11-10T14:00:00Z', ended_at: null }] }
    q.enqueue(put); q.enqueue(put); await q.drain()
    expect(server.table('taskflow_sessions')).toHaveLength(1)
    expect(server.table('taskflow_session_segments')).toHaveLength(1)
  })
  it('deleting twice is fine', async () => {
    const server = fakeServer()
    server.seed('taskflow_counter_events', ev('e1'), '2026-11-10T12:00:00.000Z')
    const q = make(server)
    q.enqueue({ kind: 'counter.remove', id: 'e1' }); q.enqueue({ kind: 'counter.remove', id: 'e1' })
    const s = await q.drain()
    expect(s.applied).toBe(2)
    expect(server.table('taskflow_counter_events')).toHaveLength(0)
  })
})

describe('airplane mode: three cigarette taps and a completed task', () => {
  it('arrive exactly once each when the network comes back, even if the sync runs several times', async () => {
    const server = fakeServer()
    server.seed('taskflow_tasks', task('T1'), '2026-11-10T11:00:00.000Z')
    const q = make(server)
    server.state.down = true
    q.enqueue({ kind: 'counter.tap', row: ev('e1', { at: '2026-11-10T15:00:00.000Z' }) })
    q.enqueue({ kind: 'counter.tap', row: ev('e2', { at: '2026-11-10T15:20:00.000Z' }) })
    q.enqueue({ kind: 'counter.tap', row: ev('e3', { at: '2026-11-10T15:40:00.000Z' }) })
    q.enqueue({ kind: 'task.patch', id: 'T1', patch: { status: 'done', completed_at: '2026-11-10T15:45:00.000Z' } }, new Date('2026-11-10T15:45:00Z'))
    expect((await q.drain()).offline).toBe(true)
    expect(server.table('taskflow_counter_events')).toHaveLength(0)
    server.state.down = false
    const [a, b] = await Promise.all([q.drain(), q.drain()]) // "online" event and the timer firing together
    await q.drain()
    expect(a.applied + b.applied).toBe(4)
    expect(server.table('taskflow_counter_events').map((r) => r.id)).toEqual(['e1', 'e2', 'e3'])
    expect(server.table('taskflow_tasks')[0]).toMatchObject({ id: 'T1', status: 'done' })
    expect(q.items()).toEqual([])
  })
  it('writes made in order stay in order: a task created and completed offline ends up created then completed', async () => {
    const server = fakeServer()
    const q = make(server)
    server.state.down = true
    q.enqueue({ kind: 'task.put', row: task('N1', { title: 'New thing' }) }, new Date('2026-11-10T15:00:00Z'))
    q.enqueue({ kind: 'task.patch', id: 'N1', patch: { status: 'done' } }, new Date('2026-11-10T15:01:00Z'))
    await q.drain()
    server.state.down = false
    await q.drain()
    expect(server.state.writes).toEqual(['upsert taskflow_tasks N1', 'update taskflow_tasks N1'])
    expect(server.table('taskflow_tasks')[0]).toMatchObject({ title: 'New thing', status: 'done' })
  })
})

describe('conflicts: last write wins on updated_at', () => {
  it('an edit made offline loses to a newer edit made on another device', async () => {
    const server = fakeServer()
    server.seed('taskflow_tasks', task('T1'), '2026-11-10T11:00:00.000Z')
    const q = make(server)
    server.state.down = true
    const offlineAt = new Date('2026-11-10T11:30:00Z')
    q.enqueue({ kind: 'task.patch', id: 'T1', patch: { status: 'done' } }, offlineAt)
    await q.drain()
    server.elsewhere('taskflow_tasks', task('T1', { status: 'dropped' })) // the Mac edits it later (fake clock is after 12:00)
    server.state.down = false
    const s = await q.drain()
    expect(s).toMatchObject({ skipped: 1, applied: 0 })
    expect(server.table('taskflow_tasks')[0].status).toBe('dropped')
  })
  it('an edit made after the server row last changed wins', async () => {
    const server = fakeServer()
    server.seed('taskflow_tasks', task('T1'), '2026-11-10T11:00:00.000Z')
    const q = make(server)
    q.enqueue({ kind: 'task.patch', id: 'T1', patch: { status: 'done' } }, new Date('2026-11-10T11:30:00Z'))
    const s = await q.drain()
    expect(s.applied).toBe(1)
    expect(server.table('taskflow_tasks')[0].status).toBe('done')
  })
  it("two edits of the same task made offline both apply: the first one's write does not make the second look stale", async () => {
    const server = fakeServer()
    server.seed('taskflow_tasks', task('T1'), '2026-11-10T11:00:00.000Z')
    const q = make(server)
    q.enqueue({ kind: 'task.patch', id: 'T1', patch: { title: 'Pass G2 road test' } }, new Date('2026-11-10T11:10:00Z'))
    q.enqueue({ kind: 'task.patch', id: 'T1', patch: { status: 'done' } }, new Date('2026-11-10T11:20:00Z'))
    const s = await q.drain()
    expect(s).toMatchObject({ applied: 2, skipped: 0 })
    expect(server.table('taskflow_tasks')[0]).toMatchObject({ title: 'Pass G2 road test', status: 'done' })
  })
  it('a timer stopped on another device is not reopened by an older pause made offline', async () => {
    const server = fakeServer()
    const base = { id: 's1', area_id: 'a', task_id: null, source: 'timer', preset_id: null, comment: null, started_at: '2026-11-10T14:00:00Z' }
    server.seed('taskflow_sessions', { ...base, ended_at: null, state: 'running' }, '2026-11-10T14:00:00.000Z')
    const q = make(server)
    server.state.down = true
    q.enqueue({ kind: 'session.put', session: { ...base, ended_at: null, state: 'paused' }, segments: [{ id: 'g1', session_id: 's1', started_at: '2026-11-10T14:00:00Z', ended_at: '2026-11-10T14:20:00Z' }] }, new Date('2026-11-10T14:20:00Z'))
    await q.drain()
    server.elsewhere('taskflow_sessions', { ...base, ended_at: '2026-11-10T15:00:00Z', state: 'stopped' }, '2026-11-10T15:00:00.000Z')
    server.state.down = false
    await q.drain()
    expect(server.table('taskflow_sessions')[0].state).toBe('stopped')
  })
})

describe('errors', () => {
  it('"Failed to fetch" is a network stop, a database refusal is an error that counts', async () => {
    const server = fakeServer()
    const q = make(server)
    q.enqueue({ kind: 'counter.tap', row: ev('e1') })
    server.state.down = true
    expect((await q.drain()).offline).toBe(true)
    expect(q.items()[0].tries).toBe(0)
    server.state.down = false
    server.state.failWith = { code: '23503', message: 'violates foreign key constraint' }
    await q.drain()
    expect(q.items()[0]).toMatchObject({ tries: 1, error: 'violates foreign key constraint' })
  })
})
