import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionProvider } from '../app/connection'
import { ToastProvider } from '../app/toast'
import { ActivitiesProvider, useActivities, type ActivitiesApi } from './activities'
import { OutboxContext, type OutboxApi } from './outbox'
import type { Op } from '../lib/syncQueue'

const rpc = vi.fn()
const deleteEq = vi.fn()
const queued: Op[] = []
const outbox: OutboxApi = { items: [], pending: 0, failed: [], syncing: false, enqueue: (op) => { queued.push(op) }, hasPending: () => false, retry: () => {}, retryAll: () => {}, discard: () => {} }
const PRESET = { id: 'p-gym', name: 'Gym', area_id: 'a-gym', default_minutes: 60, weekly_target: 3, sort: 0, archived: false }

// A chainable stand-in for the Supabase client: every builder step returns itself and awaiting it gives the table's rows.
function builder(rows: unknown[]) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order', 'range', 'insert', 'update']) b[m] = () => b
  b.delete = () => ({ eq: (...a: unknown[]) => Promise.resolve(deleteEq(...a)) })
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok)
  return b
}
const client = {
  from: (table: string) => builder(table === 'taskflow_presets' ? [PRESET] : []),
  rpc: (...a: unknown[]) => rpc(...a),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c },
  removeChannel: vi.fn(),
}
vi.mock('./db', () => ({
  db: () => client,
  errorMessage: (e: { message: string }) => e.message,
  friendlyDbError: (e: { message: string }) => e.message,
}))

let api: ActivitiesApi
function Probe() { api = useActivities(); return <p data-testid="n">{api.logs.length}</p> }
const mount = async () => {
  render(<ConnectionProvider><ToastProvider><OutboxContext.Provider value={outbox}><ActivitiesProvider><Probe /></ActivitiesProvider></OutboxContext.Provider></ToastProvider></ConnectionProvider>)
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => { queued.length = 0; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')); rpc.mockReset(); deleteEq.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); deleteEq.mockResolvedValue({ error: null }) })
afterEach(() => vi.useRealTimers())

describe('ActivitiesProvider.log', () => {
  it('shows the log at once and queues one write with the client id, so a replay cannot duplicate', async () => {
    await mount()
    let row: Awaited<ReturnType<ActivitiesApi['log']>> = null
    await act(async () => { row = await api.log('p-gym', { id: 'client-id-1' }) })
    expect(queued).toEqual([{ kind: 'activity.log', id: 'client-id-1', preset: 'p-gym', minutes: 60, ended_at: '2026-11-10T15:00:00.000Z' }])
    expect(row).toMatchObject({ id: 'client-id-1', preset_id: 'p-gym', area_id: 'a-gym', started_at: '2026-11-10T14:00:00.000Z', ended_at: '2026-11-10T15:00:00.000Z' })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
    expect(rpc).not.toHaveBeenCalled() // the queue sends it, not the provider
  })
  it('makes its own id when none is given, and uses the activity default minutes', async () => {
    await mount()
    await act(async () => { await api.log('p-gym') })
    const op = queued[0] as Extract<Op, { kind: 'activity.log' }>
    expect(op.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(op.minutes).toBe(60)
  })
  it('using the same id twice leaves one log on screen', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { id: 'same' }); await api.log('p-gym', { id: 'same' }) })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })
  it('refuses a time in the future without queueing', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { endedAt: new Date('2026-11-10T18:00:00Z') }) })
    expect(queued).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(/future/)
  })
  it('refuses bad minutes and an unknown activity', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { minutes: 0 }); await api.log('nope') })
    expect(queued).toHaveLength(0)
  })
  it('keeps working with the network off (the write just waits in the queue)', async () => {
    await mount()
    act(() => { window.dispatchEvent(new Event('offline')) })
    await act(async () => { await api.log('p-gym') })
    expect(queued).toHaveLength(1)
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })
})

describe('ActivitiesProvider.removeLog (Undo)', () => {
  it('queues a delete by id and drops it from the screen', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { id: 'u1' }) })
    await act(async () => { await api.removeLog('u1') })
    expect(queued[1]).toEqual({ kind: 'session.remove', id: 'u1' })
    expect(screen.getByTestId('n')).toHaveTextContent('0')
  })
  it('does nothing for a log it does not have', async () => {
    await mount()
    await act(async () => { expect(await api.removeLog('ghost')).toBe(false) })
    expect(queued).toHaveLength(0)
  })
})
