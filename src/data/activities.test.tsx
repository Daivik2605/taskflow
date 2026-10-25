import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionProvider } from '../app/connection'
import { ToastProvider } from '../app/toast'
import { ActivitiesProvider, useActivities, type ActivitiesApi } from './activities'

const rpc = vi.fn()
const deleteEq = vi.fn()
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
  render(<ConnectionProvider><ToastProvider><ActivitiesProvider><Probe /></ActivitiesProvider></ToastProvider></ConnectionProvider>)
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')); rpc.mockReset(); deleteEq.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); deleteEq.mockResolvedValue({ error: null }) })
afterEach(() => vi.useRealTimers())

describe('ActivitiesProvider.log', () => {
  it('shows the log at once and sends the client id, so a retry cannot duplicate', async () => {
    await mount()
    let row: Awaited<ReturnType<ActivitiesApi['log']>> = null
    await act(async () => { row = await api.log('p-gym', { id: 'client-id-1' }) })
    expect(rpc).toHaveBeenCalledWith('taskflow_log_activity', { p_id: 'client-id-1', p_preset: 'p-gym', p_minutes: 60, p_ended_at: '2026-11-10T15:00:00.000Z' })
    expect(row).toMatchObject({ id: 'client-id-1', preset_id: 'p-gym', area_id: 'a-gym', started_at: '2026-11-10T14:00:00.000Z', ended_at: '2026-11-10T15:00:00.000Z' })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })
  it('makes its own id when none is given, and uses the activity default minutes', async () => {
    await mount()
    await act(async () => { await api.log('p-gym') })
    const args = rpc.mock.calls[0][1]
    expect(args.p_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(args.p_minutes).toBe(60)
  })
  it('sending the same id twice leaves one log on screen', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { id: 'same' }); await api.log('p-gym', { id: 'same' }) })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
    expect(rpc.mock.calls.map((c) => c[1].p_id)).toEqual(['same', 'same'])
  })
  it('on failure removes the row and offers Retry, which resends the SAME id', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
    await mount()
    let row: unknown = 'unset'
    await act(async () => { row = await api.log('p-gym', { id: 'retry-me' }) })
    expect(row).toBeNull()
    expect(screen.getByTestId('n')).toHaveTextContent('0')
    expect(screen.getByRole('status')).toHaveTextContent(/Couldn't log Gym: network down/)
    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1][1].p_id).toBe('retry-me')
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })
  it('refuses a time in the future without calling the database', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { endedAt: new Date('2026-11-10T18:00:00Z') }) })
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/future/)
  })
  it('refuses bad minutes', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { minutes: 0 }) })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('ignores an unknown activity', async () => {
    await mount()
    await act(async () => { await api.log('nope') })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('turns off while offline', async () => {
    await mount()
    act(() => { window.dispatchEvent(new Event('offline')) })
    await act(async () => { await api.log('p-gym') })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('ActivitiesProvider.removeLog (Undo)', () => {
  it('deletes the session by id and drops it from the screen', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { id: 'u1' }) })
    await act(async () => { await api.removeLog('u1') })
    expect(deleteEq).toHaveBeenCalledWith('id', 'u1')
    expect(screen.getByTestId('n')).toHaveTextContent('0')
  })
  it('puts the log back if the delete fails', async () => {
    await mount()
    await act(async () => { await api.log('p-gym', { id: 'u2' }) })
    deleteEq.mockResolvedValueOnce({ error: { message: 'nope' } })
    await act(async () => { await api.removeLog('u2') })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })
})
