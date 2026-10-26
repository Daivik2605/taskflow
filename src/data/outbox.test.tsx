import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../app/toast'
import type { Op, RunResult } from '../lib/syncQueue'
import { OutboxProvider, RESYNC_EVENT, useOutbox, type OutboxApi } from './outbox'

const execute = vi.fn()
vi.mock('./syncExec', () => ({ execute: (...a: unknown[]) => execute(...a) }))
vi.mock('./db', () => ({ db: () => ({}) }))

let api: OutboxApi
function Probe() { api = useOutbox(); return <p data-testid="n">{api.pending}/{api.failed.length}</p> }
const mount = () => render(<ToastProvider><OutboxProvider><Probe /></OutboxProvider></ToastProvider>)
const tap = (id: string): Op => ({ kind: 'counter.tap', row: { id, counter_id: 'c', at: '2026-11-10T15:00:00Z', day: '2026-11-10', qty: 1, note: null, reason: null } })
const network: RunResult = { status: 'network' }

beforeEach(() => { execute.mockReset() })

describe('OutboxProvider', () => {
  it('holds writes while offline, shows the count, and sends them in order when the network returns', async () => {
    execute.mockResolvedValue(network)
    mount()
    await act(async () => { api.enqueue(tap('a')); api.enqueue(tap('b')); api.enqueue(tap('c')) })
    expect(screen.getByTestId('n')).toHaveTextContent('3/0')
    expect(api.hasPending()).toBe(true)
    execute.mockClear()
    execute.mockResolvedValue({ status: 'ok' })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.getByTestId('n')).toHaveTextContent('0/0'))
    expect(execute.mock.calls.map((c) => (c[1].op.row.id))).toEqual(['a', 'b', 'c'])
    expect(api.hasPending()).toBe(false)
  })
  it('asks the screens to reload after a sync, so they show the server truth', async () => {
    execute.mockResolvedValue({ status: 'ok' })
    const heard = vi.fn()
    window.addEventListener(RESYNC_EVENT, heard)
    mount()
    await act(async () => { api.enqueue(tap('a')) })
    await waitFor(() => expect(heard).toHaveBeenCalled())
    window.removeEventListener(RESYNC_EVENT, heard)
  })
  it('tells you when an older change lost to a newer one made elsewhere', async () => {
    execute.mockResolvedValue({ status: 'skipped', reason: 'newer' })
    mount()
    await act(async () => { api.enqueue(tap('a')) })
    expect((await screen.findAllByText(/older than a newer edit made elsewhere/)).length).toBeGreaterThan(0)
  })
  it('a refused write is retried, then lands in the failed list, and Retry/Discard work', async () => {
    execute.mockResolvedValue({ status: 'error', message: 'violates foreign key' })
    mount()
    await act(async () => { api.enqueue(tap('a')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(api.failed).toHaveLength(1))
    expect(api.failed[0].error).toBe('violates foreign key')
    execute.mockResolvedValue({ status: 'ok' })
    await act(async () => { api.retry(api.failed[0].seq) })
    await waitFor(() => expect(screen.getByTestId('n')).toHaveTextContent('0/0'))
    execute.mockResolvedValue({ status: 'error', message: 'nope' })
    await act(async () => { api.enqueue(tap('z')) })
    await act(async () => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(api.failed).toHaveLength(1))
    await act(async () => { api.discard(api.failed[0].seq) })
    expect(screen.getByTestId('n')).toHaveTextContent('0/0')
  })
})
