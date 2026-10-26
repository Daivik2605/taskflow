import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionProvider } from '../app/connection'
import { ToastProvider } from '../app/toast'
import { task as makeTask } from '../lib/fixtures'
import type { Op } from '../lib/syncQueue'
import { CountersProvider, useCounters, type CountersApi } from './counters'
import { OutboxContext, type OutboxApi } from './outbox'
import { TasksProvider, useTasks, type TasksApi } from './tasks'

const TASK = makeTask({ id: 'T1', title: 'Pass G2' })
const COUNTER = { id: 'c-cig', name: 'Cigarette', short_label: 'Cig', color: '#000000', sort: 0, archived: false, reasons: null }
function builder(rows: unknown[]) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order', 'range']) b[m] = () => b
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok)
  return b
}
const client = {
  from: (t: string) => builder(t === 'taskflow_tasks' ? [TASK] : t === 'taskflow_counters' ? [COUNTER] : []),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c },
  removeChannel: vi.fn(),
}
vi.mock('./db', () => ({
  db: () => client,
  fetchAll: async (t: string) => ({ data: t === 'taskflow_tasks' ? [TASK] : [], error: null }),
  errorMessage: (e: { message: string }) => e.message,
  friendlyDbError: (e: { message: string }) => e.message,
}))

const queued: Op[] = []
const outbox: OutboxApi = { items: [], pending: 0, failed: [], syncing: false, enqueue: (op) => { queued.push(op) }, hasPending: () => false, retry: () => {}, retryAll: () => {}, discard: () => {} }

let counters: CountersApi, tasks: TasksApi
function Probe() {
  counters = useCounters(); tasks = useTasks()
  const done = tasks.tasks.find((t) => t.id === 'T1')?.status
  return <p data-testid="s">{`taps=${counters.events.length} task=${done ?? 'none'}`}</p>
}
const mount = async () => {
  render(<ConnectionProvider><ToastProvider><OutboxContext.Provider value={outbox}><CountersProvider><TasksProvider><Probe /></TasksProvider></CountersProvider></OutboxContext.Provider></ToastProvider></ConnectionProvider>)
  await waitFor(() => expect(counters.loading || tasks.loading).toBe(false))
}

beforeEach(() => { queued.length = 0 })

describe('airplane mode at the screen level', () => {
  it('3 taps and a completed task show at once and are queued as exactly those 4 writes', async () => {
    await mount()
    act(() => { window.dispatchEvent(new Event('offline')) })
    await act(async () => { await counters.tap('c-cig', { id: 'e1' }); await counters.tap('c-cig', { id: 'e2', reason: 'bored' }); await counters.tap('c-cig', { id: 'e3' }) })
    await act(async () => { await tasks.setDone('T1', true) })
    expect(screen.getByTestId('s')).toHaveTextContent('taps=3 task=done')
    expect(queued.map((o) => o.kind)).toEqual(['counter.tap', 'counter.tap', 'counter.tap', 'task.patch'])
    expect((queued[1] as Extract<Op, { kind: 'counter.tap' }>).row.reason).toBe('bored')
    expect((queued[3] as Extract<Op, { kind: 'task.patch' }>).patch).toMatchObject({ status: 'done' })
  })
  it('the same tap id twice shows once; Undo (remove) and a late reason are queued after it', async () => {
    await mount()
    await act(async () => { await counters.tap('c-cig', { id: 'dup' }); await counters.tap('c-cig', { id: 'dup' }) })
    expect(screen.getByTestId('s')).toHaveTextContent('taps=1')
    await act(async () => { await counters.setReason('dup', 'stress') })
    await act(async () => { await counters.removeEvent('dup') })
    expect(screen.getByTestId('s')).toHaveTextContent('taps=0')
    expect(queued.map((o) => o.kind)).toEqual(['counter.tap', 'counter.tap', 'counter.update', 'counter.remove'])
  })
  it('a task added offline appears at once and is queued as a create with a client id', async () => {
    await mount()
    let row: Awaited<ReturnType<TasksApi['add']>> = null
    await act(async () => { row = await tasks.add({ title: 'Call bank' }) })
    expect(row).not.toBeNull()
    expect(tasks.tasks.some((t) => t.title === 'Call bank')).toBe(true)
    const op = queued[0] as Extract<Op, { kind: 'task.put' }>
    expect(op.kind).toBe('task.put')
    expect(op.row.id).toBe(row!.id)
  })
})
