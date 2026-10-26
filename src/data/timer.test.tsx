import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionProvider } from '../app/connection'
import { ToastProvider } from '../app/toast'
import { AreasContext } from './areas'
import { OutboxContext, type OutboxApi } from './outbox'
import { TimerProvider, useTimer, type TimerApi } from './timer'
import * as ops from './timerOps'
import { resetOfflineDb } from './offlineStore'
import { newSession, pastSession, stop } from '../lib/timer'
import type { Op } from '../lib/syncQueue'
import { AREAS, fakeAreasApi } from '../test-utils'

const handlers: Record<string, (p: unknown) => void> = {}
vi.mock('./db', () => ({
  db: () => {
    const channel: Record<string, unknown> = {}
    channel.on = (_t: string, f: { table: string }, cb: (p: unknown) => void) => { handlers[f.table] = cb; return channel }
    channel.subscribe = () => channel
    return { channel: () => channel, removeChannel: vi.fn() }
  },
  friendlyDbError: (e: { message: string }) => e.message,
}))
vi.mock('./timerOps', async () => {
  const real = await vi.importActual<typeof import('./timerOps')>('./timerOps')
  return { ...real, loadSessions: vi.fn() }
})
const loadSessions = ops.loadSessions as unknown as ReturnType<typeof vi.fn>

let api: TimerApi
const queued: Op[] = []
const outbox: OutboxApi = { items: [], pending: 0, failed: [], syncing: false, enqueue: (op) => { queued.push(op) }, hasPending: () => false, retry: () => {}, retryAll: () => {}, discard: () => {} }
function Grab() { api = useTimer(); return <p data-testid="s">{api.loading ? 'loading' : `n=${api.sessions.length} active=${api.active?.id ?? 'none'} state=${api.active?.state ?? '-'}`}</p> }
const wrap = (ui: ReactNode) => render(
  <ConnectionProvider><ToastProvider><OutboxContext.Provider value={outbox}><AreasContext.Provider value={fakeAreasApi(AREAS)}><TimerProvider>{ui}</TimerProvider></AreasContext.Provider></OutboxContext.Provider></ToastProvider></ConnectionProvider>,
)
const old = () => stop(newSession('old', 'og', { areaId: 'a-sql' }, new Date('2026-10-01T14:00:00Z')), new Date('2026-10-01T15:00:00Z'))
const status = () => screen.getByTestId('s').textContent
const puts = () => queued.filter((o): o is Extract<Op, { kind: 'session.put' }> => o.kind === 'session.put')

beforeEach(() => {
  resetOfflineDb()
  vi.clearAllMocks()
  queued.length = 0
  for (const k of Object.keys(handlers)) delete handlers[k]
  loadSessions.mockResolvedValue({ data: [], error: null })
})

describe('TimerProvider', () => {
  it('loads sessions; a running one found on load is the active timer (reopening keeps it)', async () => {
    loadSessions.mockResolvedValue({ data: [old(), newSession('run', 'rg', { areaId: 'a-dsa' }, new Date())], error: null })
    wrap(<Grab />)
    await waitFor(() => expect(status()).toBe('n=2 active=run state=running'))
  })
  it('start, pause, resume, stop each update the screen at once and queue one write of the whole session', async () => {
    wrap(<Grab />)
    await waitFor(() => expect(status()).toBe('n=0 active=none state=-'))
    await act(async () => { await api.requestStart({ areaId: 'a-dsa', taskId: null, comment: 'x' }) })
    expect(status()).toMatch(/active=.+ state=running/)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].session).toMatchObject({ state: 'running', area_id: 'a-dsa' })
    expect(puts()[0].segments).toHaveLength(1)
    await act(async () => { await api.pause() })
    expect(status()).toMatch(/state=paused/)
    expect(puts()[1].session.state).toBe('paused')
    expect(puts()[1].segments[0].ended_at).not.toBeNull()
    await act(async () => { await api.resume() })
    expect(status()).toMatch(/state=running/)
    expect(puts()[2].segments).toHaveLength(2)
    await act(async () => { await api.stop({ comment: 'finished on the phone' }) })
    expect(status()).toMatch(/active=none/)
    expect(puts()[3].session).toMatchObject({ state: 'stopped', comment: 'finished on the phone' })
    // the same session id every time: replaying any of these is an upsert on that id
    expect(new Set(puts().map((p) => p.session.id)).size).toBe(1)
    expect(api.sessions[0].segments).toHaveLength(2)
  })
  it('works with the network off: the timer starts and stops locally, nothing is refused', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      wrap(<Grab />)
      await waitFor(() => expect(status()).toContain('n=0'))
      await act(async () => { expect(await api.requestStart({ areaId: 'a-dsa' })).toBe(true) })
      await act(async () => { expect(await api.stop()).toBe(true) })
      expect(puts()).toHaveLength(2)
    } finally { Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }) }
  })
  it('starting while one runs asks first; Cancel changes nothing; confirming stops then starts', async () => {
    loadSessions.mockResolvedValue({ data: [newSession('run', 'rg', { areaId: 'a-dsa' }, new Date())], error: null })
    wrap(<Grab />)
    await waitFor(() => expect(status()).toContain('active=run'))
    await act(async () => { await api.requestStart({ areaId: 'a-sql' }) })
    expect(screen.getByRole('alertdialog', { name: 'Another timer is running' })).toBeInTheDocument()
    expect(queued).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(status()).toContain('active=run')
    await act(async () => { await api.requestStart({ areaId: 'a-sql' }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop it and start' })) })
    expect(puts().map((p) => p.session.state)).toEqual(['stopped', 'running']) // order matters: stop first, so the one-running index is never hit
    expect(status()).not.toContain('active=run')
  })
  it("realtime: another device's start, pause and stop show up here", async () => {
    wrap(<Grab />)
    await waitFor(() => expect(status()).toContain('n=0'))
    const s = newSession('remote', 'rg', { areaId: 'a-dsa' }, new Date('2026-11-10T14:00:00Z'))
    const { segments, ...row } = s
    act(() => { handlers.taskflow_sessions({ eventType: 'INSERT', new: row }); handlers.taskflow_session_segments({ eventType: 'INSERT', new: segments[0] }) })
    expect(status()).toBe('n=1 active=remote state=running')
    act(() => {
      handlers.taskflow_session_segments({ eventType: 'UPDATE', new: { ...segments[0], ended_at: '2026-11-10T14:30:00.000Z' } })
      handlers.taskflow_sessions({ eventType: 'UPDATE', new: { ...row, state: 'paused' } })
    })
    expect(status()).toBe('n=1 active=remote state=paused')
    act(() => { handlers.taskflow_sessions({ eventType: 'UPDATE', new: { ...row, state: 'stopped', ended_at: '2026-11-10T14:30:00.000Z', comment: 'from phone' } }) })
    expect(status()).toBe('n=1 active=none state=-')
    expect(api.sessions[0].comment).toBe('from phone')
  })
  it('a segment for a session we never saw triggers a reload', async () => {
    wrap(<Grab />)
    await waitFor(() => expect(status()).toContain('n=0'))
    loadSessions.mockClear()
    act(() => { handlers.taskflow_session_segments({ eventType: 'INSERT', new: { id: 'z', session_id: 'unknown', started_at: '2026-11-10T14:00:00Z', ended_at: null } }) })
    await waitFor(() => expect(loadSessions).toHaveBeenCalled())
  })
  it('addPast refuses a bad span and queues a good one; edit and remove queue too', async () => {
    loadSessions.mockResolvedValue({ data: [old()], error: null })
    wrap(<Grab />)
    await waitFor(() => expect(status()).toContain('n=1'))
    await act(async () => { expect(await api.addPast({ areaId: 'a-sql', start: new Date('2026-10-01T10:00:00Z'), end: new Date('2026-10-01T09:00:00Z') })).toBe(false) })
    expect(queued).toHaveLength(0)
    const p = pastSession('x', 'xg', { areaId: 'a-sql', start: new Date('2026-10-01T10:00:00Z'), end: new Date('2026-10-01T11:00:00Z') })
    await act(async () => { expect(await api.addPast({ areaId: 'a-sql', start: new Date(p.started_at), end: new Date(p.ended_at!) })).toBe(true) })
    expect(status()).toContain('n=2')
    await act(async () => { expect(await api.edit('old', { areaId: 'a-dsa', taskId: null, comment: 'changed' })).toBeNull() })
    expect(api.sessions.find((s) => s.id === 'old')?.area_id).toBe('a-dsa')
    expect(puts()[1].replaceSegments).toBeUndefined() // tag/comment only: segments stay
    await act(async () => { await api.edit('old', { areaId: 'a-dsa', taskId: null, comment: 'changed', start: new Date('2026-10-01T14:10:00Z'), end: new Date('2026-10-01T15:00:00Z') }) })
    expect(puts()[2].replaceSegments).toBe(true)
    await act(async () => { expect(await api.remove('old')).toBe(true) })
    expect(queued[queued.length - 1]).toEqual({ kind: 'session.remove', id: 'old' })
    expect(status()).toContain('n=1')
  })
  it('waits for the sync before a reload could hide queued writes', async () => {
    outbox.hasPending = () => true
    try {
      loadSessions.mockResolvedValue({ data: [old()], error: null })
      wrap(<Grab />)
      await waitFor(() => expect(loadSessions).toHaveBeenCalled())
      expect(status()).toBe('loading') // not applied while writes are waiting
    } finally { outbox.hasPending = () => false }
  })
})
